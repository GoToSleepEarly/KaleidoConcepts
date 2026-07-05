import { describe, expect, test } from "vitest";

import type { LessonDraft, StoryOption } from "@/lib/contracts/api";

import { getLessonDraft, saveLessonDraft, validateLessonDraft } from "./lesson-drafts";

const storyOption: StoryOption = {
  id: "option-1",
  title: "The Forest Gate",
  logline: "The teacher guides the students through a magical forest gate.",
  chapters: [
    {
      title: "The Gate Opens",
      summary: "The group enters the forest and discovers a glowing map.",
      knowledgeHook: "Practice past tense verbs and three vocabulary hints.",
    },
  ],
  teachingDesign: {
    grammarIntegration: "Use past tense actions.",
    studentFit: "Fits the students.",
    teacherGuidance: "Teacher guides choices.",
    difficultyFit: "Fits A1.",
  },
};

const text = "Yesterday morning, Summer and Ethan enter the forest with Ms. Lin. The trees are tall and bright. A silver door shines beside the river. Summer keeps her notebook close. Ethan studies the stones near the water. Ms. Lin gives a calm smile and shows them a quiet trail. The children feel nervous, but they want to learn what the forest is hiding. They move along the trail, hear the birds, and see a soft green light near an old bridge. The light moves slowly, as if it wants to help them. Summer touches the notebook, and a new road appears. Ethan takes a deep breath. Ms. Lin asks them to stay together. The adventure is beginning, and every step brings them closer to the secret place.";

const draft: LessonDraft = {
  schemaVersion: "lesson_draft_v1",
  sourceStoryOptionId: "option-1",
  generationMode: "ai",
  title: "The Forest Gate",
  language: "en",
  visualStyle: {
    artStyle: "warm storybook watercolor",
    colorPalette: "soft greens and golds",
    aspectRatio: "4:3",
    consistencyPrompt: "Use the same watercolor style and soft lighting.",
  },
  characters: [
    {
      id: "teacher-1",
      name: "Ms. Lin",
      role: "teacher",
      appearance: "kind teacher with short black hair",
      outfit: "blue cardigan and white shirt",
      consistencyPrompt: "Always show Ms. Lin with short black hair and a blue cardigan.",
    },
    {
      id: "student-1",
      name: "Summer",
      role: "student",
      appearance: "girl with a ponytail",
      outfit: "yellow hoodie",
      consistencyPrompt: "Always show Summer with a ponytail and yellow hoodie.",
    },
  ],
  chapters: [
    {
      id: "chapter-1",
      sourceOutlineChapterIndex: 1,
      title: "The Gate Opens",
      wordTarget: { min: 120, max: 180 },
      exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
      blocks: [
        { id: "c1-b1", order: 1, type: "text", text },
        { id: "c1-b2", order: 2, type: "exercise", exerciseId: "c1-e1", display: { kind: "verb_blank", placeholder: "________", prompt: "walk" } },
        { id: "c1-b3", order: 3, type: "exercise", exerciseId: "c1-e2", display: { kind: "verb_blank", placeholder: "________", prompt: "open" } },
        { id: "c1-b4", order: 4, type: "exercise", exerciseId: "c1-e3", display: { kind: "verb_blank", placeholder: "________", prompt: "hold" } },
        { id: "c1-b5", order: 5, type: "exercise", exerciseId: "c1-e4", display: { kind: "verb_blank", placeholder: "________", prompt: "look" } },
        { id: "c1-b6", order: 6, type: "exercise", exerciseId: "c1-e5", display: { kind: "verb_blank", placeholder: "________", prompt: "point" } },
        { id: "c1-b7", order: 7, type: "exercise", exerciseId: "c1-e6", display: { kind: "verb_blank", placeholder: "________", prompt: "follow" } },
        { id: "c1-b8", order: 8, type: "exercise", exerciseId: "c1-e7", display: { kind: "verb_blank", placeholder: "________", prompt: "notice" } },
        {
          id: "c1-b9",
          order: 9,
          type: "exercise",
          exerciseId: "c1-e8",
          display: { kind: "vocabulary_hint", placeholder: "________", pattern: "g _ _ e", letterCount: 4 },
        },
        {
          id: "c1-b10",
          order: 10,
          type: "exercise",
          exerciseId: "c1-e9",
          display: { kind: "vocabulary_hint", placeholder: "________", pattern: "m _ p", letterCount: 3 },
        },
        {
          id: "c1-b11",
          order: 11,
          type: "exercise",
          exerciseId: "c1-e10",
          display: { kind: "vocabulary_hint", placeholder: "________", pattern: "p _ _ h", letterCount: 4 },
        },
      ],
      exercises: [
        { id: "c1-e1", type: "verb_blank", answer: "walked", baseVerb: "walk" },
        { id: "c1-e2", type: "verb_blank", answer: "opened", baseVerb: "open" },
        { id: "c1-e3", type: "verb_blank", answer: "held", baseVerb: "hold" },
        { id: "c1-e4", type: "verb_blank", answer: "looked", baseVerb: "look" },
        { id: "c1-e5", type: "verb_blank", answer: "pointed", baseVerb: "point" },
        { id: "c1-e6", type: "verb_blank", answer: "followed", baseVerb: "follow" },
        { id: "c1-e7", type: "verb_blank", answer: "noticed", baseVerb: "notice" },
        { id: "c1-e8", type: "vocabulary_hint", answer: "gate", pattern: "g _ _ e", letterCount: 4 },
        { id: "c1-e9", type: "vocabulary_hint", answer: "map", pattern: "m _ p", letterCount: 3 },
        { id: "c1-e10", type: "vocabulary_hint", answer: "path", pattern: "p _ _ h", letterCount: 4 },
      ],
      shots: [
        {
          id: "c1-s1",
          order: 1,
          imageSlotId: "c1-img1",
          coveredBlockIds: ["c1-b1", "c1-b2", "c1-b3", "c1-b4", "c1-b5", "c1-b6"],
          characterIds: ["teacher-1", "student-1"],
          location: "magical forest gate",
          action: "Ms. Lin guides Summer toward a silver gate",
          mood: "curious and warm",
          scenePrompt: "A magical forest gate opens beside a river while Ms. Lin guides Summer.",
          composition: "Wide storybook scene with the gate on the right.",
          continuityNotes: "Use the same outfits and watercolor style.",
        },
        {
          id: "c1-s2",
          order: 2,
          imageSlotId: "c1-img2",
          coveredBlockIds: ["c1-b7", "c1-b8", "c1-b9", "c1-b10", "c1-b11"],
          characterIds: ["teacher-1", "student-1"],
          location: "old forest bridge",
          action: "Summer studies the glowing map near the bridge",
          mood: "mysterious but safe",
          scenePrompt: "Summer studies a glowing map beside an old bridge as Ms. Lin watches.",
          composition: "Medium storybook scene centered on the map.",
          continuityNotes: "Keep the same outfits and character features.",
        },
      ],
    },
  ],
};

describe("lesson draft validation", () => {
  test("accepts a structurally stable lesson draft", () => {
    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
  });

  test("rejects a draft when an exercise is not referenced exactly once", () => {
    const invalid = structuredClone(draft);
    invalid.chapters[0].blocks[1] = { ...invalid.chapters[0].blocks[1], type: "exercise", exerciseId: "missing", display: { kind: "verb_blank", placeholder: "________", prompt: "walk" } };

    expect(() => validateLessonDraft(invalid, storyOption)).toThrow("课文草稿信息不完整");
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
