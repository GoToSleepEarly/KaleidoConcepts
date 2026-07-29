import { afterEach, describe, expect, test, vi } from "vitest";

import { getLessonChatDraft, recordLessonChatAiGeneration, type LessonChatDb } from "./lesson-chat";

describe("getLessonChatDraft", () => {
  test("normalizes an empty Step2 course to GPT 5.5", async () => {
    const updates: unknown[] = [];
    const result = await getLessonChatDraft(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            llmModel: "deepseek_chat",
            lessonDraft: null,
          }),
          update: async (query) => {
            updates.push(query);
            return {};
          },
        },
        lessonChatDraft: {
          findUnique: async () => null,
        },
      } as unknown as LessonChatDb,
      "course-1",
    );

    expect(result.llmModel).toBe("gpt_5_5");
    expect(updates).toEqual([
      {
        where: { id: "course-1" },
        data: { llmModel: "gpt_5_5" },
      },
    ]);
  });

  test("keeps DeepSeek on courses that already have Step2 content", async () => {
    const updates: unknown[] = [];
    const result = await getLessonChatDraft(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            llmModel: "deepseek_chat",
            lessonDraft: null,
          }),
          update: async (query) => {
            updates.push(query);
            return {};
          },
        },
        lessonChatDraft: {
          findUnique: async () => ({
            courseId: "course-1",
            draftText: "",
            messages: [
              {
                id: "message-1",
                role: "user",
                content: "start",
                createdAt: "2026-07-29T00:00:00.000Z",
              },
            ],
          }),
        },
      } as unknown as LessonChatDb,
      "course-1",
    );

    expect(result.llmModel).toBe("deepseek_chat");
    expect(updates).toEqual([]);
  });
});

describe("recordLessonChatAiGeneration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("persists one request-level AI generation log", async () => {
    const created: unknown[] = [];
    const db = {
      aiGenerationLog: {
        create: async (query: { data: unknown }) => {
          created.push(query.data);
          return {};
        },
      },
    } as unknown as LessonChatDb;

    await recordLessonChatAiGeneration(db, {
      courseId: "course-1",
      feature: "lesson_chat",
      intent: "outline",
      llmModel: "deepseek_chat",
      input: { userMessage: "start with a mystery" },
      outputText: "故事题目：The Mystery",
      status: "succeeded",
      latencyMs: 1200,
    });

    expect(created).toEqual([
      {
        courseId: "course-1",
        feature: "lesson_chat",
        intent: "outline",
        llmModel: "deepseek_chat",
        input: { userMessage: "start with a mystery" },
        outputText: "故事题目：The Mystery",
        status: "succeeded",
        latencyMs: 1200,
      },
    ]);
  });

  test("does not throw when log persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const db = {
      aiGenerationLog: {
        create: async () => {
          throw new Error("database unavailable");
        },
      },
    } as unknown as LessonChatDb;

    await expect(
      recordLessonChatAiGeneration(db, {
        courseId: "course-1",
        feature: "lesson_chat",
        intent: "draft",
        llmModel: "gpt_5_5",
        input: { userMessage: "confirm" },
        outputText: "",
        status: "failed",
        errorMessage: "AI request failed",
        latencyMs: 800,
      }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
