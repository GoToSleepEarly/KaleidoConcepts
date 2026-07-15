import { describe, expect, test } from "vitest";

import type { LessonContentDraft, StoryOption } from "@/lib/contracts/api";

import {
  claimLessonDraftGeneration,
  getLessonDraft,
  markLessonDraftGenerationFailed,
  markLessonDraftGenerationSucceeded,
  saveLessonDraft,
  validateLessonDraft,
} from "./lesson-drafts";

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "The Forest Gate",
  storyline:
    "The teacher guides the students through a magical forest gate and finds the safe trail.",
  chapters: [
    {
      title: "The Gate Opens",
      summary:
        "The class reaches the glowing gate and follows the first safe trail.",
    },
  ],
};

const draft: LessonContentDraft = {
  schemaVersion: "lesson_content_v1",
  sourceStoryOptionId: "option-1",
  generationMode: "ai",
  title: "The Forest Gate",
  language: "en",
  castAliases: [{ alias: "SummerStudent", displayName: "Summer" }],
  closingReading: {
    title: "After the Forest Gate",
    sentences: [
      "Summer remembered the forest gate.",
      "She followed clues and felt brave.",
    ],
    vocabularyTerms: ["gate", "clue"],
  },
  chapters: [
    {
      id: "chapter-1",
      sourceOutlineChapterIndex: 1,
      title: "The Gate Opens",
      paragraphs: [
        {
          id: "chapter-1-paragraph-1",
          order: 1,
          sentences: [
            {
              id: "c1p1s1",
              text: "Summer walked into the forest with Ms. Lin.",
              segments: [
                { type: "text", text: "Summer " },
                { type: "exercise", exerciseId: "chapter-1-exercise-1" },
                { type: "text", text: " into the forest with Ms. Lin." },
              ],
            },
            {
              id: "c1p1s2",
              text: "There was a silver gate near the river.",
              segments: [
                { type: "exercise", exerciseId: "chapter-1-exercise-2" },
                { type: "text", text: " a silver gate near the river." },
              ],
            },
          ],
        },
        {
          id: "chapter-1-paragraph-2",
          order: 2,
          sentences: [
            {
              id: "c1p2s1",
              text: "Summer found a clue under the gate.",
              segments: [
                { type: "text", text: "Summer found a " },
                { type: "exercise", exerciseId: "chapter-1-exercise-3" },
                { type: "text", text: " under the gate." },
              ],
            },
          ],
        },
      ],
      exercises: [
        {
          id: "chapter-1-exercise-1",
          order: 1,
          type: "given_word_blank",
          targetCategory: "grammar",
          target: "Past Simple",
          sentenceId: "c1p1s1",
          answer: "walked",
          prompt: "walk",
          baseWord: "walk",
        },
        {
          id: "chapter-1-exercise-2",
          order: 2,
          type: "given_word_blank",
          targetCategory: "grammar",
          target: "There be",
          sentenceId: "c1p1s2",
          answer: "There was",
          prompt: "there / be",
          baseWord: "be",
        },
        {
          id: "chapter-1-exercise-3",
          order: 3,
          type: "vocab_hint",
          targetCategory: "vocab",
          target: "Vocabulary",
          sentenceId: "c1p2s1",
          answer: "clue",
          hint: "线索",
          pattern: "c _ _ e",
          letterCount: 4,
        },
      ],
    },
  ],
};

describe("lesson content draft validation", () => {
  test("accepts a lesson_content_v1 draft", () => {
    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
  });

  test("allows an empty closing vocabulary list when no hint exercise is generated", () => {
    const withoutVocabulary = structuredClone(draft);
    withoutVocabulary.closingReading.vocabularyTerms = [];
    expect(validateLessonDraft(withoutVocabulary, storyOption)).toEqual(
      withoutVocabulary,
    );
  });

  test("rejects image-coupled lesson_draft_v1 content", () => {
    expect(() =>
      validateLessonDraft(
        {
          ...draft,
          schemaVersion: "lesson_draft_v1",
        } as unknown as LessonContentDraft,
        storyOption,
      ),
    ).toThrow("课文草稿信息不完整");
  });

  test("rejects exercises that are not represented in sentence segments", () => {
    const invalid = structuredClone(draft);
    invalid.chapters[0].paragraphs[0].sentences[0].segments = [
      { type: "text", text: "Summer walked into the forest with Ms. Lin." },
    ];

    expect(() => validateLessonDraft(invalid, storyOption)).toThrow(
      "第 1 章练习未嵌入正文：chapter-1-exercise-1",
    );
  });
});

