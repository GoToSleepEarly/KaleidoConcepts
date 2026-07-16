import { describe, expect, test, vi } from "vitest";

import { CoursePreviewPrerequisiteError } from "./course-preview";
import type { CoursePreviewDb } from "./course-preview";
import {
  defaultPresentation,
  normalizePresentationUpdate,
  publishCourse,
} from "./course-presentation";
import type { CourseStatus } from "@/lib/contracts/api";

type MockCourse = {
  id: string;
  status: CourseStatus;
  hasLessonDraft?: boolean;
};

function makeDb(course: MockCourse | null) {
  const update = vi.fn().mockResolvedValue(undefined);
  const upsert = vi.fn().mockResolvedValue(undefined);
  const db = {
    course: {
      findUnique: vi.fn().mockResolvedValue(
        course
          ? {
              id: course.id,
              title: "T",
              status: course.status,
              people: [],
              lessonDraft: course.hasLessonDraft === false ? null : { content: {} },
              resourcePlan: null,
              presentation: null,
            }
          : null,
      ),
      update,
    },
    coursePresentation: { upsert },
  } as unknown as CoursePreviewDb;
  return { db, update, upsert };
}

describe("course-presentation helpers", () => {
  test("defaultPresentation returns valid defaults", () => {
    const cfg = defaultPresentation();
    expect(cfg.coverTheme).toBe("dark");
    expect(cfg.coverTitleFontSize).toBe(1.0);
    expect(cfg.chapterTheme).toBe("blue-purple");
    expect(cfg.slideOverrides).toEqual({});
  });

  test("normalizePresentationUpdate applies defaults for missing fields", () => {
    const result = normalizePresentationUpdate({
      coverTheme: "warm",
      coverTitleFontSize: 0.8,
      chapterTheme: "green-teal",
      slideOverrides: { "shot-1": { textBox: { opacity: 0.6 } } },
    });
    expect(result.coverTheme).toBe("warm");
    expect(result.coverTitleFontSize).toBe(0.8);
    expect(result.chapterTheme).toBe("green-teal");
  });
});

describe("publishCourse", () => {
  test("draft with lesson draft becomes published and returns presenter url", async () => {
    const { db, update } = makeDb({ id: "c1", status: "ready" });
    const result = await publishCourse(db, "c1");
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "published" } });
    expect(result.redirectUrl).toBe("/courses/c1");
  });

  test("republishing an already published course is idempotent and does not rewrite status", async () => {
    const { db, update } = makeDb({ id: "c2", status: "published" });
    const result = await publishCourse(db, "c2");
    expect(update).not.toHaveBeenCalled();
    expect(result.redirectUrl).toBe("/courses/c2");
  });

  test("throws prerequisite error when lesson draft missing", async () => {
    const { db } = makeDb({ id: "c3", status: "draft", hasLessonDraft: false });
    await expect(publishCourse(db, "c3")).rejects.toBeInstanceOf(CoursePreviewPrerequisiteError);
  });
});
