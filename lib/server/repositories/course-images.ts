import { createHash } from "node:crypto";

import type {
  CourseImageProvider,
  CourseImageSlotType,
  CourseResourceImage,
  CourseResourcesResponse,
  LessonBlock,
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

type CourseWithDraft = {
  id: string;
  status: "draft" | "building_resources" | "ready" | "build_failed";
  lessonDraft: {
    content: LessonDraft;
  } | null;
};

export type CourseImagesDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      include: {
        lessonDraft: true;
      };
    }) => Promise<CourseWithDraft | null>;
    update: (query: { where: { id: string }; data: { status: "building_resources" | "ready" | "build_failed" } }) => Promise<unknown>;
  };
  courseImage: {
    findMany: (query: { where: { courseId: string }; orderBy?: Array<{ slotIndex: "asc" } | { createdAt: "asc" }> }) => Promise<CourseImageRecord[]>;
    createMany: (query: {
      data: Array<{
        courseId: string;
        chapterId: string;
        shotId: string;
        slotId: string;
        slotType: "lesson_shot";
        slotIndex: number;
        prompt: string;
        sourceHash: string;
        status: "pending";
        provider: "tencent_hunyuan";
      }>;
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
    findFirst: (query: { where: { id: string; courseId: string } }) => Promise<CourseImageRecord | null>;
    update: (query: { where: { id: string }; data: Partial<CourseImageRecord> }) => Promise<CourseImageRecord>;
  };
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
  sourceText: string;
  focus: string | null;
  keyObjects: string[];
};

export const maxImagePromptLength = 2200;
const imagePromptSafetySuffix = "No text, no letters, no captions, no speech bubbles, no watermark.";

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

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

export function capImagePrompt(value: string, suffix = imagePromptSafetySuffix) {
  const normalizedSuffix = suffix.replace(/\s+/g, " ").trim();
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxImagePromptLength && normalized.endsWith(normalizedSuffix)) {
    return normalized;
  }

  const body = normalized.endsWith(normalizedSuffix) ? normalized.slice(0, -normalizedSuffix.length).trim() : normalized;
  const separator = body ? " " : "";
  const bodyLimit = Math.max(0, maxImagePromptLength - normalizedSuffix.length - separator.length);
  const cappedBody = compactText(body, bodyLimit);
  return `${cappedBody}${separator}${normalizedSuffix}`.trim();
}

