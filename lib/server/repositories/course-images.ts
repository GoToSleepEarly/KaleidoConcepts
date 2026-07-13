import { createHash } from "node:crypto";

import type {
  CourseImageProvider,
  CourseImageSlotType,
  CourseResourcePlan,
  CourseResourceImage,
  CourseResourcesResponse,
  LessonContentChapter,
  LessonDraft,
  ResourceProgress,
} from "@/lib/contracts/api";

export type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";

export type CourseImageRecord = {
  id: string;
  courseId: string;
  chapterId: string | null;
  shotId: string;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
  sourceSentenceIds: string[];
  heroMomentSentenceId: string | null;
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
    confirmedCoverImageId: string | null;
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
        sourceSentenceIds: string[];
        heroMomentSentenceId: string | null;
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
      create: { courseId: string; plan: CourseResourcePlan; version: number; confirmedCoverImageId: string | null };
      update: { plan: CourseResourcePlan; version: number; confirmedCoverImageId: string | null };
    }) => Promise<{ courseId: string; plan: CourseResourcePlan; version: number; confirmedCoverImageId: string | null }>;
    update: (query: {
      where: { courseId: string };
      data: { plan?: CourseResourcePlan; version?: number; confirmedCoverImageId?: string | null };
    }) => Promise<{ courseId: string; plan: CourseResourcePlan; version: number; confirmedCoverImageId: string | null }>;
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
  sourceSentenceIds: string[];
  heroMomentSentenceId: string | null;
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

export const maxImagePromptLength = 1000;
const gptImage2StyleLock =
  "Hand-drawn children's comic picture-book illustration, warm Japanese animation film feeling, clean expressive linework, soft watercolor-and-gouache texture, warm golden light, natural childlike expressions.";
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

function textFromParagraph(chapter: LessonContentChapter, paragraphIndex: number) {
  const paragraph = chapter.paragraphs[paragraphIndex];
  return paragraph.sentences.map((sentence) => sentence.text).join(" ").replace(/\s+/g, " ").trim();
}

export function buildImagePrompt(_draft: LessonDraft, chapter: LessonContentChapter, paragraphIndex: number) {
  const sourceText = compactText(textFromParagraph(chapter, paragraphIndex), 520);

  return capImagePrompt([
    "STYLE:",
    gptImage2StyleLock,
    "",
    "TEXT ANCHOR:",
    sourceText,
    "",
    "SCENE:",
    `Chapter: ${chapter.title}.`,
    `Story action: show the key moment from paragraph ${paragraphIndex + 1}.`,
    "Visual focus: the teacher, students, main story object, and action described in the text.",
    "Mood: warm, curious, child-friendly, safe.",
    "",
    "OUTPUT:",
    "Horizontal classroom slide illustration, rich but readable, main character and key object clearly readable, background supports the story and does not steal focus.",
    imagePromptSafetySuffix,
  ].join("\n"));
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
        sourceSentenceIds: slot.sourceSentenceIds,
        prompt: slot.prompt,
        referenceSlotIds: slot.referenceSlotIds,
      }),
    )
    .digest("hex");
}

function sentenceMap(draft: LessonDraft) {
  const map = new Map<string, { chapterId: string; paragraphId: string; text: string }>();
  draft.chapters.forEach((chapter) =>
    chapter.paragraphs.forEach((paragraph) =>
      paragraph.sentences.forEach((sentence) => {
        map.set(sentence.id, { chapterId: chapter.id, paragraphId: paragraph.id, text: sentence.text });
      }),
    ),
  );
  return map;
}

