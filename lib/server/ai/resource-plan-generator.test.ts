import { describe, expect, test } from "vitest";

import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";

import { buildCourseResourcePlanPrompt, generateCourseResourcePlan, parseCourseResourcePlan } from "./resource-plan-generator";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Forest Gate",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  age: 8,
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
      visualProfile: {
        style: "hand-drawn comic picture-book style",
        palette: "warm green and silver",
        world: "glowing forest classroom",
        mood: "curious",
        characters: [
          {
            alias: "SummerStudent",
            appearance: "bright eyes",
            hairstyle: "short black hair",
            clothing: "yellow raincoat",
            accessories: ["green backpack"],
            signatureColor: "yellow",
          },
        ],
      },
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
          sourceSentenceIds: ["c1s1", "c1s2"],
          heroMomentSentenceId: "c1s2",
          sourceExcerpt: "Summer walked into the forest. A silver gate shone near the river.",
          focus: "Summer sees the gate.",
          characters: ["SummerStudent"],
          keyObjects: ["silver gate"],
          composition: "wide safe-center shot",
          continuityNotes: "Keep the same outfit.",
        },
        {
          chapterId: "chapter-1",
          shotId: "chapter-1-shot-2",
          shotOrder: 2,
          sourceParagraphId: "chapter-1-paragraph-2",
          sourceSentenceIds: ["c1s3"],
          heroMomentSentenceId: "c1s3",
          sourceExcerpt: "Summer found a clue under the gate.",
          focus: "Summer finds the clue.",
          characters: ["SummerStudent"],
          keyObjects: ["clue"],
          composition: "medium safe-center shot",
          continuityNotes: "Continue the forest scene.",
        },
      ],
    });

    expect(result.schemaVersion).toBe("course_resource_plan_v1");
    expect(result.version).toBe(1);
    expect(result.confirmedCoverImageId).toBeNull();
  });

  test("mock mode creates two shots per chapter with hand-drawn comic style", async () => {
    const result = await generateCourseResourcePlan({ course, teacher, students: [student], storyOption, draft, previousVisualProfile: null });

    expect(result.visualProfile.style).toContain("hand-drawn comic");
    expect(result.shots).toHaveLength(2);
    expect(result.shots.map((shot) => shot.shotOrder)).toEqual([1, 2]);
  });

  test("asks the AI to create memorable story-poster cover art with no extra people", () => {
    const prompt = buildCourseResourcePlanPrompt({ course, teacher, students: [student], storyOption, draft, previousVisualProfile: null });

    expect(prompt).toContain("story poster");
    expect(prompt).toContain("memorable central visual hook");
    expect(prompt).toContain("Do not add extra students");
    expect(prompt).toContain("Only use cast aliases");
  });
});