function textFromBlocks(blocks: LessonBlock[], blockIds: string[]) {
  const idSet = new Set(blockIds);
  return blocks
    .filter((block) => idSet.has(block.id))
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      if (block.type === "text") {
        return block.text;
      }

      return block.display.kind === "verb_blank" ? `[blank: ${block.display.prompt}]` : `[word hint: ${block.display.pattern}]`;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function characterLockText(draft: LessonDraft, shot: LessonShot) {
  return draft.characters
    .filter((character) => shot.characterIds.includes(character.id))
    .map((character) =>
      [
        `${character.name} (${character.role})`,
        `appearance: ${character.appearance}`,
        `face/eyes: ${character.faceAndEyes ?? character.appearance}`,
        `hair: ${character.hair ?? character.appearance}`,
        `outfit: ${character.outfit}`,
        `signature: ${(character.signatureFeatures ?? []).join(", ") || character.consistencyPrompt}`,
        `visual cue: ${character.personalityVisualCue ?? "friendly child-friendly expression"}`,
      ].join("; "),
    )
    .join("\n");
}

export function buildImagePrompt(draft: LessonDraft, chapter: LessonChapter, shot: LessonShot) {
  const sourceText = compactText(textFromBlocks(chapter.blocks, shot.coveredBlockIds), 520);

  return capImagePrompt([
    "STYLE LOCK:",
    `cute, detailed cartoon picture-book illustration for children; rounded shapes; expressive eyes; warm soft lighting; clear focal action; ${draft.visualStyle.artStyle}.`,
    `Palette: ${draft.visualStyle.colorPalette}.`,
    `Consistency: ${draft.visualStyle.consistencyPrompt}`,
    `Student appeal: ${draft.visualStyle.studentAppealPrompt ?? "friendly, playful, visually rich but not cluttered."}`,
    "",
    "CHARACTER LOCK:",
    characterLockText(draft, shot),
    "",
    "SCENE LOCK:",
    `Location: ${shot.location}.`,
    `Spatial details: ${shot.spatialDetails ?? "keep important objects in stable, readable positions."}`,
    `Continuity: ${shot.continuityNotes}`,
    "",
    "TEXT ANCHOR:",
    sourceText,
    "",
    "SHOT FOCUS:",
    `Chapter: ${chapter.title}.`,
    `Story action: ${shot.action}`,
    `Visual focus: ${shot.focus ?? shot.action}`,
    `Key objects: ${(shot.keyObjects ?? []).join(", ") || "main story object"}`,
    `Mood: ${shot.mood}.`,
    `Scene: ${shot.scenePrompt}`,
    `Composition: ${shot.composition}`,
    `Student-friendly detail: ${shot.studentAppeal ?? "make the important story moment cute, clear, and engaging."}`,
    "",
    "OUTPUT:",
    "4:3 wide picture-book image, 1024x768, main character and key object clearly readable, background supports the story and does not steal focus.",
    imagePromptSafetySuffix,
  ].join("\n"));
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
        sourceText: textFromBlocks(chapter.blocks, shot.coveredBlockIds),
        focus: shot.focus ?? null,
        keyObjects: shot.keyObjects ?? [],
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
        sourceText: slot.sourceText,
        focus: slot.focus,
        keyObjects: slot.keyObjects,
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
      sourceText: slot.sourceText,
      focus: slot.focus,
      keyObjects: slot.keyObjects,
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

export class CourseImageNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CourseImageNotFoundError";
  }
}

export class CourseImagePrerequisiteError extends Error {
  constructor(message = "请先生成课文草稿") {
    super(message);
    this.name = "CourseImagePrerequisiteError";
  }
}

export class CourseImageInvalidStateError extends Error {
  constructor(message = "当前图片状态不能执行该操作") {
    super(message);
    this.name = "CourseImageInvalidStateError";
  }
}

async function getCourseDraftOrThrow(db: CourseImagesDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { lessonDraft: true },
  });

  if (!course) {
    throw new CourseImageNotFoundError("课程不存在");
  }

  if (!course.lessonDraft) {
    throw new CourseImagePrerequisiteError();
  }

  return {
    course,
    draft: course.lessonDraft.content,
  };
}

async function listRecords(db: CourseImagesDb, courseId: string) {
  return db.courseImage.findMany({
    where: { courseId },
    orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }],
  });
}

function findSlot(slots: PlannedImageSlot[], record: CourseImageRecord) {
  return slots.find((slot) => slot.slotId === record.slotId);
}

async function refreshCourseStatus(db: CourseImagesDb, courseId: string, images: CourseResourceImage[]) {
  const progress = summarizeResourceProgress(images);

  if (progress.total > 0 && progress.succeeded === progress.total && progress.stale === 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "ready" } });
    return;
  }

  if (progress.generating > 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
    return;
  }

  if (progress.failed > 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "build_failed" } });
  }
}

export async function getCourseResources(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const slots = deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const images = mergeImageSlotsWithRecords(slots, records);
  await refreshCourseStatus(db, courseId, images);
  return toResourcesResponse(images);
}

export async function createMissingCourseImages(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const slots = deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const existingSlotIds = new Set(records.map((record) => record.slotId));
  const missing = slots.filter((slot) => !existingSlotIds.has(slot.slotId));

  if (missing.length === 0) {
    throw new CourseImageInvalidStateError("没有需要生成的图片");
  }

  await db.courseImage.createMany({
    data: missing.map((slot) => ({
      courseId: slot.courseId,
      chapterId: slot.chapterId,
      shotId: slot.shotId,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
    })),
    skipDuplicates: true,
  });

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return getCourseResources(db, courseId);
}

