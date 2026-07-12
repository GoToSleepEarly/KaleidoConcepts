import { describe, expect, test } from "vitest";

import type { StoryOption } from "@/lib/contracts/api";

import { listStoryOptions, saveGeneratedStoryOptions, selectStoryOption, updateStoryOptions } from "./story-options";

const options: StoryOption[] = [
  {
    id: "option-1",
    variant: "faithful",
    title: "The Star Gate",
    storyline: "The class follows a star map and reopens the gate home.",
    chapters: [
      { title: "Chapter 1", summary: "They find the scrambled map room." },
      { title: "Chapter 2", summary: "They cross the asteroid belt." },
      { title: "Chapter 3", summary: "They combine clues to power the gate." },
    ],
  },
  {
    id: "option-2",
    variant: "enhanced",
    title: "The Moon Garden",
    storyline: "The class grows a moon garden and learns why the seeds matter.",
    chapters: [
      { title: "Chapter 1", summary: "They land the seed pod on moon soil." },
      { title: "Chapter 2", summary: "They build a warm dome for the seeds." },
      { title: "Chapter 3", summary: "They share the first small harvest." },
    ],
  },
  {
    id: "option-3",
    variant: "creative",
    title: "The Robot Planet",
    storyline: "The class helps a quiet robot city restart its factory together.",
    chapters: [
      { title: "Chapter 1", summary: "They wake one small helper robot." },
      { title: "Chapter 2", summary: "They invent a tool for the frozen robots." },
      { title: "Chapter 3", summary: "They restart the factory as a team." },
    ],
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
