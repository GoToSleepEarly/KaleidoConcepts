import { createHash } from "node:crypto";

import type {
  CourseImageProvider,
  CourseImageSlotType,
  CourseResourceImage,
  CourseResourcesResponse,
  LessonChapter,
  LessonDraft,
  LessonShot,
  ResourceProgress,
} from "@/lib/contracts/api";

export type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";

export type CourseImageRecord = {
  id: string;
  courseId: string;
  chapterId: string;
  shotId: string;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  prompt: string;
  sourceHash: string;
  status: CourseImageStatus;
  provider: CourseImageProvider;
  providerTaskId: string | null;
  providerImageUrl: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PlannedImageSlot = {
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: "lesson_shot";
  slotIndex: number;
  prompt: string;
  sourceHash: string;
  action: string;
  scenePrompt: string;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function buildImagePrompt(draft: LessonDraft, chapter: LessonChapter, shot: LessonShot) {
  const characterPrompts = draft.characters
    .filter((character) => shot.characterIds.includes(character.id))
    .map((character) => `${character.name}: ${character.appearance}; outfit: ${character.outfit}; ${character.consistencyPrompt}`)
    .join("\n");

  return [
    `Create a children's picture-book illustration in ${draft.visualStyle.artStyle}.`,
    `Use this color palette: ${draft.visualStyle.colorPalette}.`,
    `Aspect ratio: ${draft.visualStyle.aspectRatio}, target size 1024x768.`,
    `Chapter: ${chapter.title}.`,
    `Scene: ${shot.scenePrompt}`,
    `Action: ${shot.action}`,
    `Location: ${shot.location}`,
    `Mood: ${shot.mood}`,
    `Composition: ${shot.composition}`,
    `Continuity: ${shot.continuityNotes}`,
    `Global style consistency: ${draft.visualStyle.consistencyPrompt}`,
    `Character consistency:\n${characterPrompts}`,
    "No text, no letters, no captions, no speech bubbles, no watermark.",
  ].join("\n");
}

export function hashImageSource(slot: Omit<PlannedImageSlot, "sourceHash"> | PlannedImageSlot) {
  return createHash("sha256")
    .update(
      stableJson({
        chapterId: slot.chapterId,
        shotId: slot.shotId,
        slotId: slot.slotId,
        prompt: slot.prompt,
      }),
    )
    .digest("hex");
}

export function deriveLessonShotImageSlots(courseId: string, draft: LessonDraft): PlannedImageSlot[] {
  return draft.chapters.flatMap((chapter) =>
    chapter.shots.map((shot) => {
      const base = {
        courseId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        shotId: shot.id,
        shotOrder: shot.order,
        slotId: shot.imageSlotId,
        slotType: "lesson_shot" as const,
        slotIndex: shot.order,
        prompt: buildImagePrompt(draft, chapter, shot),
        action: shot.action,
        scenePrompt: shot.scenePrompt,
      };

      return {
        ...base,
        sourceHash: hashImageSource(base),
      };
    }),
  );
}

export function mergeImageSlotsWithRecords(slots: PlannedImageSlot[], records: CourseImageRecord[]): CourseResourceImage[] {
  return slots.map((slot) => {
    const record = records.find((image) => image.slotId === slot.slotId);

    if (!record) {
      return {
        id: null,
        courseId: slot.courseId,
        chapterId: slot.chapterId,
        chapterTitle: slot.chapterTitle,
        shotId: slot.shotId,
        shotOrder: slot.shotOrder,
        slotId: slot.slotId,
        slotType: slot.slotType,
        slotIndex: slot.slotIndex,
        prompt: slot.prompt,
        sourceHash: null,
        currentSourceHash: slot.sourceHash,
        stale: false,
        status: "missing",
        provider: "tencent_hunyuan",
        providerTaskId: null,
        providerImageUrl: null,
        publicUrl: null,
        failureReason: null,
        action: slot.action,
        scenePrompt: slot.scenePrompt,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      id: record.id,
      courseId: record.courseId,
      chapterId: slot.chapterId,
      chapterTitle: slot.chapterTitle,
      shotId: slot.shotId,
      shotOrder: slot.shotOrder,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: record.sourceHash,
      currentSourceHash: slot.sourceHash,
      stale: record.status === "succeeded" && record.sourceHash !== slot.sourceHash,
      status: record.status,
      provider: record.provider,
      providerTaskId: record.providerTaskId,
      providerImageUrl: record.providerImageUrl,
      publicUrl: record.publicUrl,
      failureReason: record.failureReason,
      action: slot.action,
      scenePrompt: slot.scenePrompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

export function summarizeResourceProgress(images: CourseResourceImage[]): ResourceProgress {
  return {
    total: images.length,
    succeeded: images.filter((image) => image.status === "succeeded" && !image.stale).length,
    generating: images.filter((image) => image.status === "pending" || image.status === "submitting" || image.status === "generating").length,
    failed: images.filter((image) => image.status === "failed").length,
    missing: images.filter((image) => image.status === "missing").length,
    stale: images.filter((image) => image.stale).length,
  };
}

export function toResourcesResponse(images: CourseResourceImage[]): CourseResourcesResponse {
  return {
    progress: summarizeResourceProgress(images),
    images,
  };
}
