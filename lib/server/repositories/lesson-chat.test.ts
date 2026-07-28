import { afterEach, describe, expect, test, vi } from "vitest";

import { recordLessonChatAiGeneration, type LessonChatDb } from "./lesson-chat";

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