export function assertResourcePlanValid(plan: CourseResourcePlan, draft: LessonDraft): CourseResourcePlan {
  if (plan.schemaVersion !== "course_resource_plan_v1") {
    throw new CourseImagePrerequisiteError("资源方案格式无效");
  }

  const sentences = sentenceMap(draft);
  const chapterIds = new Set(draft.chapters.map((chapter) => chapter.id));

  draft.chapters.forEach((chapter, chapterIndex) => {
    const chapterShots = plan.shots
      .filter((shot) => shot.chapterId === chapter.id)
      .sort((left, right) => left.shotOrder - right.shotOrder);

    if (chapterShots.length !== 2 || chapterShots[0]?.shotOrder !== 1 || chapterShots[1]?.shotOrder !== 2) {
      throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章必须有 2 张分镜`);
    }

    const used = new Set<string>();
    chapterShots.forEach((shot) => {
      if (!chapterIds.has(shot.chapterId)) {
        throw new CourseImagePrerequisiteError("资源方案章节不存在");
      }

      if (!shot.sourceSentenceIds.length) {
        throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章分镜缺少来源句子`);
      }

      shot.sourceSentenceIds.forEach((sentenceId) => {
        const sentence = sentences.get(sentenceId);
        if (!sentence || sentence.chapterId !== chapter.id || sentence.paragraphId !== shot.sourceParagraphId) {
          throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章分镜来源句子无效`);
        }
        if (used.has(sentenceId)) {
          throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章分镜来源句子重复`);
        }
        used.add(sentenceId);
      });

      if (!shot.sourceSentenceIds.includes(shot.heroMomentSentenceId)) {
        throw new CourseImagePrerequisiteError(`第 ${chapterIndex + 1} 章核心句子不在分镜范围内`);
      }
    });
  });

  return plan;
}

function visualProfilePrompt(plan: CourseResourcePlan) {
  return [
    `Style: ${plan.visualProfile.style}.`,
    `Palette: ${plan.visualProfile.palette}.`,
    `World: ${plan.visualProfile.world}.`,
    `Mood: ${plan.visualProfile.mood}.`,
    "Named cast:",
    plan.visualProfile.characters
      .map(
        (character) =>
          `${character.alias}: ${compactText(`${character.appearance}; ${character.hairstyle}; ${character.clothing}; ${character.signatureColor}`, 160)}.`,
      )
      .join("\n"),
  ].join("\n");
}

function castLockPrompt(plan: CourseResourcePlan, aliases: string[]) {
  const cast = aliases.length ? aliases.join(", ") : plan.visualProfile.characters.map((character) => character.alias).join(", ");
  return [
    "EXACT CAST ONLY:",
    `Show only these named characters: ${cast}.`,
    "Do not add any extra students, classmates, teachers, parents, crowd, background people, or unnamed humans.",
  ].join("\n");
}

function outputSpecPrompt() {
  return [
    "OUTPUT:",
    gptImage2StyleLock,
    "Horizontal full-bleed children's storybook image. Keep main characters, action, and key objects inside the central safe area.",
    imagePromptSafetySuffix,
  ].join("\n");
}

function buildCoverPrompt(plan: CourseResourcePlan) {
  return capImagePrompt([
    castLockPrompt(plan, plan.coverBrief.characters),
    "",
    "COVER GOAL:",
    "Story poster key art with a memorable central visual hook, not a generic group portrait. Make the main story object and setting instantly recognizable.",
    "",
    "COVER BRIEF:",
    compactText(plan.coverBrief.description, 180),
    `Setting: ${compactText(plan.coverBrief.setting, 90)}.`,
    `Story elements: ${compactText(plan.coverBrief.storyElements.join(", "), 90)}.`,
    "",
    "VISUAL DIRECTION:",
    visualProfilePrompt(plan),
    "",
    outputSpecPrompt(),
  ].join("\n"));
}

function buildShotPrompt(plan: CourseResourcePlan, shot: CourseResourcePlan["shots"][number]) {
  return capImagePrompt([
    castLockPrompt(plan, shot.characters),
    "",
    "SCENE GOAL:",
    `Show: ${compactText(shot.focus, 140)}.`,
    `Key objects: ${compactText(shot.keyObjects.join(", "), 90)}.`,
    `Composition: ${compactText(shot.composition, 120)}.`,
    "",
    "TEXT:",
    compactText(shot.sourceExcerpt, 170),
    "",
    "VISUAL DIRECTION:",
    visualProfilePrompt(plan),
    "",
    outputSpecPrompt(),
    "Do not add events that are not in the text.",
  ].join("\n"));
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
    sourceSentenceIds: [],
    heroMomentSentenceId: null,
    sourceExcerpt: plan.coverBrief.description,
    prompt: buildCoverPrompt(plan),
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
        sourceSentenceIds: shot.sourceSentenceIds,
        heroMomentSentenceId: shot.heroMomentSentenceId,
        sourceExcerpt: shot.sourceExcerpt,
        prompt: buildShotPrompt(plan, shot),
        action: shot.focus,
        scenePrompt: shot.sourceExcerpt,
        sourceText: shot.sourceExcerpt,
        focus: shot.focus,
        keyObjects: shot.keyObjects,
        referenceSlotIds: ["visual-cover"],
        width: 1280,
        height: 720,
      };
      return { ...base, sourceHash: hashImageSource(base) };
    });

  return [cover, ...shots];
}

