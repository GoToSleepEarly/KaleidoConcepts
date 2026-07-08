import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseBasicDetail, PersonProfile, StoryOption } from "@/lib/contracts/api";

import {
  assembleLessonDraftFromPlans,
  buildDeepSeekRequestBody,
  generateLessonDraft,
} from "./lesson-draft-generator";
import { validateLessonDraft } from "../repositories/lesson-drafts";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Forest Grammar Quest",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1",
  durationMinutes: 45,
  theme: "Magic Forest",
  grammar: ["Past Simple"],
  storyIdeaMode: "manual",
  storyIdea: "The class finds a forest gate.",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Ms. Lin",
  gender: "female",
  appearance: "kind teacher with black hair and round glasses",
  interests: [],
  notes: "Gentle guide.",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "Summer",
  chineseName: "夏天",
  englishName: "Summer",
  age: 8,
  gender: "female",
  appearance: "girl with black hair and a green dress",
  interests: ["plants", "drawing"],
  learningGoal: "Practice retelling story actions.",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const storyOption: StoryOption = {
  id: "option-1",
  title: "The Forest Gate",
  logline: "The teacher and student enter a magical forest and solve a gentle mystery.",
  chapters: [
    {
      title: "The Gate Opens",
      summary: "Ms. Lin and Summer enter the forest and find a glowing map.",
      knowledgeHook: "Practice past simple actions inside the story.",
    },
  ],
  teachingDesign: {
    grammarIntegration: "Past actions drive the clues.",
    studentFit: "Fits plant and drawing interests.",
    teacherGuidance: "Teacher guides choices.",
    difficultyFit: "Fits A1.",
  },
};

const context = { course, teacher, students: [student], storyOption };

function deepSeekResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function shotPlan(action: string) {
  return {
    characterIds: ["teacher-1", "student-1"],
    location: "quiet forest gate",
    action,
    mood: "curious and safe",
    scenePrompt: `${action} in a warm watercolor forest scene.`,
    composition: "Wide 4:3 picture-book scene with both characters clearly visible.",
    continuityNotes: "Keep character consistency.",
  };
}

const storyPlan = {
  title: "The Forest Gate",
  visualStyle: {
    artStyle: "warm watercolor picture book",
    colorPalette: "soft greens and gold light",
    consistencyPrompt: "Use a consistent watercolor picture-book style.",
  },
  characters: [
    {
      id: "teacher-1",
      name: "Ms. Lin",
      role: "teacher" as const,
      appearance: "kind teacher with black hair and round glasses",
      outfit: "blue cardigan and white shirt",
      consistencyPrompt: "Ms. Lin keeps the same glasses, hair, and cardigan.",
    },
    {
      id: "student-1",
      name: "Summer",
      role: "student" as const,
      appearance: "girl with black hair and a green dress",
      outfit: "green dress and yellow backpack",
      consistencyPrompt: "Summer keeps the same hair, dress, and backpack.",
    },
  ],
  chapters: [
    {
      title: "The Gate Opens",
      paragraphs: [
        {
          text: "Yesterday morning, Ms. Lin walked toward the quiet forest gate with Summer beside her. Summer carried her sketchbook and looked at the silver leaves. Ms. Lin asked one calm question about the strange path, and Summer noticed a small arrow on the stone. They opened the door together and stepped into warm green light.",
          shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
        },
        {
          text: "Inside the forest, the glowing map shone under a blue flower. Summer touched the page and found a hidden trail. Ms. Lin helped her read the marks, and they followed the trail across a tiny bridge. The clue pointed to a bright tree, so Summer shared her idea with a proud smile.",
          shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
        },
      ],
    },
  ],
  closingReading: {
    title: "After the Forest Gate",
    text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
  },
};

