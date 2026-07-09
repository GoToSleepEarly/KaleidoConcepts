import { describe, expect, it, vi } from "vitest";

import type { LessonDraft } from "@/lib/contracts/api";
import { deriveLessonShotImageSlots, type CourseImageRecord } from "@/lib/server/repositories/course-images";
import { CoursePreviewNotFoundError, CoursePreviewPrerequisiteError, getCoursePreview, toPreviewPages } from "./course-preview";

function draft(): LessonDraft {
  return {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: "story-1",
    generationMode: "ai",
    title: "The Moon Gate",
    language: "en",
    visualStyle: {
      artStyle: "warm watercolor",
      colorPalette: "mint and gold",
      aspectRatio: "4:3",
      consistencyPrompt: "Use the same picture-book style.",
    },
    characters: [],
    chapters: [
      {
        id: "chapter-1",
        sourceOutlineChapterIndex: 1,
        title: "The First Gate",
        wordTarget: { min: 110, max: 130 },
        exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
        blocks: [
          { id: "block-1", order: 1, type: "text", text: "Summer opens the gate." },
          {
            id: "block-2",
            order: 2,
            type: "exercise",
            exerciseId: "exercise-1",
            display: { kind: "verb_blank", placeholder: "________", prompt: "open" },
          },
          { id: "block-3", order: 3, type: "text", text: "The moon path shines." },
        ],
        exercises: [{ id: "exercise-1", type: "verb_blank", answer: "opens", baseVerb: "open" }],
        shots: [
          {
            id: "shot-1",
            order: 1,
            imageSlotId: "slot-1",
            coveredBlockIds: ["block-1", "block-2"],
            characterIds: [],
            location: "garden gate",
            action: "Summer opens a gate.",
            mood: "curious",
            scenePrompt: "A gate glows.",
            composition: "Wide 4:3 page.",
            continuityNotes: "Keep style consistent.",
          },
          {
            id: "shot-2",
            order: 2,
            imageSlotId: "slot-2",
            coveredBlockIds: ["block-3"],
            characterIds: [],
            location: "moon path",
            action: "Summer follows the moon path.",
            mood: "brave",
            scenePrompt: "A moon path shines.",
            composition: "Wide 4:3 page.",
            continuityNotes: "Keep style consistent.",
          },
        ],
      },
    ],
    closingReading: {
      title: "After the Gate",
      text: "Summer remembers the moon gate.",
      vocabularyTerms: ["gate", "path"],
    },
  };
}

function imageRecord(slotId: string, patch: Partial<CourseImageRecord> = {}): CourseImageRecord {
  const currentSlot = deriveLessonShotImageSlots("course-1", draft()).find((slot) => slot.slotId === slotId);

  return {
    id: `image-${slotId}`,
    courseId: "course-1",
    chapterId: "chapter-1",
    shotId: slotId === "slot-1" ? "shot-1" : "shot-2",
    slotId,
    slotType: "lesson_shot",
    slotIndex: slotId === "slot-1" ? 1 : 2,
    prompt: "prompt",
    sourceHash: currentSlot?.sourceHash ?? "hash",
    status: "succeeded",
    provider: "tencent_hunyuan",
    providerTaskId: null,
    providerImageUrl: null,
    storagePath: "/data/image.png",
    publicUrl: `/api/course-images/course-1/${slotId}.png`,
    failureReason: null,
    createdAt: new Date("2026-07-09T00:00:00Z"),
    updatedAt: new Date("2026-07-09T00:00:00Z"),
    ...patch,
  };
}

describe("course preview pages", () => {
  it("builds cover, shot, and closing pages from a lesson draft", () => {
    const sampleDraft = draft();
    const pages = toPreviewPages("course-1", sampleDraft, []);

    expect(pages.map((page) => page.type)).toEqual(["cover", "lesson_shot", "lesson_shot", "closing_reading"]);
    expect(pages[1]).toMatchObject({
      type: "lesson_shot",
      chapterTitle: "The First Gate",
      shotOrder: 1,
      blocks: [
        { id: "block-1", type: "text" },
        { id: "block-2", type: "exercise" },
      ],
      exercises: [{ id: "exercise-1", answer: "opens" }],
      image: { status: "missing", publicUrl: null, stale: false },
    });
  });

  it("keeps shot blocks in draft order and only includes covered ids", () => {
    const pages = toPreviewPages("course-1", draft(), []);
    const secondShot = pages[2];

    expect(secondShot).toMatchObject({
      type: "lesson_shot",
      blocks: [{ id: "block-3", order: 3 }],
      exercises: [],
    });
  });

  it("binds successful, failed, and stale image status", () => {
    const sampleDraft = draft();
    const pages = toPreviewPages("course-1", sampleDraft, [
      imageRecord("slot-1"),
      imageRecord("slot-2", {
        status: "failed",
        publicUrl: null,
        failureReason: "remote failed",
      }),
    ]);

    expect(pages[1]).toMatchObject({
      type: "lesson_shot",
      image: {
        status: "succeeded",
        publicUrl: "/api/course-images/course-1/slot-1.png",
      },
    });
    expect(pages[2]).toMatchObject({
      type: "lesson_shot",
      image: {
        status: "failed",
        failureReason: "remote failed",
      },
    });

    const stalePages = toPreviewPages("course-1", sampleDraft, [imageRecord("slot-1", { sourceHash: "old-hash" })]);
    expect(stalePages[1]).toMatchObject({ type: "lesson_shot", image: { stale: true } });
  });
});

describe("course preview repository", () => {
  function makeDb(lessonDraft: { content: LessonDraft } | null = { content: draft() }) {
    return {
      course: {
        findUnique: vi.fn(async () => ({
          id: "course-1",
          title: "The Moon Gate Course",
          englishLevel: "A1",
          durationMinutes: 45,
          theme: "Nature",
          grammar: ["Past Simple"],
          people: [
            { person: { role: "teacher", name: "Ms. Lin", englishName: null, chineseName: null } },
            { person: { role: "student", name: "Summer", englishName: "Summer", chineseName: "夏天" } },
          ],
          lessonDraft,
        })),
      },
      courseImage: {
        findMany: vi.fn(async () => [imageRecord("slot-1")]),
      },
    };
  }

  it("returns course metadata, progress, and preview pages", async () => {
    const db = makeDb();
    const result = await getCoursePreview(db, "course-1");

    expect(result.course).toMatchObject({
      id: "course-1",
      title: "The Moon Gate Course",
      teacherName: "Ms. Lin",
      studentNames: ["Summer"],
      englishLevel: "A1",
      durationMinutes: 45,
      theme: "Nature",
      grammar: ["Past Simple"],
    });
    expect(result.resourceProgress).toMatchObject({ total: 2, succeeded: 1, missing: 1 });
    expect(result.pages).toHaveLength(4);
  });

  it("throws a prerequisite error when lesson draft is missing", async () => {
    await expect(getCoursePreview(makeDb(null), "course-1")).rejects.toBeInstanceOf(CoursePreviewPrerequisiteError);
  });

  it("throws a not found error when the course does not exist", async () => {
    const db = {
      course: {
        findUnique: vi.fn(async () => null),
      },
      courseImage: {
        findMany: vi.fn(),
      },
    };

    await expect(getCoursePreview(db, "missing")).rejects.toBeInstanceOf(CoursePreviewNotFoundError);
  });
});
