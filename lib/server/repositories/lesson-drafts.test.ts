import { describe, expect, test } from "vitest";

import type { LessonContentDraft, StoryOption } from "@/lib/contracts/api";

import { getLessonDraft, saveLessonDraft, validateLessonDraft } from "./lesson-drafts";

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "The Forest Gate",
  storyline: "The teacher guides the students through a magical forest gate and finds the safe trail.",
  chapters: [
    {
      title: "The Gate Opens",
      summary: "The class reaches the glowing gate and follows the first safe trail.",
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
    sentences: ["Summer remembered the forest gate.", "She followed clues and felt brave."],
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
        { id: "chapter-1-exercise-1", order: 1, type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "walked", prompt: "walk", baseWord: "walk" },
        { id: "chapter-1-exercise-2", order: 2, type: "given_word_blank", targetCategory: "grammar", target: "There be", sentenceId: "c1p1s2", answer: "There was", prompt: "there / be", baseWord: "be" },
        { id: "chapter-1-exercise-3", order: 3, type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p2s1", answer: "clue", hint: "线索", pattern: "c _ _ e", letterCount: 4 },
      ],
    },
  ],
};

describe("lesson content draft validation", () => {
  test("accepts a lesson_content_v1 draft", () => {
    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
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
    invalid.chapters[0].paragraphs[0].sentences[0].segments = [{ type: "text", text: "Summer walked into the forest with Ms. Lin." }];

    expect(() => validateLessonDraft(invalid, storyOption)).toThrow("第 1 章练习未嵌入正文：chapter-1-exercise-1");
  });
});

describe("lesson draft repository", () => {
  test("loads a saved draft", async () => {
    const result = await getLessonDraft(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({ id: true, selectedStoryOptionId: true });
            return { id: "course-1", selectedStoryOptionId: "option-1" };
          },
        },
        courseStoryOption: {
          findFirst: async () => ({ ...storyOption, courseId: "course-1" }),
        },
        courseLessonDraft: {
          findUnique: async ({ where }) => {
            expect(where).toEqual({ courseId: "course-1" });
            return { courseId: "course-1", sourceStoryOptionId: "option-1", content: draft };
          },
        },
      },
      "course-1",
    );

    expect(result.draft?.title).toBe("The Forest Gate");
  });

  test("saves a valid draft for the selected story option", async () => {
    const result = await saveLessonDraft(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({ id: true, selectedStoryOptionId: true });
            return { id: "course-1", selectedStoryOptionId: "option-1" };
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
            return { courseId: "course-1", sourceStoryOptionId: "option-1", content: draft };
          },
        },
      },
      "course-1",
      draft,
    );

    expect(result.draft.sourceStoryOptionId).toBe("option-1");
  });
});
