import { z } from "zod";

import {
  generateLessonChatOutline,
  outlineActions,
  streamLessonChatDraft,
  type LessonChatIntent,
} from "@/lib/server/ai/lesson-chat-generator";
import { getDb } from "@/lib/server/db";
import { getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  createChatMessage,
  getLessonChatDraft,
  recordLessonChatAiGeneration,
  saveLessonChatDraft,
} from "@/lib/server/repositories/lesson-chat";

const messageSchema = z.object({
  message: z.string().trim().min(1),
  draftText: z.string().optional(),
  intent: z.enum(["outline", "draft", "revise"]).optional(),
  llmModel: z.enum(["deepseek_chat", "gpt_5_5"]).optional(),
});

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function inferIntent(
  intent: LessonChatIntent | undefined,
  message: string,
  draftText: string,
): LessonChatIntent {
  if (intent) return intent;
  if (draftText.trim()) return "revise";
  if (/确认.*大纲|生成最终文案|final lesson/i.test(message)) return "draft";
  return "outline";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = messageSchema.safeParse(
    await request.json().catch(() => null),
  );

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
        if (isClosed) return false;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
          return true;
        } catch {
          isClosed = true;
          return false;
        }
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
      const startedAt = Date.now();
      let db: ReturnType<typeof getDb> | null = null;
      let logInput: Record<string, unknown> | null = null;
      let logIntent: LessonChatIntent = parsed.data.intent ?? "outline";
      let logModel = parsed.data.llmModel ?? "gpt_5_5";
      let logOutput = "";
      let streamedDraftText = "";
      let recoverableMessages: ReturnType<typeof createChatMessage>[] | null =
        null;
      let lastDraftSaveAt = 0;
      let lastDraftSaveLength = 0;

      const saveRecoverableDraft = async (force = false) => {
        if (!db || !recoverableMessages) return;
        const now = Date.now();
        if (
          !force &&
          streamedDraftText.length - lastDraftSaveLength < 1000 &&
          now - lastDraftSaveAt < 3000
        ) {
          return;
        }

        await saveLessonChatDraft(
          db,
          id,
          recoverableMessages,
          streamedDraftText,
        );
        lastDraftSaveAt = now;
        lastDraftSaveLength = streamedDraftText.length;
      };

      try {
        db = getDb();
        const [chat, context] = await Promise.all([
          getLessonChatDraft(db, id),
          getStoryGenerationContext(db, id),
        ]);
        if (!context) throw new Error("课程不存在");

        const llmModel = parsed.data.llmModel ?? chat.llmModel;
        logModel = llmModel;
        if (llmModel !== chat.llmModel) {
          await db.course.update({ where: { id }, data: { llmModel } });
        }

        const currentDraft = parsed.data.draftText ?? chat.draftText;
        const intent = inferIntent(
          parsed.data.intent,
          parsed.data.message,
          currentDraft,
        );
        logIntent = intent;
        logInput = {
          course: context.course,
          teacher: context.teacher,
          students: context.students,
          priorMessages: chat.messages,
          userMessage: parsed.data.message,
          currentDraft,
          requestedIntent: parsed.data.intent ?? null,
          resolvedIntent: intent,
        };

        if (intent === "outline") {
          sendEvent("status", { message: "正在生成简单故事大纲..." });
          const outline = await generateLessonChatOutline({
            context,
            messages: chat.messages,
            userMessage: parsed.data.message,
            llmModel,
          });
          logOutput = outline;
          const messages = [
            ...chat.messages,
            createChatMessage("user", parsed.data.message),
            createChatMessage("assistant", outline, outlineActions),
          ];

          await saveLessonChatDraft(db, id, messages, currentDraft);
          await recordLessonChatAiGeneration(db, {
            courseId: id,
            feature: "lesson_chat",
            intent,
            llmModel,
            input: logInput,
            outputText: outline,
            status: "succeeded",
            latencyMs: Date.now() - startedAt,
          });
          sendEvent("assistant", { message: outline, actions: outlineActions });
          sendEvent("done", { ok: true });
          return;
        }

        sendEvent("status", {
          message:
            intent === "revise"
              ? "正在改写右侧最终文案..."
              : "正在生成右侧最终文案...",
        });
        sendEvent("draft_reset", { draftText: "" });

        streamedDraftText = "";
        recoverableMessages = [
          ...chat.messages,
          createChatMessage("user", parsed.data.message),
          createChatMessage(
            "assistant",
            "最终文案生成被刷新或网络中断时，右侧会保留已保存片段。可以继续提出修改要求，或重新确认大纲生成完整文案。",
          ),
        ];
        await saveRecoverableDraft(true);

        for await (const delta of streamLessonChatDraft({
          context,
          messages: chat.messages,
          userMessage: parsed.data.message,
          currentDraft,
          llmModel,
        })) {
          streamedDraftText += delta;
          await saveRecoverableDraft();
          sendEvent("draft_delta", { text: delta });
        }
        await saveRecoverableDraft(true);
        logOutput = streamedDraftText;

        const assistantReply =
          intent === "revise"
            ? "已按你的要求更新右侧最终文案。"
            : "已基于确认的大纲生成最终文案。你可以继续在聊天框里提出小改，确认无误后点击页面右上角进入下一步。";
        const messages = [
          ...chat.messages,
          createChatMessage("user", parsed.data.message),
          createChatMessage("assistant", assistantReply),
        ];
        sendEvent("status", { message: "正在保存最终文案..." });
        await saveLessonChatDraft(db, id, messages, streamedDraftText);
        await recordLessonChatAiGeneration(db, {
          courseId: id,
          feature: "lesson_chat",
          intent,
          llmModel,
          input: logInput,
          outputText: streamedDraftText,
          status: "succeeded",
          latencyMs: Date.now() - startedAt,
        });

        sendEvent("draft", { draftText: streamedDraftText });
        sendEvent("assistant", { message: assistantReply });
        sendEvent("done", { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 共创失败";
        await saveRecoverableDraft(true);
        if (db) {
          await recordLessonChatAiGeneration(db, {
            courseId: id,
            feature: "lesson_chat",
            intent: logIntent,
            llmModel: logModel,
            input: logInput ?? {
              userMessage: parsed.data.message,
              requestedIntent: parsed.data.intent ?? null,
              draftText: parsed.data.draftText ?? null,
            },
            outputText: logOutput || streamedDraftText,
            status: "failed",
            errorMessage: message,
            latencyMs: Date.now() - startedAt,
          });
        }
        sendEvent("error", { message });
      } finally {
        clearInterval(heartbeat);
        isClosed = true;
        try {
          controller.close();
        } catch {
          // The browser may have refreshed or closed the SSE request.
        }
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
