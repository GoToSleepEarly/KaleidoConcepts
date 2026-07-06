import { describe, expect, test } from "vitest";

import type { StoryOption } from "@/lib/contracts/api";

import { listStoryOptions, saveGeneratedStoryOptions, selectStoryOption, updateStoryOptions } from "./story-options";

const options: StoryOption[] = [
  {
    id: "option-1",
    title: "The Star Gate",
    logline: "Students follow their teacher into a space gate.",
    chapters: [
      { title: "Chapter 1", summary: "They find a map.", knowledgeHook: "Use There be to describe the map." },
      { title: "Chapter 2", summary: "They meet an alien.", knowledgeHook: "Use Past Simple for actions." },
      { title: "Chapter 3", summary: "They return home.", knowledgeHook: "Use target grammar in retelling." },
    ],
    teachingDesign: {
      grammarIntegration: "Grammar appears in repeated dialogue.",
      studentFit: "The adventure fits the students' interests.",
      teacherGuidance: "The teacher guides each decision.",
      difficultyFit: "The plot matches the level.",
    },
  },
  {
    id: "option-2",
    title: "The Moon Garden",
    logline: "Students grow a garden on the moon.",
    chapters: [
      { title: "Chapter 1", summary: "They launch.", knowledgeHook: "Use There be." },
      { title: "Chapter 2", summary: "They plant seeds.", knowledgeHook: "Use Past Simple." },
      { title: "Chapter 3", summary: "They share food.", knowledgeHook: "Use target grammar." },
    ],
    teachingDesign: {
      grammarIntegration: "Grammar supports scene description.",
      studentFit: "The topic fits the class.",
      teacherGuidance: "The teacher acts as guide.",
      difficultyFit: "The chapter count fits time.",
    },
  },
  {
    id: "option-3",
    title: "The Robot Planet",
    logline: "Students help robots fix a planet.",
    chapters: [
      { title: "Chapter 1", summary: "They arrive.", knowledgeHook: "Use There be." },
      { title: "Chapter 2", summary: "They fix robots.", knowledgeHook: "Use Past Simple." },
      { title: "Chapter 3", summary: "They celebrate.", knowledgeHook: "Use target grammar." },
    ],
    teachingDesign: {
      grammarIntegration: "Grammar is practiced through tasks.",
      studentFit: "The challenge fits students.",
      teacherGuidance: "The teacher guides teamwork.",
      difficultyFit: "The language is simple.",
    },
  },
];

describe("story options repository", () => {
  test("saves generated story options when no option has been selected", async () => {
    const saved = await saveGeneratedStoryOptions(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({ id: true, durationMinutes: true, selectedStoryOptionId: true });
            return { id: "course-1", durationMinutes: 30, selectedStoryOptionId: null };
          },
        },
        courseStoryOption: {
          deleteMany: async ({ where }) => {
            expect(where).toEqual({ courseId: "course-1" });
          },
          createMany: async ({ data }) => {
            expect(data).toHaveLength(3);
          },
          findMany: async () => options.map((option) => ({ ...option, courseId: "course-1" })),
        },
      },
      "course-1",
      options,
    );

    expect(saved.options).toHaveLength(3);
    expect(saved.selectedOptionId).toBeNull();
  });

  test("updates existing editable options before selection", async () => {
    const saved = await updateStoryOptions(
      {
        course: {
          findUnique: async () => ({ id: "course-1", durationMinutes: 30, selectedStoryOptionId: null }),
        },
        courseStoryOption: {
          deleteMany: async ({ where }) => {
            expect(where).toEqual({ courseId: "course-1" });
          },
          createMany: async ({ data }) => {
            expect(data).toHaveLength(3);
          },
          findMany: async () => options.map((option) => ({ ...option, courseId: "course-1" })),
        },
      },
      "course-1",
      options,
    );

    expect(saved.options[0]?.title).toBe("The Star Gate");
  });

  test("selects one saved story option once", async () => {
    const selected = await selectStoryOption(
      {
        course: {
          findUnique: async () => ({ id: "course-1", durationMinutes: 30, selectedStoryOptionId: null }),
          update: async ({ where, data }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(data).toEqual({ selectedStoryOptionId: "option-1" });
            return { selectedStoryOptionId: "option-1" };
          },
        },
        courseStoryOption: {
          findFirst: async ({ where }) => {
            expect(where).toEqual({ id: "option-1", courseId: "course-1" });
            return { id: "option-1" };
          },
        },
      },
      "course-1",
      "option-1",
    );

    expect(selected).toEqual({ selectedOptionId: "option-1" });
  });

  test("lists saved options and selected id", async () => {
    const result = await listStoryOptions(
      {
        course: {
          findUnique: async ({ where, select }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(select).toEqual({ id: true, durationMinutes: true, selectedStoryOptionId: true });
            return { id: "course-1", durationMinutes: 30, selectedStoryOptionId: "option-2" };
          },
        },
        courseStoryOption: {
          findMany: async ({ where, orderBy }) => {
            expect(where).toEqual({ courseId: "course-1" });
            expect(orderBy).toEqual({ createdAt: "asc" });
            return options.map((option) => ({ ...option, courseId: "course-1" }));
          },
        },
      },
      "course-1",
    );

    expect(result.selectedOptionId).toBe("option-2");
    expect(result.options).toHaveLength(3);
  });
});
