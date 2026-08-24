import { describe, expect, test, vi } from "vitest";

import { getCourseDownstreamImpact, hasCourseDownstream, markCourseDownstreamStale, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

function delegate(name: string, calls: string[]) {
  return {
    deleteMany: vi.fn(async () => { calls.push(name); return { count: 1 }; }),
    findFirst: vi.fn(async () => null),
  };
}

function database(calls: string[]) {
  const db = {
    course: {
      findUnique: vi.fn(async () => ({ currentStage: "preview" as const, staleFromStage: null, lifecycleStatus: "published" as const })),
      update: vi.fn(async ({ data }) => {
        calls.push(data.currentStage
          ? `course:${data.currentStage}:${data.lifecycleStatus}`
          : `course:keep:${data.staleFromStage ?? "fresh"}:${data.lifecycleStatus}`);
        return { id: "course-1" };
      }),
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

describe("course downstream state", () => {
  test("marks later stages stale without deleting any records or moving navigation backward", async () => {
    const calls: string[] = [];
    const db = database(calls);

    await markCourseDownstreamStale(db, "course-1", "teaching_plan");

    expect(calls).toEqual(["course:keep:content:draft"]);
    expect(db.courseLessonContent.deleteMany).not.toHaveBeenCalled();
    expect(db.courseImage.deleteMany).not.toHaveBeenCalled();
    expect(db.coursePresentation.deleteMany).not.toHaveBeenCalled();
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
