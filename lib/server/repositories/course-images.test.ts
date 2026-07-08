import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LessonDraft } from "@/lib/contracts/api";
import {
  buildImagePrompt,
  advanceCourseImageQueue,
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  type CourseImageRecord,
  type CourseImagesDb,
  createMissingCourseImages,
  deriveLessonShotImageSlots,
  getCourseResources,
  hashImageSource,
  keepStaleCourseImage,
  mergeImageSlotsWithRecords,
  retryCourseImage,
} from "./course-images";

function draft(): LessonDraft {
  return {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: "story-1",
    generationMode: "ai",
    title: "The Moon Gate",
    language: "en",
    visualStyle: {
      artStyle: "warm watercolor",
      colorPalette: "mint, gold, and ink blue",
      aspectRatio: "4:3",
      consistencyPrompt: "Use the same soft watercolor style.",
    },
    characters: [
      {
        id: "teacher-1",
        name: "Ms. Lin",
        role: "teacher",
        appearance: "kind eyes and short black hair",
        outfit: "green cardigan",
        consistencyPrompt: "Ms. Lin always has short black hair and a green cardigan.",
      },
      {
        id: "student-1",
        name: "Summer",
        role: "student",
        appearance: "bright eyes and a ponytail",
        outfit: "yellow raincoat",
        consistencyPrompt: "Summer always has a ponytail and a yellow raincoat.",
      },
    ],
    chapters: [
      {
        id: "chapter-1",
        sourceOutlineChapterIndex: 1,
        title: "The First Gate",
        wordTarget: { min: 110, max: 130 },
        exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
        blocks: [{ id: "block-1", order: 1, type: "text", text: "Summer opens the gate." }],
        exercises: [],
        shots: [
          {
            id: "shot-1",
            order: 1,
            imageSlotId: "slot-1",
            coveredBlockIds: ["block-1"],
            characterIds: ["teacher-1", "student-1"],
            location: "garden gate",
            action: "Summer and Ms. Lin open a glowing gate.",
            mood: "curious",
            scenePrompt: "A child and teacher open a glowing garden gate.",
            composition: "Wide 4:3 picture-book spread with the gate centered.",
            continuityNotes: "Keep both characters consistent.",
          },
          {
            id: "shot-2",
            order: 2,
            imageSlotId: "slot-2",
            coveredBlockIds: ["block-1"],
            characterIds: ["student-1"],
            location: "moon path",
            action: "Summer steps onto a moonlit path.",
            mood: "brave",
            scenePrompt: "A child steps onto a silver moon path.",
            composition: "Wide 4:3 picture-book spread with path leading right.",
            continuityNotes: "Keep Summer consistent.",
          },
        ],
      },
    ],
    closingReading: {
      title: "After the Gate",
      text: "Summer remembers the moon gate and smiles at the quiet garden path.",
      vocabularyTerms: ["gate", "path"],
    },
  };
}