export async function retryCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveLessonShotImageSlots(courseId, draft), record);

  if (!slot) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  const isStaleSucceeded = record.status === "succeeded" && record.sourceHash !== slot.sourceHash;
  if (record.status !== "failed" && !isStaleSucceeded) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  const updated = await db.courseImage.update({
    where: { id: imageId },
    data: {
      chapterId: slot.chapterId,
      shotId: slot.shotId,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
    },
  });

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return {
    image: mergeImageSlotsWithRecords([slot], [updated])[0],
  };
}

export async function keepStaleCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveLessonShotImageSlots(courseId, draft), record);
  const isStaleSucceeded = slot && record.status === "succeeded" && record.sourceHash !== slot.sourceHash;

  if (!slot || !isStaleSucceeded) {
    throw new CourseImageInvalidStateError("当前图片不能沿用旧图");
  }

  const updated = await db.courseImage.update({
    where: { id: imageId },
    data: {
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      failureReason: null,
    },
  });

  return {
    image: mergeImageSlotsWithRecords([slot], [updated])[0],
  };
}

export type CourseImageQueueDeps = {
  provider: {
    submit: (input: { prompt: string; width: 1024; height: 768 }) => Promise<{ taskId: string }>;
    query: (input: { taskId: string }) => Promise<
      | { status: "generating"; imageUrl: null; failureReason: null }
      | { status: "succeeded"; imageUrl: string; failureReason: null }
      | { status: "failed"; imageUrl: null; failureReason: string }
    >;
  };
  download: (input: { sourceUrl: string; courseId: string; imageId: string }) => Promise<{ storagePath: string; publicUrl: string }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "图片任务处理失败";
}

export async function advanceCourseImageQueue(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const slots = deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const active = records.filter((image) => image.status === "generating");

  for (const image of active) {
    if (!image.providerTaskId) {
      await db.courseImage.update({
        where: { id: image.id },
        data: { status: "failed", failureReason: "腾讯混元任务 ID 缺失" },
      });
      continue;
    }

    try {
      const remote = await deps.provider.query({ taskId: image.providerTaskId });

      if (remote.status === "generating") {
        continue;
      }

      if (remote.status === "failed") {
        await db.courseImage.update({
          where: { id: image.id },
          data: { status: "failed", failureReason: remote.failureReason },
        });
        continue;
      }

      const local = await deps.download({ sourceUrl: remote.imageUrl, courseId, imageId: image.id });
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "succeeded",
          providerImageUrl: remote.imageUrl,
          storagePath: local.storagePath,
          publicUrl: local.publicUrl,
          failureReason: null,
        },
      });
    } catch (error) {
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "failed",
          providerImageUrl: image.providerImageUrl,
          failureReason: errorMessage(error),
        },
      });
    }
  }

  const refreshed = await listRecords(db, courseId);
  const stillActive = refreshed.some((image) => image.status === "generating");

  if (stillActive) {
    return;
  }

  const pending = refreshed.find((image) => image.status === "pending");

  if (!pending) {
    return;
  }

  const pendingSlot = findSlot(slots, pending);
  const prompt = pendingSlot?.prompt ?? pending.prompt;
  const sourceHash = pendingSlot?.sourceHash ?? pending.sourceHash;

  try {
    const submitted = await deps.provider.submit({ prompt, width: 1024, height: 768 });
    await db.courseImage.update({
      where: { id: pending.id },
      data: {
        status: "generating",
        prompt,
        sourceHash,
        providerTaskId: submitted.taskId,
        failureReason: null,
      },
    });
  } catch (error) {
    await db.courseImage.update({
      where: { id: pending.id },
      data: { status: "failed", providerTaskId: null, failureReason: errorMessage(error) },
    });
  }
}

export async function getCourseResourcesAndAdvance(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  await advanceCourseImageQueue(db, courseId, deps);
  return getCourseResources(db, courseId);
}
