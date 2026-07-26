import { z } from "zod";

import {
  generateLessonChatOutline,
  outlineActions,
  streamLessonChatDraft,
  type LessonChatIntent,
} from "@/lib/server/ai/lesson-chat-generator";
import { getDb } from "@/lib/server/db";
import { getStoryGenerationContext } from "@/lib/server/repositories/courses";
import { createChatMessage, getLessonChatDraft, saveLessonChatDraft } from "@/lib/server/repositories/lesson-chat";

const messageSchema = z.object({
  message: z.string().trim().min(1),
  draftText: z.string().optional(),
  intent: z.enum(["outline", "draft", "revise"]).optional(),
  llmModel: z.enum(["deepseek_chat", "gpt_5_5"]).optional(),
});

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function inferIntent(intent: LessonChatIntent | undefined, message: string, draftText: string): LessonChatIntent {
  if (intent) return intent;
  if (draftText.trim()) return "revise";
  if (/确认.*大纲|生成最终文案|final lesson/i.test(message)) return "draft";
  return "outline";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return new Response(sse("error", { message: "请输入要发送给 AI 的内容" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let heartbeatSeconds = 0;
      const sendEvent = (event: string, data: unknown) => {
        if (!isClosed) controller.enqueue(encoder.encode(sse(event, data)));
      };
      const heartbeat = setInterval(() => {
        heartbeatSeconds += 8;
        sendEvent("status", {
          message:
            heartbeatSeconds < 16
              ? "AI 正在整理故事方向..."
              : heartbeatSeconds < 40
                ? "AI 正在生成内容，请稍等..."
                : "AI 仍在处理长文案，请继续等待...",
        });
      }, 8000);

      try {
        const db = getDb();
        const [chat, context] = await Promise.all([getLessonChatDraft(db, id), getStoryGenerationContext(db, id)]);
        if (!context) throw new Error("课程不存在");

        const llmModel = parsed.data.llmModel ?? chat.llmModel;
        if (llmModel !== chat.llmModel) {
          await db.course.update({ where: { id }, data: { llmModel } });
        }

        const currentDraft = parsed.data.draftText ?? chat.draftText;
        const intent = inferIntent(parsed.data.intent, parsed.data.message, currentDraft);

        if (intent === "outline") {
          sendEvent("status", { message: "正在生成简单故事大纲..." });
          const outline = await generateLessonChatOutline({
            context,
            messages: chat.messages,
            userMessage: parsed.data.message,
            llmModel,
          });
          const messages = [
            ...chat.messages,
            createChatMessage("user", parsed.data.message),
            createChatMessage("assistant", outline, outlineActions),
          ];

          await saveLessonChatDraft(db, id, messages, currentDraft);
          sendEvent("assistant", { message: outline, actions: outlineActions });
          sendEvent("done", { ok: true });
          return;
        }

        sendEvent("status", { message: intent === "revise" ? "正在改写右侧最终文案..." : "正在生成右侧最终文案..." });
        sendEvent("draft_reset", { draftText: "" });

        let draftText = "";
        for await (const delta of streamLessonChatDraft({
          context,
          messages: chat.messages,
          userMessage: parsed.data.message,
          currentDraft,
          llmModel,
        })) {
          draftText += delta;
          sendEvent("draft_delta", { text: delta });
        }

        const assistantReply =
          intent === "revise"
            ? "已按你的要求更新右侧最终文案。"
            : "已基于确认的大纲生成最终文案。你可以继续在聊天框里提出小改，确认无误后点击页面右上角进入下一步。";
        const messages = [...chat.messages, createChatMessage("user", parsed.data.message), createChatMessage("assistant", assistantReply)];
        sendEvent("status", { message: "正在保存最终文案..." });
        await saveLessonChatDraft(db, id, messages, draftText);

        sendEvent("draft", { draftText });
        sendEvent("assistant", { message: assistantReply });
        sendEvent("done", { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 共创失败";
        sendEvent("error", { message });
      } finally {
        clearInterval(heartbeat);
        isClosed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