describe("course image planning", () => {
  it("derives one image slot for each lesson shot", () => {
    const slots = deriveLessonShotImageSlots("course-1", draft());

    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({
      courseId: "course-1",
      chapterId: "chapter-1",
      chapterTitle: "The First Gate",
      shotId: "shot-1",
      shotOrder: 1,
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      action: "Summer and Ms. Lin open a glowing gate.",
      scenePrompt: "A child and teacher open a glowing garden gate.",
    });
  });

  it("builds prompts from shot, style, and referenced character consistency", () => {
    const sampleDraft = draft();
    const prompt = buildImagePrompt(sampleDraft, sampleDraft.chapters[0], sampleDraft.chapters[0].shots[0]);

    expect(prompt).toContain("A child and teacher open a glowing garden gate.");
    expect(prompt).toContain("warm watercolor");
    expect(prompt).toContain("Wide 4:3 picture-book spread");
    expect(prompt).toContain("Ms. Lin: kind eyes and short black hair");
    expect(prompt).toContain("Summer: bright eyes and a ponytail");
    expect(prompt).toContain("No text, no letters, no captions, no speech bubbles");
    expect(prompt.length).toBeLessThanOrEqual(900);
  });

  it("keeps verbose generated shot prompts short enough for HY-Image-Lite", () => {
    const sampleDraft = draft();
    const verbose = "long visual consistency detail ".repeat(40);
    sampleDraft.visualStyle.consistencyPrompt = verbose;
    sampleDraft.characters[0].appearance = verbose;
    sampleDraft.characters[0].outfit = verbose;
    sampleDraft.characters[0].consistencyPrompt = verbose;
    sampleDraft.characters[1].appearance = verbose;
    sampleDraft.characters[1].outfit = verbose;
    sampleDraft.characters[1].consistencyPrompt = verbose;
    sampleDraft.chapters[0].shots[0].scenePrompt = verbose;
    sampleDraft.chapters[0].shots[0].continuityNotes = verbose;

    const prompt = buildImagePrompt(sampleDraft, sampleDraft.chapters[0], sampleDraft.chapters[0].shots[0]);

    expect(prompt).toContain("warm watercolor");
    expect(prompt).toContain("No text, no letters, no captions, no speech bubbles");
    expect(prompt.length).toBeLessThanOrEqual(900);
  });

  it("keeps source hashes stable for identical input and different for changed prompt", () => {
    const first = deriveLessonShotImageSlots("course-1", draft())[0];
    const second = deriveLessonShotImageSlots("course-1", draft())[0];
    const changedDraft = draft();
    changedDraft.chapters[0].shots[0].scenePrompt = "A different scene.";
    const changed = deriveLessonShotImageSlots("course-1", changedDraft)[0];

    expect(hashImageSource(first)).toBe(hashImageSource(second));
    expect(hashImageSource(first)).not.toBe(hashImageSource(changed));
  });

  it("marks missing, reusable, and stale images", () => {
    const slots = deriveLessonShotImageSlots("course-1", draft());
    const currentHash = slots[0].sourceHash;
    const merged = mergeImageSlotsWithRecords(slots, [
      {
        id: "image-1",
        courseId: "course-1",
        chapterId: "chapter-1",
        shotId: "shot-1",
        slotId: "slot-1",
        slotType: "lesson_shot",
        slotIndex: 1,
        prompt: slots[0].prompt,
        sourceHash: "old-hash",
        status: "succeeded",
        provider: "tencent_hunyuan",
        providerTaskId: "task-1",
        providerImageUrl: "https://example.com/image.png",
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/image-1",
        failureReason: null,
        createdAt: new Date("2026-07-08T00:00:00Z"),
        updatedAt: new Date("2026-07-08T00:00:00Z"),
      },
    ]);

    expect(merged[0]).toMatchObject({
      id: "image-1",
      status: "succeeded",
      sourceHash: "old-hash",
      currentSourceHash: currentHash,
      stale: true,
    });
    expect(merged[1]).toMatchObject({
      id: null,
      status: "missing",
      stale: false,
    });
  });
});

type TestCourse = {
  id: string;
  status: "draft" | "building_resources" | "ready" | "build_failed";
  lessonDraft: {
    content: LessonDraft;
  } | null;
};

type CreateImageInput = Parameters<CourseImagesDb["courseImage"]["createMany"]>[0]["data"][number];
type UpdateCourseInput = Parameters<CourseImagesDb["course"]["update"]>[0];
type FindImageInput = Parameters<CourseImagesDb["courseImage"]["findFirst"]>[0];
type UpdateImageInput = Parameters<CourseImagesDb["courseImage"]["update"]>[0];

function makeDb() {
  const state = {
    course: {
      id: "course-1",
      status: "draft",
      lessonDraft: {
        content: draft(),
      },
    } satisfies TestCourse,
    images: [] as CourseImageRecord[],
  };

  return {
    state,
    db: {
      course: {
        findUnique: vi.fn(async () => state.course),
        update: vi.fn(async ({ data }: UpdateCourseInput) => {
          state.course.status = data.status;
          return state.course;
        }),
      },
      courseImage: {
        findMany: vi.fn(async () => state.images),
        createMany: vi.fn(async ({ data }: { data: CreateImageInput[] }) => {
          data.forEach((item) => {
            state.images.push({
              id: `image-${state.images.length + 1}`,
              ...item,
              providerTaskId: null,
              providerImageUrl: null,
              storagePath: null,
              publicUrl: null,
              failureReason: null,
              createdAt: new Date("2026-07-08T00:00:00Z"),
              updatedAt: new Date("2026-07-08T00:00:00Z"),
            });
          });
          return { count: data.length };
        }),
        findFirst: vi.fn(async ({ where }: FindImageInput) => state.images.find((image) => image.id === where.id && image.courseId === where.courseId) ?? null),
        update: vi.fn(async ({ where, data }: UpdateImageInput) => {
          const image = state.images.find((item) => item.id === where.id);
          if (!image) {
            throw new Error("image not found");
          }
          Object.assign(image, data, { updatedAt: new Date("2026-07-08T00:01:00Z") });
          return image;
        }),
      },
    } satisfies CourseImagesDb,
  };
}

