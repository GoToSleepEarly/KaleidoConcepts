import { describe, expect, test, vi } from "vitest";

import { clearCourseDownstream, getCourseDownstreamImpact, hasCourseDownstream, runBeforeCourseDownstreamReset, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

function delegate(name: string, calls: string[]) {
  return {
    deleteMany: vi.fn(async () => { calls.push(name); return { count: 1 }; }),
    findFirst: vi.fn(async () => null),
  };
}

function database(calls: string[]) {
  const db = {
    course: {
      findUnique: vi.fn(async () => ({ currentStage: "preview" as const })),
      update: vi.fn(async ({ data }) => { calls.push(`course:${data.currentStage}:${data.lifecycleStatus}`); return { id: "course-1" }; }),
    },
    courseStoryChatMessage: delegate("storyMessages", calls),
    courseStoryDirection: delegate("storyDirections", calls),
    courseSourceReference: delegate("references", calls),
    courseStoryOutline: delegate("outline", calls),
    courseStorySetting: delegate("storySetting", calls),
    courseCharacter: delegate("characters", calls),
    courseTeachingPlan: delegate("teachingPlan", calls),
    courseContentChatMessage: delegate("contentMessages", calls),
    courseContentGeneration: delegate("contentGenerations", calls),
    courseLessonContent: delegate("lessonContent", calls),
    courseImage: delegate("images", calls),
    courseVisualImageSlot: delegate("imageSlots", calls),
    courseCharacterVisual: delegate("characterVisuals", calls),
    courseVisualResourcePlan: delegate("visualPlan", calls),
    coursePresentation: delegate("presentation", calls),
  };
  return { ...db, $transaction: async <T>(callback: (tx: typeof db) => Promise<T>) => {
    const result = await callback(db);
    calls.push("transactionCommitted");
    return result;
  } } as unknown as CourseDownstreamDb;
}

describe("course downstream cleanup", () => {
  test("clears every result after story outline immediately and removes local images", async () => {
    const calls: string[] = [];
    const removeImages = vi.fn(async () => { calls.push("imageFiles"); });

    await clearCourseDownstream(database(calls), "course-1", "story_outline", { removeImages });

    expect(calls).toEqual([
      "presentation", "images", "imageSlots", "characterVisuals", "visualPlan",
      "contentMessages", "contentGenerations", "lessonContent", "teachingPlan",
      "course:story_outline:draft", "transactionCommitted", "imageFiles",
    ]);
    expect(calls).not.toContain("outline");
  });

  test("does not remove image files when the database cleanup rolls back", async () => {
    const calls: string[] = [];
    const db = database(calls);
    db.$transaction = vi.fn(async () => {
      throw new Error("database cleanup failed");
    });
    const removeImages = vi.fn(async () => undefined);

    await expect(clearCourseDownstream(db, "course-1", "content", { removeImages })).rejects.toThrow("database cleanup failed");

    expect(removeImages).not.toHaveBeenCalled();
  });

  test("preserves downstream records when the replacement generation fails", async () => {
    const calls: string[] = [];
    const db = database(calls);
    const removeImages = vi.fn(async () => undefined);

    await expect(runBeforeCourseDownstreamReset(db, "course-1", "content", async () => {
      throw new Error("generation failed");
    }, { removeImages })).rejects.toThrow("generation failed");

    expect(calls).toEqual([]);
    expect(removeImages).not.toHaveBeenCalled();
  });

  test("clears the current content and all later results when restarting content", async () => {
    const calls: string[] = [];

    await clearCourseDownstream(database(calls), "course-1", "teaching_plan", { removeImages: vi.fn(async () => undefined) });

    expect(calls).toContain("lessonContent");
    expect(calls).toContain("images");
    expect(calls).toContain("presentation");
    expect(calls).toContain("course:teaching_plan:draft");
    expect(calls).not.toContain("teachingPlan");
    expect(calls.at(-1)).toBe("transactionCommitted");
  });

  test("detects real downstream records even when the stored stage is stale", async () => {
    const db = database([]);
    vi.mocked(db.course.findUnique).mockResolvedValue({ currentStage: "content" });
    vi.mocked(db.coursePresentation.findFirst!).mockResolvedValue({ courseId: "course-1" });

    await expect(hasCourseDownstream(db, "course-1", "content")).resolves.toBe(true);
  });

  test("reports only the downstream result groups that actually exist", async () => {
    const db = database([]);
    vi.mocked(db.course.findUnique).mockResolvedValue({ currentStage: "content" });
    vi.mocked(db.courseImage.findFirst!).mockResolvedValue({ courseId: "course-1" });

    await expect(getCourseDownstreamImpact(db, "course-1", "teaching_plan")).resolves.toEqual([
      "文案与练习",
      "视觉资源和图片",
    ]);
    expect(db.coursePresentation.findFirst).toHaveBeenCalledWith({
      where: { courseId: "course-1" },
      select: { courseId: true },
    });
  });
});
