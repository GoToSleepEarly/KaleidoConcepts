import { describe, expect, it, vi } from "vitest";

import { confirmVisualResources, getCoursePreview, publishCourse } from "@/lib/server/repositories/course-preview";

describe("course preview state transitions", () => {
  it("uses the bilingual story outline as the title source for preview pages", async () => {
    const db = {
      course: { findUnique: vi.fn().mockResolvedValue({
        id: "course-1", title: "课程名称", lifecycleStatus: "draft", people: [], presentation: null, teachingPlan: null, visualImageSlots: [{ id: "cover", activeImage: { status: "succeeded", publicUrl: "/cover.webp" }, images: [] }],
        storyOutline: { title: "海底图书馆 / The Ocean Library", chapters: [{ id: "outline-chapter-1", order: 1, title: "发光地图 / The Glowing Map" }] },
        lessonContent: { mainIdea: null, homework: null, chapters: [{ id: "chapter-1", outlineChapterId: "outline-chapter-1", order: 1, title: "Chapter 1", targetWordCount: 90, readingExerciseMode: "complete", paragraphs: [], chapterPractice: [], validationIssues: [] }] },
      }) },
      presetOption: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const preview = await getCoursePreview(db, "course-1");
    expect(preview.pages.find((page) => page.type === "cover_title")).toMatchObject({ title: "海底图书馆 / The Ocean Library" });
    expect(preview.pages.find((page) => page.type === "chapter_divider")).toMatchObject({ chapterTitleZh: "发光地图", chapterTitleEn: "The Glowing Map" });
  });

  it("allows direct preview access with placeholders when images are incomplete", async () => {
    const db = {
      course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", people: [], presentation: null, teachingPlan: null, storyOutline: null, lessonContent: { mainIdea: null, homework: null, chapters: [] }, visualImageSlots: [{ id: "cover", activeImage: null, images: [] }] }) },
      presetOption: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const preview = await getCoursePreview(db, "course-1");
    expect(preview.pages).toBeDefined();
  });

  it("blocks preview while any required image is still generating", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", lessonContent: { id: "content-1" }, visualImageSlots: [{ id: "cover", activeImage: null, images: [{ status: "generating" }] }] }), update } } as never;
    await expect(confirmVisualResources(db, "course-1")).rejects.toThrow("还有 1 张图片正在生成");
    expect(update).not.toHaveBeenCalled();
  });

  it("advances Step 5 without a resource plan when no image task is running", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", lessonContent: { id: "content-1" }, visualImageSlots: [] }), update } } as never;
    await confirmVisualResources(db, "course-1");
    expect(update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { currentStage: "preview" } });
  });

  it("publishes idempotently and saves the supplied presentation first", async () => {
    const update = vi.fn().mockResolvedValue({});
    const upsert = vi.fn().mockResolvedValue({});
    const db = {
      course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", lifecycleStatus: "published", lessonContent: { id: "content-1" }, visualImageSlots: [{ id: "cover", activeImage: { status: "succeeded" }, images: [] }] }), update },
      coursePresentation: { upsert },
    } as never;
    const result = await publishCourse(db, "course-1", { coverTheme: "light", coverTitleFontSize: 1.1, chapterTheme: "green", slideOverrides: {} });
    expect(upsert).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({ redirectUrl: "/courses/course-1" });
  });

  it("allows publishing with placeholders when an image failed", async () => {
    const update = vi.fn();
    const db = {
      course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", lifecycleStatus: "draft", lessonContent: { id: "content-1" }, visualImageSlots: [{ id: "cover", activeImage: null, images: [{ status: "failed" }] }] }), update },
      coursePresentation: { upsert: vi.fn() },
    } as never;
    await expect(publishCourse(db, "course-1")).resolves.toEqual({ redirectUrl: "/courses/course-1" });
    expect(update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { lifecycleStatus: "published", currentStage: "preview" } });
  });

  it("blocks publishing while any image task is running", async () => {
    const update = vi.fn();
    const db = {
      course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", lifecycleStatus: "draft", lessonContent: { id: "content-1" }, visualImageSlots: [{ id: "cover", activeImage: null, images: [{ status: "submitting" }] }] }), update },
      coursePresentation: { upsert: vi.fn() },
    } as never;
    await expect(publishCourse(db, "course-1")).rejects.toThrow("还有 1 张图片正在生成");
    expect(update).not.toHaveBeenCalled();
  });
});
