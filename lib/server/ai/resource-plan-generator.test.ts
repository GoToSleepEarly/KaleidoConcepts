import { describe, expect, test } from "vitest";

import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";

import { buildCourseResourcePlanPrompt, generateCourseResourcePlan, parseCourseResourcePlan } from "./resource-plan-generator";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Forest Gate",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1",
  durationMinutes: 30,
  theme: "forest gate",
  grammar: ["Past Simple"],
  storyIdeaMode: "ai",
  storyIdea: "",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Ms Lin",
  gender: "female",
  appearance: "kind teacher with round glasses",
  interests: [],
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "Summer",
  chineseName: "夏天",
  englishName: "Summer",
  age: 8,
  gender: "female",
  appearance: "bright eyes and short black hair",
  interests: ["drawing"],
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

const storyOption: StoryOption = {
  id: "option-1",
  variant: "enhanced",
  title: "The Forest Gate",
  storyline: "The class follows clues through a glowing forest gate.",
  chapters: [{ title: "The Gate Opens", summary: "Summer finds the first clue near the gate." }],
};

const draft: LessonDraft = {
  schemaVersion: "lesson_content_v1",
  sourceStoryOptionId: "option-1",
  generationMode: "ai",
  title: "The Forest Gate",
  language: "en",
  castAliases: [{ alias: "SummerStudent", displayName: "Summer" }],
  closingReading: { title: "After", sentences: ["Summer remembered the gate."], vocabularyTerms: [] },
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
            { id: "c1s1", text: "Summer walked into the forest.", segments: [{ type: "text", text: "Summer walked into the forest." }] },
            { id: "c1s2", text: "A silver gate shone near the river.", segments: [{ type: "text", text: "A silver gate shone near the river." }] },
          ],
        },
        {
          id: "chapter-1-paragraph-2",
          order: 2,
          sentences: [
            { id: "c1s3", text: "Summer found a clue under the gate.", segments: [{ type: "text", text: "Summer found a clue under the gate." }] },
          ],
        },
      ],
      exercises: [],
    },
  ],
};

describe("course resource plan parsing", () => {
  test("accepts a complete course_resource_plan_v1 payload", () => {
    const result = parseCourseResourcePlan({
      schemaVersion: "course_resource_plan_v1",
      coverBrief: {
        description: "Summer and the class stand by the glowing gate.",
        characters: ["SummerStudent"],
        setting: "forest gate",
        storyElements: ["silver gate"],
        imagePrompt:
          "Horizontal 16:9 hand-drawn children's picture-book cover. SummerStudent is an eight-year-old child with short black hair, bright eyes, a yellow raincoat, and a green backpack, standing beside a glowing silver forest gate near a river. No readable text.",
      },
      shots: [
        {
          chapterId: "chapter-1",
          shotId: "chapter-1-shot-1",
          shotOrder: 1,
          sourceParagraphId: "chapter-1-paragraph-1",
          sourceExcerpt: "Summer walked into the forest. A silver gate shone near the river.",
          focus: "Summer sees the gate.",
          characters: ["SummerStudent"],
          keyObjects: ["silver gate"],
          composition: "wide safe-center shot",
          continuityNotes: "Keep the same outfit.",
          imagePrompt:
            "Horizontal 16:9 hand-drawn children's picture-book illustration. SummerStudent is an eight-year-old child with short black hair, bright eyes, a yellow raincoat, and a green backpack, walking into a glowing forest near a silver gate by the river. No readable text.",
        },
        {
          chapterId: "chapter-1",
          shotId: "chapter-1-shot-2",
          shotOrder: 2,
          sourceParagraphId: "chapter-1-paragraph-2",
          sourceExcerpt: "Summer found a clue under the gate.",
          focus: "Summer finds the clue.",
          characters: ["SummerStudent"],
          keyObjects: ["clue"],
          composition: "medium safe-center shot",
          continuityNotes: "Continue the forest scene.",
          imagePrompt:
            "Horizontal 16:9 hand-drawn children's picture-book illustration. SummerStudent is the same child with short black hair, bright eyes, a yellow raincoat, and a green backpack, crouching near the silver gate to find a small clue. No readable text.",
        },
      ],
    });

    expect(result.schemaVersion).toBe("course_resource_plan_v1");
    expect(result.version).toBe(1);
    expect(result.coverBrief.imagePrompt).toContain("Horizontal 16:9");
    expect(result.shots[0].imagePrompt).toContain("yellow raincoat");
  });

  test("rejects resource plans without self-contained image prompts", () => {
    expect(() =>
      parseCourseResourcePlan({
        schemaVersion: "course_resource_plan_v1",
        coverBrief: {
          description: "Summer and the class stand by the glowing gate.",
          characters: ["SummerStudent"],
          setting: "forest gate",
          storyElements: ["silver gate"],
        },
        shots: [
          {
            chapterId: "chapter-1",
            shotId: "chapter-1-shot-1",
            shotOrder: 1,
            sourceParagraphId: "chapter-1-paragraph-1",
            sourceExcerpt: "Summer walked into the forest. A silver gate shone near the river.",
            focus: "Summer sees the gate.",
            characters: ["SummerStudent"],
            keyObjects: ["silver gate"],
            composition: "wide safe-center shot",
            continuityNotes: "Keep the same outfit.",
          },
        ],
      }),
    ).toThrow("imagePrompt");
  });

  test("mock mode creates one shot per paragraph", async () => {
    const result = await generateCourseResourcePlan({ course, teacher, students: [student], storyOption, draft });

    expect(result.shots).toHaveLength(2);
    expect(result.shots.map((shot) => shot.shotOrder)).toEqual([1, 2]);
    expect(result.shots.map((shot) => shot.sourceParagraphId)).toEqual(["chapter-1-paragraph-1", "chapter-1-paragraph-2"]);
  });

  test("asks the AI to create memorable story-poster cover art with no extra people", () => {
    const prompt = buildCourseResourcePlanPrompt({ course, teacher, students: [student], storyOption, draft });

    expect(prompt).toContain("story poster");
    expect(prompt).toContain("memorable central visual hook");
    expect(prompt).toContain("Do not add extra students");
    expect(prompt).toContain("Only use cast aliases");
    expect(prompt).toContain("shotOrder 1 must use paragraph 1");
    expect(prompt).toContain("shotOrder 2 must use paragraph 2");
  });
});
