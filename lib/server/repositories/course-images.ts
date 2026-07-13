import { createHash } from "node:crypto";

import type {
  CourseImageProvider,
  CourseImageSlotType,
  CourseResourcePlan,
  CourseResourceImage,
  CourseResourcesResponse,
  LessonDraft,
  ResourceProgress,
} from "@/lib/contracts/api";

export type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";

// A record in any of these statuses already has (or is about to have) an in-flight paid generation, so a new
// generate/regenerate request must not reset it, because doing so would submit a second time and double the AI cost.
const activeImageStatuses: ReadonlySet<CourseImageStatus> = new Set(["pending", "submitting", "generating"]);

export type CourseImageRecord = {
  id: string;
  courseId: string;
  chapterId: string | null;
  shotId: string;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
  sourceExcerpt: string;
  prompt: string;
  promptVersion: string;
  referenceImageIds: string[];
  width: number;
  height: number;
  format: string;
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
  resourcePlan?: {
    plan: CourseResourcePlan;
  } | null;
};

export type CourseImagesDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      include: {
        lessonDraft: true;
        resourcePlan?: true;
      };
    }) => Promise<CourseWithDraft | null>;
    update: (query: { where: { id: string }; data: { status: "building_resources" | "ready" | "build_failed" } }) => Promise<unknown>;
  };
  courseImage: {
    findMany: (query: { where: { courseId: string }; orderBy?: Array<{ slotIndex: "asc" } | { createdAt: "asc" }> }) => Promise<CourseImageRecord[]>;
    createMany: (query: {
      data: Array<{
        courseId: string;
        chapterId: string | null;
        shotId: string;
        slotId: string;
        slotType: CourseImageSlotType;
        slotIndex: number;
        sourceParagraphId: string | null;
        sourceExcerpt: string;
        prompt: string;
        promptVersion: string;
        referenceImageIds: string[];
        width: 1280;
        height: 720;
        format: "webp";
        sourceHash: string;
        status: "pending";
        provider: "tencent_hunyuan";
      }>;
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
    findFirst: (query: { where: { id: string; courseId: string } }) => Promise<CourseImageRecord | null>;
    updateMany: (query: { where: { id: string; status?: CourseImageStatus }; data: Partial<CourseImageRecord> }) => Promise<{ count: number }>;
    update: (query: { where: { id: string }; data: Partial<CourseImageRecord> }) => Promise<CourseImageRecord>;
  };
  courseResourcePlan?: {
    upsert: (query: {
      where: { courseId: string };
      create: { courseId: string; plan: CourseResourcePlan; version: number };
      update: { plan: CourseResourcePlan; version: number };
    }) => Promise<{ courseId: string; plan: CourseResourcePlan; version: number }>;
    update: (query: {
      where: { courseId: string };
      data: { plan?: CourseResourcePlan; version?: number };
    }) => Promise<{ courseId: string; plan: CourseResourcePlan; version: number }>;
  };
};

export type PlannedImageSlot = {
  courseId: string;
  chapterId: string | null;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
  sourceExcerpt: string;
  prompt: string;
  sourceHash: string;
  action: string;
  scenePrompt: string;
  sourceText: string;
  focus: string | null;
  keyObjects: string[];
  referenceSlotIds: string[];
  width: 1280;
  height: 720;
};

export type CourseImageGenerationScope =
  | { scope: "slot"; slotId: string }
  | { scope: "chapter"; chapterId: string }
  | { scope: "all" };

export const maxImagePromptLength = 1200;
const imagePromptSafetySuffix = "Pure image only. No title, captions, subtitles, readable text, letters, numbers, speech bubbles, logo, or watermark.";
const promptVersion = "step4-gpt-image-2-v1";

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

export function hashImageSource(slot: Omit<PlannedImageSlot, "sourceHash"> | PlannedImageSlot) {
  return createHash("sha256")
    .update(
      stableJson({
        promptVersion,
        chapterId: slot.chapterId,
        shotId: slot.shotId,
        slotId: slot.slotId,
        slotType: slot.slotType,
        sourceParagraphId: slot.sourceParagraphId,
        sourceExcerpt: slot.sourceExcerpt,
        prompt: slot.prompt,
        referenceSlotIds: slot.referenceSlotIds,
      }),
    )
    .digest("hex");
}

function paragraphText(paragraph: LessonDraft["chapters"][number]["paragraphs"][number]) {
  return paragraph.sentences.map((sentence) => sentence.text).join(" ").replace(/\s+/g, " ").trim();
}

export function assertResourcePlanValid(plan: CourseResourcePlan, draft: LessonDraft): CourseResourcePlan {
  if (plan.schemaVersion !== "course_resource_plan_v1") {
    throw new CourseImagePrerequisiteError("资源方案格式无效");
  }

  const chapterIds = new Set(draft.chapters.map((chapter) => chapter.id));

  draft.chapters.forEach((chapter, chapterIndex) => {
    const chapterShots = plan.shots
      .filter((shot) => shot.chapterId === chapter.id)
      .sort((left, right) => left.shotOrder - right.shotOrder);

    if (chapterShots.length !== 2 || chapterShots[0]?.shotOrder !== 1 || chapterShots[1]?.shotOrder !== 2) {
      throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章必须有 2 张分镜`);
    }

    chapterShots.forEach((shot) => {
      if (!chapterIds.has(shot.chapterId)) {
        throw new CourseImagePrerequisiteError("资源方案章节不存在");
      }

      const paragraph = chapter.paragraphs[shot.shotOrder - 1];
      if (!paragraph || shot.sourceParagraphId !== paragraph.id) {
        throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章分镜必须按段落顺序绑定`);
      }

      if (shot.sourceExcerpt.replace(/\s+/g, " ").trim() !== paragraphText(paragraph)) {
        throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章分镜必须覆盖对应段落全文`);
      }
    });
  });

  return plan;
}

export function deriveResourceImageSlots(courseId: string, draft: LessonDraft, plan: CourseResourcePlan): PlannedImageSlot[] {
  assertResourcePlanValid(plan, draft);
  const coverBase: Omit<PlannedImageSlot, "sourceHash"> = {
    courseId,
    chapterId: null,
    chapterTitle: "视觉封面",
    shotId: "visual-cover",
    shotOrder: 1,
    slotId: "visual-cover",
    slotType: "visual_cover",
    slotIndex: 0,
    sourceParagraphId: null,
    sourceExcerpt: plan.coverBrief.description,
    prompt: capImagePrompt(plan.coverBrief.imagePrompt),
    action: "视觉基准封面",
    scenePrompt: plan.coverBrief.description,
    sourceText: plan.coverBrief.description,
    focus: plan.coverBrief.description,
    keyObjects: plan.coverBrief.storyElements,
    referenceSlotIds: [],
    width: 1280,
    height: 720,
  };
  const cover = { ...coverBase, sourceHash: hashImageSource(coverBase) };

  const shots = plan.shots
    .slice()
    .sort((left, right) => {
      const leftChapter = draft.chapters.find((chapter) => chapter.id === left.chapterId)?.sourceOutlineChapterIndex ?? 0;
      const rightChapter = draft.chapters.find((chapter) => chapter.id === right.chapterId)?.sourceOutlineChapterIndex ?? 0;
      return leftChapter - rightChapter || left.shotOrder - right.shotOrder;
    })
    .map((shot) => {
      const chapter = draft.chapters.find((item) => item.id === shot.chapterId);
      const base: Omit<PlannedImageSlot, "sourceHash"> = {
        courseId,
        chapterId: shot.chapterId,
        chapterTitle: chapter?.title ?? shot.chapterId,
        shotId: shot.shotId,
        shotOrder: shot.shotOrder,
        slotId: shot.shotId,
        slotType: "lesson_shot",
        slotIndex: ((chapter?.sourceOutlineChapterIndex ?? 1) - 1) * 2 + shot.shotOrder,
        sourceParagraphId: shot.sourceParagraphId,
        sourceExcerpt: shot.sourceExcerpt,
        prompt: capImagePrompt(shot.imagePrompt),
        action: shot.focus,
        scenePrompt: shot.sourceExcerpt,
        sourceText: shot.sourceExcerpt,
        focus: shot.focus,
        keyObjects: shot.keyObjects,
        referenceSlotIds: [],
        width: 1280,
        height: 720,
      };
      return { ...base, sourceHash: hashImageSource(base) };
    });

  return [cover, ...shots];
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
        sourceParagraphId: slot.sourceParagraphId,
        sourceExcerpt: slot.sourceExcerpt,
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
        referenceImageIds: slot.referenceSlotIds,
        width: slot.width,
        height: slot.height,
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
      sourceParagraphId: slot.sourceParagraphId,
      sourceExcerpt: slot.sourceExcerpt,
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
      referenceImageIds: slot.referenceSlotIds,
      width: slot.width,
      height: slot.height,
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

export function toResourcesResponse(images: CourseResourceImage[], plan: CourseResourcePlan | null = null): CourseResourcesResponse {
  return {
    plan,
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
    include: { lessonDraft: true, resourcePlan: true },
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
    plan: course.resourcePlan?.plan ?? null,
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
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : [];
  const records = await listRecords(db, courseId);
  const images = mergeImageSlotsWithRecords(slots, records);
  await refreshCourseStatus(db, courseId, images);
  return toResourcesResponse(images, plan);
}

function imageCreateData(slot: PlannedImageSlot) {
  return {
    courseId: slot.courseId,
    chapterId: slot.chapterId,
    shotId: slot.shotId,
    slotId: slot.slotId,
    slotType: slot.slotType,
    slotIndex: slot.slotIndex,
    sourceParagraphId: slot.sourceParagraphId,
    sourceExcerpt: slot.sourceExcerpt,
    prompt: slot.prompt,
    promptVersion,
    referenceImageIds: slot.referenceSlotIds,
    width: slot.width,
    height: slot.height,
    format: "webp" as const,
    sourceHash: slot.sourceHash,
    status: "pending" as const,
    provider: "tencent_hunyuan" as const,
  };
}

function selectGenerationSlots(slots: PlannedImageSlot[], draft: LessonDraft, request: CourseImageGenerationScope) {
  if (request.scope === "all") {
    return slots;
  }

  if (request.scope === "slot") {
    const slot = slots.find((item) => item.slotId === request.slotId);
    if (!slot) {
      throw new CourseImagePrerequisiteError("图片槽不存在");
    }
    return [slot];
  }

  if (!draft.chapters.some((chapter) => chapter.id === request.chapterId)) {
    throw new CourseImagePrerequisiteError("章节不存在");
  }
  return slots.filter((slot) => slot.slotType === "lesson_shot" && slot.chapterId === request.chapterId);
}

export async function createMissingCourseImages(db: CourseImagesDb, courseId: string, request: CourseImageGenerationScope): Promise<CourseResourcesResponse> {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  const slots = selectGenerationSlots(deriveResourceImageSlots(courseId, draft, plan), draft, request);
  const records = await listRecords(db, courseId);
  const existingSlotIds = new Set(records.map((record) => record.slotId));
  const missing = slots.filter((slot) => !existingSlotIds.has(slot.slotId));

  if (missing.length === 0) {
    throw new CourseImageInvalidStateError("没有需要生成的图片");
  }

  await db.courseImage.createMany({
    data: missing.map(imageCreateData),
    skipDuplicates: true,
  });

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return getCourseResources(db, courseId);
}

export async function saveCourseResourcePlan(db: CourseImagesDb, courseId: string, plan: CourseResourcePlan): Promise<CourseResourcesResponse> {
  if (!db.courseResourcePlan) {
    throw new CourseImagePrerequisiteError("资源方案存储未配置");
  }
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const validPlan = assertResourcePlanValid({ ...plan, version: plan.version || 1 }, draft);
  await db.courseResourcePlan.upsert({
    where: { courseId },
    create: { courseId, plan: validPlan, version: validPlan.version },
    update: { plan: validPlan, version: validPlan.version },
  });
  return getCourseResources(db, courseId);
}

export async function createCoverImage(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  const cover = deriveResourceImageSlots(courseId, draft, plan)[0];
  const records = await listRecords(db, courseId);
  const existing = records.find((record) => record.slotId === cover.slotId);

  if (existing?.status === "succeeded" && existing.sourceHash === cover.sourceHash) {
    throw new CourseImageInvalidStateError("已有可确认的视觉封面");
  }

  if (existing && activeImageStatuses.has(existing.status)) {
    throw new CourseImageInvalidStateError("封面正在生成中，请稍候");
  }

  if (existing) {
    await db.courseImage.update({
      where: { id: existing.id },
      data: {
        ...imageCreateData(cover),
        providerTaskId: null,
        providerImageUrl: null,
        storagePath: null,
        publicUrl: null,
        failureReason: null,
      },
    });
  } else {
    await db.courseImage.createMany({
      data: [imageCreateData(cover)],
      skipDuplicates: true,
    });
  }

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return getCourseResources(db, courseId);
}

export async function retryCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveResourceImageSlots(courseId, draft, plan), record);

  if (!slot) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  const isStaleSucceeded = record.status === "succeeded" && record.sourceHash !== slot.sourceHash;
  if (record.status !== "failed" && !isStaleSucceeded) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  // If the remote image already generated for the same inputs and only the download failed, keep the URL so the
  // queue recovers the download instead of paying for a new generation. Any input change drops it and regenerates.
  const recoveryUrl = record.sourceHash === slot.sourceHash ? recoverableRemoteUrl(record.providerImageUrl) : null;

  const updated = await db.courseImage.update({
    where: { id: imageId },
    data: {
      chapterId: slot.chapterId,
      shotId: slot.shotId,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      sourceParagraphId: slot.sourceParagraphId,
      sourceExcerpt: slot.sourceExcerpt,
      prompt: slot.prompt,
      promptVersion,
      referenceImageIds: slot.referenceSlotIds,
      width: slot.width,
      height: slot.height,
      format: "webp",
      sourceHash: slot.sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: recoveryUrl,
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
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveResourceImageSlots(courseId, draft, plan), record);
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
    submit: (input: { prompt: string; width: 1280; height: 720; referenceImageUrls?: string[] }) => Promise<{ taskId?: string; imageUrl?: string }>;
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

function providerImageUrlForStorage(imageUrl: string) {
  return imageUrl.startsWith("data:") ? null : imageUrl;
}

// A remote provider URL that can still be re-downloaded (data: URLs are one-shot and cannot be recovered).
function recoverableRemoteUrl(imageUrl: string | null) {
  return imageUrl && !imageUrl.startsWith("data:") ? imageUrl : null;
}

// A synchronous submit holds the record in `submitting` while the request is in flight. GPT-image-2 can take
// several minutes, so the timeout must be much longer than the normal 1-3 minute generation window. If the
// request really dies (refresh, dev reload, process restart), this eventually releases the record to retry.
const submittingTimeoutMs = Number(process.env.IMAGE_SUBMITTING_TIMEOUT_MS ?? 900000);

export async function advanceCourseImageQueue(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : [];
  const records = await listRecords(db, courseId);

  const now = Date.now();
  const stuckSubmitting = records.filter(
    (image) => image.status === "submitting" && now - image.updatedAt.getTime() > submittingTimeoutMs,
  );
  for (const image of stuckSubmitting) {
    await db.courseImage.update({
      where: { id: image.id },
      data: { status: "failed", providerTaskId: null, failureReason: "图片提交超时未完成，请重试" },
    });
  }

  const active = records.filter((image) => image.status === "generating");

  for (const image of active) {
    if (!image.providerTaskId) {
      await db.courseImage.update({
        where: { id: image.id },
        data: { status: "failed", failureReason: "图片任务 ID 缺失" },
      });
      continue;
    }

    let remoteImageUrl: string | null = null;
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

      remoteImageUrl = remote.imageUrl;
      const local = await deps.download({ sourceUrl: remote.imageUrl, courseId, imageId: image.id });
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "succeeded",
          providerImageUrl: providerImageUrlForStorage(remote.imageUrl),
          storagePath: local.storagePath,
          publicUrl: local.publicUrl,
          failureReason: null,
        },
      });
    } catch (error) {
      // Keep the remote URL so a retry can recover the download without paying for a new generation.
      const recoverable = recoverableRemoteUrl(remoteImageUrl) ?? image.providerImageUrl;
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "failed",
          providerImageUrl: recoverable,
          failureReason: recoverable ? `图片已生成但下载失败，可重试恢复：${errorMessage(error)}` : errorMessage(error),
        },
      });
    }
  }

  const refreshed = await listRecords(db, courseId);
  const stillActive = refreshed.some((image) => image.status === "generating" || image.status === "submitting");

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
  // A pending record only carries a provider URL after a retry chose to recover a previously generated image,
  // so here it always means "remote already generated, only the download needs to be redone".
  const recoveryUrl = recoverableRemoteUrl(pending.providerImageUrl);

  try {
    const claimed = await db.courseImage.updateMany({
      where: { id: pending.id, status: "pending" },
      data: {
        status: "submitting",
        prompt,
        sourceHash,
        providerTaskId: null,
        providerImageUrl: recoveryUrl,
        failureReason: null,
      },
    });

    if (claimed.count === 0) {
      return;
    }

    if (recoveryUrl) {
      const local = await deps.download({ sourceUrl: recoveryUrl, courseId, imageId: pending.id });
      await db.courseImage.update({
        where: { id: pending.id },
        data: {
          status: "succeeded",
          prompt,
          sourceHash,
          providerTaskId: null,
          providerImageUrl: recoveryUrl,
          storagePath: local.storagePath,
          publicUrl: local.publicUrl,
          failureReason: null,
        },
      });
      return;
    }

    const submitted = await deps.provider.submit({ prompt, width: 1280, height: 720 });
    if (submitted.imageUrl) {
      const remoteUrl = providerImageUrlForStorage(submitted.imageUrl);
      try {
        const local = await deps.download({ sourceUrl: submitted.imageUrl, courseId, imageId: pending.id });
        await db.courseImage.update({
          where: { id: pending.id },
          data: {
            status: "succeeded",
            prompt,
            sourceHash,
            providerTaskId: null,
            providerImageUrl: remoteUrl,
            storagePath: local.storagePath,
            publicUrl: local.publicUrl,
            failureReason: null,
          },
        });
      } catch (downloadError) {
        // Remote generation already succeeded; keep the URL so retry recovers the download for free.
        await db.courseImage.update({
          where: { id: pending.id },
          data: {
            status: "failed",
            prompt,
            sourceHash,
            providerTaskId: null,
            providerImageUrl: remoteUrl,
            failureReason: remoteUrl
              ? `图片已生成但下载失败，可重试恢复：${errorMessage(downloadError)}`
              : errorMessage(downloadError),
          },
        });
      }
      return;
    }

    if (!submitted.taskId) {
      throw new Error("图片服务未返回任务 ID 或图片 URL");
    }

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
  try {
    await advanceCourseImageQueue(db, courseId, deps);
  } catch (error) {
    // Reading Step 4 status must never fail because advancing the paid image queue failed.
    console.error("Advancing course image queue failed", error);
  }
  return getCourseResources(db, courseId);
}
