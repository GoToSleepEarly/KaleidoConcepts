import { z } from "zod";

import {
  generateLessonChatDirections,
  shouldRequestVisualAnchorInput,
  streamLessonChatDraft,
  supportsLessonChatWebSearch,
  visualAnchorInputRequest,
  type LessonChatIntent,
} from "@/lib/server/ai/lesson-chat-generator";
import { getDb } from "@/lib/server/db";
import { getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  createChatMessage,
  getLessonChatDraft,
  saveLessonChatDraft,
} from "@/lib/server/repositories/lesson-chat";

const messageSchema = z.object({
  message: z.string().trim().min(1),
  draftText: z.string().optional(),
  intent: z.enum(["story_options", "draft", "revise"]).optional(),
  llmModel: z.enum(["deepseek_chat", "gpt_5_5"]).optional(),
  webSearchEnabled: z.boolean().optional(),
});

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function inferIntent(intent: LessonChatIntent | undefined, message: string, draftText: string): LessonChatIntent {
  if (intent) return intent;
  if (draftText.trim()) return "revise";
  if (/3\s*个方向|三个方向|没有.*想法|没.*想法|方案|方向/.test(message)) return "story_options";
  return "draft";
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
              ? "AI 正在规划故事结构与题目..."
              : heartbeatSeconds < 40
                ? "AI 正在生成正文，首段内容可能需要一点时间..."
                : "AI 仍在生成长文教案，请继续等待...",
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
        const webSearchRequested = Boolean(parsed.data.webSearchEnabled);
        const webSearchEnabled = webSearchRequested && supportsLessonChatWebSearch();

        sendEvent("status", { message: "正在理解你的要求..." });
        if (webSearchRequested && !webSearchEnabled) {
          sendEvent("notice", {
            message: "当前模型链路暂未接入可验证的联网搜索。请在输入框补充参考故事大概或角色形象，我会基于你提供的内容生成。",
          });
        }

        if (intent === "story_options") {
          sendEvent("status", { message: "正在生成 3 个故事方向..." });
          const options = await generateLessonChatDirections({
            context,
            messages: chat.messages,
            userMessage: parsed.data.message,
            llmModel,
            webSearchEnabled,
          });
          const assistantReply = "我先给你 3 个故事方向，选择一个后可以直接生成完整文本教案。";
          const messages = [...chat.messages, createChatMessage("user", parsed.data.message), createChatMessage("assistant", assistantReply)];

          await saveLessonChatDraft(db, id, messages, currentDraft);
          sendEvent("story_options", { options });
          sendEvent("assistant", { message: assistantReply });
          sendEvent("done", { ok: true });
          return;
        }

        if (
          intent === "draft" &&
          shouldRequestVisualAnchorInput({
            message: parsed.data.message,
            currentDraft,
            webSearchEnabled,
          })
        ) {
          const assistantReply = visualAnchorInputRequest(parsed.data.message);
          const messages = [...chat.messages, createChatMessage("user", parsed.data.message), createChatMessage("assistant", assistantReply)];
          await saveLessonChatDraft(db, id, messages, currentDraft);
          sendEvent("assistant", { message: assistantReply });
          sendEvent("done", { ok: true });
          return;
        }

        sendEvent("status", { message: intent === "revise" ? "正在改写右侧文本教案..." : "正在生成右侧文本教案..." });
        sendEvent("draft_reset", { draftText: "" });

        let draftText = "";
        for await (const delta of streamLessonChatDraft({
          context,
          messages: chat.messages,
          userMessage: parsed.data.message,
          currentDraft,
          llmModel,
          webSearchEnabled,
        })) {
          draftText += delta;
          sendEvent("draft_delta", { text: delta });
        }

        const assistantReply = intent === "revise" ? "已按你的要求更新右侧文本教案。" : "已生成一版完整文本教案，你可以继续通过聊天让我局部修改。";
        const messages = [...chat.messages, createChatMessage("user", parsed.data.message), createChatMessage("assistant", assistantReply)];
        sendEvent("status", { message: "正在保存文本教案..." });
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