describe("lesson draft repository", () => {
  test("loads a saved draft with succeeded generation state", async () => {
    const result = await getLessonDraft(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({
              id: true,
              selectedStoryOptionId: true,
              llmModel: true,
              lessonDraftGenStatus: true,
              lessonDraftGenStartedAt: true,
              lessonDraftGenError: true,
            });
            return {
              id: "course-1",
              selectedStoryOptionId: "option-1",
              llmModel: "deepseek_chat",
              lessonDraftGenStatus: "succeeded",
              lessonDraftGenStartedAt: null,
              lessonDraftGenError: null,
            };
          },
          updateMany: async () => {
            throw new Error("should not release a completed draft");
          },
        },
        courseStoryOption: {
          findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
        },
        courseLessonDraft: {
          findUnique: async ({ where }) => {
            expect(where).toEqual({ courseId: "course-1" });
            return {
              courseId: "course-1",
              sourceStoryOptionId: "option-1",
              content: draft,
            };
          },
        },
      },
      "course-1",
    );

    expect(result.draft?.title).toBe("The Forest Gate");
    expect(result.generation).toEqual({
      status: "succeeded",
      startedAt: null,
      error: null,
    });
  });

  test("reports a running generation with its started timestamp", async () => {
    const startedAt = new Date(Date.now() - 60_000);
    const result = await getLessonDraft(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            selectedStoryOptionId: "option-1",
            llmModel: "deepseek_chat",
            lessonDraftGenStatus: "running",
            lessonDraftGenStartedAt: startedAt,
            lessonDraftGenError: null,
          }),
          updateMany: async () => {
            throw new Error("should not release an in-window generation");
          },
        },
        courseStoryOption: {
          findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
        },
        courseLessonDraft: {
          findUnique: async () => null,
        },
      },
      "course-1",
    );

    expect(result.draft).toBeNull();
    expect(result.generation).toEqual({
      status: "running",
      startedAt: startedAt.toISOString(),
      error: null,
    });
  });

  test("releases a stuck running generation past the timeout as failed", async () => {
    const startedAt = new Date(Date.now() - 1_000_000);
    let released = false;
    const result = await getLessonDraft(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            selectedStoryOptionId: "option-1",
            llmModel: "deepseek_chat",
            lessonDraftGenStatus: "running",
            lessonDraftGenStartedAt: startedAt,
            lessonDraftGenError: null,
          }),
          updateMany: async ({ where, data }) => {
            expect(where).toEqual({
              id: "course-1",
              lessonDraftGenStatus: "running",
            });
            expect(data.lessonDraftGenStatus).toBe("failed");
            expect(data.lessonDraftGenError).toBe("生成超时未完成，请重新生成");
            released = true;
            return { count: 1 };
          },
        },
        courseStoryOption: {
          findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
        },
        courseLessonDraft: {
          findUnique: async () => null,
        },
      },
      "course-1",
    );

    expect(released).toBe(true);
    expect(result.draft).toBeNull();
    expect(result.generation.status).toBe("failed");
    expect(result.generation.error).toBe("生成超时未完成，请重新生成");
  });

  test("claims an idle generation lock", async () => {
    let updated = false;
    const claimed = await claimLessonDraftGeneration(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            selectedStoryOptionId: "option-1",
            llmModel: "deepseek_chat",
            lessonDraftGenStatus: "idle",
            lessonDraftGenStartedAt: null,
            lessonDraftGenError: null,
          }),
          updateMany: async ({ where, data }) => {
            expect(where.id).toBe("course-1");
            expect(where.lessonDraftGenStatus).toEqual({
              in: ["idle", "failed"],
            });
            expect(data.lessonDraftGenStatus).toBe("running");
            expect(data.lessonDraftGenStartedAt).toBeInstanceOf(Date);
            expect(data.lessonDraftGenError).toBeNull();
            updated = true;
            return { count: 1 };
          },
        },
      },
      "course-1",
    );

    expect(updated).toBe(true);
    expect(claimed.claimed).toBe(true);
    expect(claimed.generation.status).toBe("running");
    expect(claimed.generation.startedAt).not.toBeNull();
  });

  test("does not claim when a generation is already running", async () => {
    const startedAt = new Date(Date.now() - 30_000);
    const claimed = await claimLessonDraftGeneration(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            selectedStoryOptionId: "option-1",
            llmModel: "deepseek_chat",
            lessonDraftGenStatus: "running",
            lessonDraftGenStartedAt: startedAt,
            lessonDraftGenError: null,
          }),
          updateMany: async () => ({ count: 0 }),
        },
      },
      "course-1",
    );

    expect(claimed.claimed).toBe(false);
    expect(claimed.generation).toEqual({
      status: "running",
      startedAt: startedAt.toISOString(),
      error: null,
    });
  });

  test("marks a generation succeeded", async () => {
    let data: Record<string, unknown> | null = null;
    await markLessonDraftGenerationSucceeded(
      {
        course: {
          update: async (query) => {
            expect(query.where).toEqual({ id: "course-1" });
            data = query.data;
            return {};
          },
        },
      },
      "course-1",
    );

    expect(data).toEqual({
      lessonDraftGenStatus: "succeeded",
      lessonDraftGenError: null,
    });
  });

  test("marks a generation failed with a reason", async () => {
    let data: Record<string, unknown> | null = null;
    await markLessonDraftGenerationFailed(
      {
        course: {
          update: async (query) => {
            expect(query.where).toEqual({ id: "course-1" });
            data = query.data;
            return {};
          },
        },
      },
      "course-1",
      "boom",
    );

    expect(data).toEqual({
      lessonDraftGenStatus: "failed",
      lessonDraftGenError: "boom",
    });
  });

  test("saves a valid draft for the selected story option", async () => {
    const result = await saveLessonDraft(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({
              id: true,
              selectedStoryOptionId: true,
              llmModel: true,
              lessonDraftGenStatus: true,
              lessonDraftGenStartedAt: true,
              lessonDraftGenError: true,
            });
            return {
              id: "course-1",
              selectedStoryOptionId: "option-1",
              llmModel: "deepseek_chat",
              lessonDraftGenStatus: "succeeded",
              lessonDraftGenStartedAt: null,
              lessonDraftGenError: null,
            };
          },
        },
        courseStoryOption: {
          findFirst: async ({ where }) => {
            expect(where).toEqual({ courseId: "course-1", id: "option-1" });
            return { ...storyOption, courseId: "course-1" };
          },
        },
        courseLessonDraft: {
          upsert: async ({ where, update, create }) => {
            expect(where).toEqual({ courseId: "course-1" });
            expect(update.sourceStoryOptionId).toBe("option-1");
            expect(create.courseId).toBe("course-1");
            return {
              courseId: "course-1",
              sourceStoryOptionId: "option-1",
              content: update.content,
            };
          },
        },
      },
      "course-1",
      draft,
    );

    expect(result.draft.sourceStoryOptionId).toBe("option-1");
  });

  test("recomputes derived fields when saving an edited answer", async () => {
    const edited = structuredClone(draft);
    const vocabExercise = edited.chapters[0].exercises[2];
    expect(vocabExercise.type).toBe("vocab_hint");
    vocabExercise.answer = "signal";
    // Frontend leaves stale derived values; the save path must overwrite them.
    if (vocabExercise.type === "vocab_hint") {
      vocabExercise.pattern = "stale";
      vocabExercise.letterCount = 999;
    }

    let savedContent: LessonContentDraft | null = null;
    const result = await saveLessonDraft(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            selectedStoryOptionId: "option-1",
            llmModel: "deepseek_chat",
            lessonDraftGenStatus: "succeeded",
            lessonDraftGenStartedAt: null,
            lessonDraftGenError: null,
          }),
        },
        courseStoryOption: {
          findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
        },
        courseLessonDraft: {
          upsert: async ({ update }) => {
            savedContent = update.content;
            return {
              courseId: "course-1",
              sourceStoryOptionId: "option-1",
              content: update.content,
            };
          },
        },
      },
      "course-1",
      edited,
    );

    const savedVocab = result.draft.chapters[0].exercises[2];
    expect(savedVocab.type).toBe("vocab_hint");
    if (savedVocab.type === "vocab_hint") {
      expect(savedVocab.pattern).toBe("s _ _ _ _ l");
      expect(savedVocab.letterCount).toBe(6);
    }
    expect(result.draft.chapters[0].paragraphs[1].sentences[0].text).toBe(
      "Summer found a signal under the gate.",
    );
    expect(result.draft.closingReading.vocabularyTerms).toEqual(["signal"]);
    expect(savedContent).not.toBeNull();
  });

  test("rejects an answer duplicated within the chapter", async () => {
    const edited = structuredClone(draft);
    edited.chapters[0].exercises[1].answer = "walked";

    await expect(
      saveLessonDraft(
        {
          course: {
            findUnique: async () => ({
              id: "course-1",
              selectedStoryOptionId: "option-1",
              lessonDraftGenStatus: "succeeded",
              lessonDraftGenStartedAt: null,
              lessonDraftGenError: null,
            }),
          },
          courseStoryOption: {
            findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
          },
          courseLessonDraft: {
            upsert: async () => {
              throw new Error("should not upsert a chapter with duplicate answers");
            },
          },
        },
        "course-1",
        edited,
      ),
    ).rejects.toThrow("重复答案");
  });

  test("rejects an answer that appears more than once in its sentence", async () => {
    const edited = structuredClone(draft);
    // "forest" already appears in the trailing text segment of this sentence.
    edited.chapters[0].exercises[0].answer = "forest";

    await expect(
      saveLessonDraft(
        {
          course: {
            findUnique: async () => ({
              id: "course-1",
              selectedStoryOptionId: "option-1",
              lessonDraftGenStatus: "succeeded",
              lessonDraftGenStartedAt: null,
              lessonDraftGenError: null,
            }),
          },
          courseStoryOption: {
            findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
          },
          courseLessonDraft: {
            upsert: async () => {
              throw new Error("should not upsert an ambiguous blank");
            },
          },
        },
        "course-1",
        edited,
      ),
    ).rejects.toThrow("恰好出现一次");
  });
});