export function deriveLessonShotImageSlots(courseId: string, draft: LessonDraft): PlannedImageSlot[] {
  return draft.chapters.flatMap((chapter) =>
    chapter.paragraphs.map((paragraph, paragraphIndex) => {
      const shotOrder = (paragraphIndex + 1) as 1 | 2;
      const sourceText = textFromParagraph(chapter, paragraphIndex);
      const base = {
        courseId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        shotId: `${chapter.id}-shot-${shotOrder}`,
        shotOrder,
        slotId: `${chapter.id}-image-${shotOrder}`,
        slotType: "lesson_shot" as const,
        slotIndex: (chapter.sourceOutlineChapterIndex - 1) * 2 + shotOrder,
        sourceParagraphId: paragraph.id,
        sourceSentenceIds: paragraph.sentences.map((sentence) => sentence.id),
        heroMomentSentenceId: paragraph.sentences[0]?.id ?? null,
        sourceExcerpt: sourceText,
        prompt: buildImagePrompt(draft, chapter, paragraphIndex),
        action: `Paragraph ${shotOrder} illustration`,
        scenePrompt: sourceText,
        sourceText,
        focus: null,
        keyObjects: [],
        referenceSlotIds: [],
        width: 1280 as const,
        height: 720 as const,
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
        chapterId: slot.chapterId ?? "",
        chapterTitle: slot.chapterTitle,
        shotId: slot.shotId,
        shotOrder: slot.shotOrder,
        slotId: slot.slotId,
        slotType: slot.slotType,
        slotIndex: slot.slotIndex,
        sourceParagraphId: slot.sourceParagraphId,
        sourceSentenceIds: slot.sourceSentenceIds,
        heroMomentSentenceId: slot.heroMomentSentenceId,
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
      chapterId: slot.chapterId ?? "",
      chapterTitle: slot.chapterTitle,
      shotId: slot.shotId,
      shotOrder: slot.shotOrder,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      sourceParagraphId: slot.sourceParagraphId,
      sourceSentenceIds: slot.sourceSentenceIds,
      heroMomentSentenceId: slot.heroMomentSentenceId,
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
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const images = mergeImageSlotsWithRecords(slots, records);
  await refreshCourseStatus(db, courseId, images);
  return toResourcesResponse(images, plan);
}

export async function createMissingCourseImages(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  if (!plan.confirmedCoverImageId) {
    throw new CourseImageInvalidStateError("请先确认视觉封面");
  }
  const slots = deriveResourceImageSlots(courseId, draft, plan).filter((slot) => slot.slotType === "lesson_shot");
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
        sourceParagraphId: slot.sourceParagraphId,
        sourceSentenceIds: slot.sourceSentenceIds,
        heroMomentSentenceId: slot.heroMomentSentenceId,
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
    })),
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
  const validPlan = assertResourcePlanValid({ ...plan, confirmedCoverImageId: null, version: plan.version || 1 }, draft);
  await db.courseResourcePlan.upsert({
    where: { courseId },
    create: { courseId, plan: validPlan, version: validPlan.version, confirmedCoverImageId: null },
    update: { plan: validPlan, version: validPlan.version, confirmedCoverImageId: null },
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

  if (existing) {
    await db.courseImage.update({
      where: { id: existing.id },
      data: {
        chapterId: cover.chapterId,
        shotId: cover.shotId,
        slotId: cover.slotId,
        slotType: cover.slotType,
        slotIndex: cover.slotIndex,
        sourceParagraphId: cover.sourceParagraphId,
        sourceSentenceIds: cover.sourceSentenceIds,
        heroMomentSentenceId: cover.heroMomentSentenceId,
        sourceExcerpt: cover.sourceExcerpt,
        prompt: cover.prompt,
        promptVersion,
        referenceImageIds: cover.referenceSlotIds,
        width: cover.width,
        height: cover.height,
        format: "webp",
        sourceHash: cover.sourceHash,
        status: "pending",
        provider: "tencent_hunyuan",
        providerTaskId: null,
        providerImageUrl: null,
        storagePath: null,
        publicUrl: null,
        failureReason: null,
      },
    });
  } else {
    await db.courseImage.createMany({
      data: [
        {
          courseId: cover.courseId,
          chapterId: cover.chapterId,
          shotId: cover.shotId,
          slotId: cover.slotId,
          slotType: cover.slotType,
          slotIndex: cover.slotIndex,
          sourceParagraphId: cover.sourceParagraphId,
          sourceSentenceIds: cover.sourceSentenceIds,
          heroMomentSentenceId: cover.heroMomentSentenceId,
          sourceExcerpt: cover.sourceExcerpt,
          prompt: cover.prompt,
          promptVersion,
          referenceImageIds: cover.referenceSlotIds,
          width: cover.width,
          height: cover.height,
          format: "webp",
          sourceHash: cover.sourceHash,
          status: "pending",
          provider: "tencent_hunyuan",
        },
      ],
      skipDuplicates: true,
    });
  }

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return getCourseResources(db, courseId);
}

export async function confirmCoverImage(db: CourseImagesDb, courseId: string, imageId: string): Promise<CourseResourcesResponse> {
  if (!db.courseResourcePlan) {
    throw new CourseImagePrerequisiteError("资源方案存储未配置");
  }
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  if (!plan) {
    throw new CourseImagePrerequisiteError("请先生成资源方案");
  }
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });
  const cover = deriveResourceImageSlots(courseId, draft, plan)[0];
  if (!record || record.slotType !== "visual_cover" || record.status !== "succeeded" || record.sourceHash !== cover.sourceHash) {
    throw new CourseImageInvalidStateError("只能确认已完成且未过期的视觉封面");
  }
  const updatedPlan = { ...plan, confirmedCoverImageId: imageId };
  await db.courseResourcePlan.update({
    where: { courseId },
    data: { plan: updatedPlan, confirmedCoverImageId: imageId },
  });
  return getCourseResources(db, courseId);
}

export async function retryCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(plan ? deriveResourceImageSlots(courseId, draft, plan) : deriveLessonShotImageSlots(courseId, draft), record);

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
      sourceParagraphId: slot.sourceParagraphId,
      sourceSentenceIds: slot.sourceSentenceIds,
      heroMomentSentenceId: slot.heroMomentSentenceId,
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
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(plan ? deriveResourceImageSlots(courseId, draft, plan) : deriveLessonShotImageSlots(courseId, draft), record);
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

export async function advanceCourseImageQueue(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  const { draft, plan } = await getCourseDraftOrThrow(db, courseId);
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const active = records.filter((image) => image.status === "generating");

  for (const image of active) {
    if (!image.providerTaskId) {
      await db.courseImage.update({
        where: { id: image.id },
        data: { status: "failed", failureReason: "图片任务 ID 缺失" },
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
          providerImageUrl: providerImageUrlForStorage(remote.imageUrl),
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
    const claimed = await db.courseImage.updateMany({
      where: { id: pending.id, status: "pending" },
      data: {
        status: "submitting",
        prompt,
        sourceHash,
        providerTaskId: null,
        failureReason: null,
      },
    });

    if (claimed.count === 0) {
      return;
    }

    const submitted = await deps.provider.submit({ prompt, width: 1280, height: 720 });
    if (submitted.imageUrl) {
      const local = await deps.download({ sourceUrl: submitted.imageUrl, courseId, imageId: pending.id });
      await db.courseImage.update({
        where: { id: pending.id },
        data: {
          status: "succeeded",
          prompt,
          sourceHash,
          providerTaskId: null,
          providerImageUrl: providerImageUrlForStorage(submitted.imageUrl),
          storagePath: local.storagePath,
          publicUrl: local.publicUrl,
          failureReason: null,
        },
      });
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
  await advanceCourseImageQueue(db, courseId, deps);
  return getCourseResources(db, courseId);
}