describe("course image repository operations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a prerequisite error when the course has no lesson draft", async () => {
    const { db, state } = makeDb();
    state.course.lessonDraft = null;

    await expect(getCourseResources(db, "course-1")).rejects.toBeInstanceOf(CourseImagePrerequisiteError);
  });

  it("creates pending records only for missing images", async () => {
    const { db } = makeDb();
    const result = await createMissingCourseImages(db, "course-1");

    expect(result.progress).toMatchObject({ total: 2, generating: 2, missing: 0 });
    expect(db.courseImage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ slotId: "slot-1", status: "pending", provider: "tencent_hunyuan" }),
        expect.objectContaining({ slotId: "slot-2", status: "pending", provider: "tencent_hunyuan" }),
      ]),
      skipDuplicates: true,
    });
    expect(db.course.update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { status: "building_resources" } });
  });

  it("does not create records for succeeded current images", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "succeeded",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
      publicUrl: "/api/course-images/image-1",
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await createMissingCourseImages(db, "course-1");

    expect(db.courseImage.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ slotId: "slot-2" })],
      skipDuplicates: true,
    });
  });

  it("retries failed images by resetting task fields", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: "old",
      sourceHash: "old",
      status: "failed",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: null,
      publicUrl: null,
      failureReason: "remote failed",
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    const result = await retryCourseImage(db, "course-1", "image-1");

    expect(result.image).toMatchObject({ id: "image-1", status: "pending", sourceHash: slots[0].sourceHash, stale: false });
    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: expect.objectContaining({
        status: "pending",
        providerTaskId: null,
        providerImageUrl: null,
        storagePath: null,
        publicUrl: null,
        failureReason: null,
      }),
    });
  });

  it("rejects retry for succeeded current images", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "succeeded",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
      publicUrl: "/api/course-images/image-1",
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await expect(retryCourseImage(db, "course-1", "image-1")).rejects.toBeInstanceOf(CourseImageInvalidStateError);
  });

  it("keeps a stale succeeded image by accepting the current hash", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: "old prompt",
      sourceHash: "old-hash",
      status: "succeeded",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
      publicUrl: "/api/course-images/image-1",
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    const result = await keepStaleCourseImage(db, "course-1", "image-1");

    expect(result.image).toMatchObject({ id: "image-1", sourceHash: slots[0].sourceHash, stale: false });
    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: {
        prompt: slots[0].prompt,
        sourceHash: slots[0].sourceHash,
        failureReason: null,
      },
    });
  });

  it("throws not found for missing image id", async () => {
    const { db } = makeDb();

    await expect(keepStaleCourseImage(db, "course-1", "missing")).rejects.toBeInstanceOf(CourseImageNotFoundError);
  });
});

describe("course image queue advancement", () => {
  it("generates one pending image and stores the downloaded local file", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        generate: vi.fn(async () => ({ imageUrl: "https://example.com/a.png" })),
      },
      download: vi.fn(async () => ({
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
      })),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: expect.objectContaining({
        status: "succeeded",
        providerImageUrl: "https://example.com/a.png",
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
        providerTaskId: null,
        failureReason: null,
      }),
    });
  });

  it("marks provider configuration and API errors as failed", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        generate: vi.fn(async () => {
          throw new Error("HY-Image-Lite API Key 缺失");
        }),
      },
      download: vi.fn(),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: { status: "failed", providerTaskId: null, failureReason: "HY-Image-Lite API Key 缺失" },
    });
  });

  it("refreshes stale pending prompts before generating", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    const generate = vi.fn(async () => ({ imageUrl: "https://example.com/a.png" }));
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: "old verbose prompt",
      sourceHash: "old-hash",
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        generate,
      },
      download: vi.fn(async () => ({
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
      })),
    });

    expect(generate).toHaveBeenCalledWith({ prompt: slots[0].prompt, width: 1024, height: 768 });
    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: expect.objectContaining({
        prompt: slots[0].prompt,
        sourceHash: slots[0].sourceHash,
        status: "succeeded",
      }),
    });
  });

  it("downloads succeeded remote image and marks local image succeeded", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "generating",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(),
        query: vi.fn(async () => ({ status: "succeeded", imageUrl: "https://example.com/a.png", failureReason: null })),
      },
      download: vi.fn(async () => ({
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
      })),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: {
        status: "succeeded",
        providerImageUrl: "https://example.com/a.png",
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
        failureReason: null,
      },
    });
  });

  it("marks remote failed jobs as failed", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "generating",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(),
        query: vi.fn(async () => ({ status: "failed", imageUrl: null, failureReason: "content rejected" })),
      },
      download: vi.fn(),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: { status: "failed", failureReason: "content rejected" },
    });
  });
});