const exercisePlan = {
  chapters: [
    {
      chapterIndex: 1,
      exercises: [
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "walked", occurrenceText: "walked", sentence: "Yesterday morning, Ms. Lin walked toward the quiet forest gate with Summer beside her.", baseVerb: "walk" },
        { type: "vocabulary_hint" as const, paragraphIndex: 1 as const, answer: "gate", occurrenceText: "gate", pattern: "g _ _ e" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "carried", occurrenceText: "carried", baseVerb: "carry" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "looked", occurrenceText: "looked", baseVerb: "look" },
        { type: "verb_blank" as const, paragraphIndex: 1 as const, answer: "asked", occurrenceText: "asked", baseVerb: "ask" },
        { type: "vocabulary_hint" as const, paragraphIndex: 2 as const, answer: "map", occurrenceText: "map", pattern: "m _ p" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "touched", occurrenceText: "touched", baseVerb: "touch" },
        { type: "vocabulary_hint" as const, paragraphIndex: 2 as const, answer: "trail", occurrenceText: "hidden trail", pattern: "t _ _ _ l" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "helped", occurrenceText: "helped", baseVerb: "help" },
        { type: "verb_blank" as const, paragraphIndex: 2 as const, answer: "followed", occurrenceText: "followed", baseVerb: "follow" },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lesson draft two-stage assembly", () => {
  test("assembles pure story text and exercise plan into a valid lesson draft", () => {
    const draft = assembleLessonDraftFromPlans(storyPlan, exercisePlan, context);

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(10);
    expect(draft.chapters[0].shots).toHaveLength(2);
    expect(draft.closingReading.vocabularyTerms).toEqual(["gate", "map", "trail"]);

    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("Ms. Lin [walked] toward the quiet forest [gate]");
    expect(rendered).toContain("the glowing [map] shone");
  });

  test("rejects exercise occurrence text that is missing from the paragraph", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises[0].occurrenceText = "danced";
    invalidPlan.chapters[0].exercises[0].answer = "danced";

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow('occurrenceText "danced" 在 sentence 中不存在');
  });

  test("uses sentence locator when occurrence text appears multiple times in a paragraph", () => {
    const repeatedStory = structuredClone(storyPlan);
    repeatedStory.chapters[0].paragraphs[0].text = `${repeatedStory.chapters[0].paragraphs[0].text} The quiet forest gate opened again.`;
    const locatedPlan = structuredClone(exercisePlan);
    const vocabularyExercise = locatedPlan.chapters[0].exercises[1];
    if (vocabularyExercise.type !== "vocabulary_hint") {
      throw new Error("Expected vocabulary exercise");
    }
    vocabularyExercise.sentence = "Yesterday morning, Ms. Lin walked toward the quiet forest gate with Summer beside her.";

    const draft = assembleLessonDraftFromPlans(repeatedStory, locatedPlan, context);

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("quiet forest [gate] with Summer");
    expect(rendered).toContain("The quiet forest gate opened again.");
  });

  test("rejects duplicate exercise answers in one chapter", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises[1] = { ...invalidPlan.chapters[0].exercises[1], answer: "walked", occurrenceText: "walked" };

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow("第 1 章练习计划无效：answer 在同章重复");
  });

  test("rejects fewer than 7 exercise plan items", () => {
    const invalidPlan = structuredClone(exercisePlan);
    invalidPlan.chapters[0].exercises = invalidPlan.chapters[0].exercises.slice(0, 6);

    expect(() => assembleLessonDraftFromPlans(storyPlan, invalidPlan, context)).toThrow("第 1 章练习数量不足：需要 7-10 个，当前 6 个");
  });
});

describe("lesson draft DeepSeek request", () => {
  test("uses non-thinking mode by default for faster normal generation", () => {
    const original = process.env.DEEPSEEK_THINKING;
    delete process.env.DEEPSEEK_THINKING;

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 32000,
      });
      expect(body).not.toHaveProperty("reasoning_effort");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });

  test("enables thinking mode only through environment configuration", () => {
    const original = process.env.DEEPSEEK_THINKING;
    process.env.DEEPSEEK_THINKING = "enabled";

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        max_tokens: 64000,
      });
      expect(body).not.toHaveProperty("temperature");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });
});

describe("lesson draft generation", () => {
  test("uses exactly two LLM calls on a valid generation", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValueOnce(deepSeekResponse(storyPlan)).mockResolvedValueOnce(deepSeekResponse(exercisePlan));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const draft = await generateLessonDraft(context);

      expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const storyBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const exerciseBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(storyBody.messages[1].content).toContain("Do not include exercise markers");
      expect(exerciseBody.messages[1].content).toContain("occurrenceText must be copied exactly");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = originalApiKey;
      }
    }
  });

  test("does not make a third LLM call after invalid exercise plan", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const invalidExercisePlan = structuredClone(exercisePlan);
    invalidExercisePlan.chapters[0].exercises = invalidExercisePlan.chapters[0].exercises.slice(0, 6);
    const fetchMock = vi.fn().mockResolvedValueOnce(deepSeekResponse(storyPlan)).mockResolvedValueOnce(deepSeekResponse(invalidExercisePlan));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(generateLessonDraft(context)).rejects.toThrow("第 1 章练习数量不足：需要 7-10 个，当前 6 个");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = originalApiKey;
      }
    }
  });
});
