import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import type {
  CharacterVisualIntent,
  CourseCharacterSourceType,
  CourseImageFailureCode,
  CourseImageStatus,
  CourseImageQuality,
  CourseVisualAsset,
  CourseVisualResourcesState,
} from "@/lib/contracts/api";
import { buildCleanParagraphText } from "@/lib/domain/course-content";
import { defaultCharacterVisualIntent, matchCoursePersonForCharacter } from "@/lib/domain/visual-resources";
import { visualGenerationFingerprint } from "@/lib/domain/visual-resources";
import { compileCourseImagePrompt, CourseVisualPlanResponseError, createCourseVisualPlanDeps, mergeOriginalizedVisualPlan, parseCourseVisualPlan, type CourseImagePromptCharacter, type CourseVisualPlan, type CourseVisualPlanDeps, type CourseVisualPlanDiagnostics, type CourseVisualPlanScene } from "@/lib/server/ai/course-visual-plan-deps";
import { CourseImageSourceError } from "@/lib/server/storage/course-images";

export type VisualResourcesDb = Pick<PrismaClient,
  | "course"
  | "coursePerson"
  | "courseCharacter"
  | "courseCharacterVisual"
  | "courseVisualResourcePlan"
  | "courseVisualImageSlot"
  | "courseImage"
  | "courseLessonContent"
  | "courseStoryOutline"
  | "personVisualAsset"
  | "person"
  | "aiGenerationLog"
>;

export type CourseImageGenerationDeps = {
  provider?: "quickrouter_gpt_image_2" | "crazyrouter_gpt_image_2";
  generate: (input: { prompt: string; quality: CourseImageQuality; portrait?: boolean }) => Promise<{ imageUrl: string; model?: string; quality?: CourseImageQuality }>;
  edit: (input: { prompt: string; quality: CourseImageQuality; imageDataUrl: string; portrait?: boolean }) => Promise<{ imageUrl: string; model?: string; quality?: CourseImageQuality }>;
  persist: (input: { sourceUrl: string; courseId: string; assetId: string; portrait?: boolean }) => Promise<{ storagePath: string; publicUrl: string }>;
  composeReferences: (storagePaths: string[]) => Promise<string>;
  removeTemporarySource: (storagePath: string) => Promise<void>;
  normalizeQuality?: (quality: CourseImageQuality) => CourseImageQuality;
};

export class VisualResourcesNotFoundError extends Error {
  constructor(message = "课程视觉资源不存在") { super(message); this.name = "VisualResourcesNotFoundError"; }
}

export class VisualResourcesInvalidStateError extends Error {
  constructor(message: string) { super(message); this.name = "VisualResourcesInvalidStateError"; }
}

export function hasUnsyncedCharacterAppearance(
  prompt: string,
  characterIds: string[],
  designs: CourseVisualPlan["characterDesigns"],
) {
  const designById = new Map(designs.map((design) => [design.characterId, design]));
  return characterIds.some((characterId) => {
    const design = designById.get(characterId);
    if (!design) return false;
    const currentDescriptions = [design.appearanceDescription, design.courseAppearance]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    return currentDescriptions.some((description) => !prompt.includes(description));
  });
}

export function buildCourseImageEditPrompt(instruction: string) {
  return `请直接编辑所提供的原图。

本次修改要求：
${instruction.trim()}

将修改要求视为最终目标，而不是建议。
除本次要求必然影响的内容外，保持原图中的其他人物、数量、身份、外貌、动作、位置、构图、背景、画风和光线不变。
不要新增、复制、删除或替换未被要求修改的人物或物体。
输出修改后的完整图片，不添加文字、边框、标志或水印。`;
}

export class VisualPlanOperationConflictError extends Error {
  constructor(message = "视觉方案请求正在处理中，请勿重复提交") {
    super(message);
    this.name = "VisualPlanOperationConflictError";
  }
}

export class VisualImageGenerationError extends Error {
  constructor(message: string, readonly failureCode: CourseImageFailureCode) {
    super(message);
    this.name = "VisualImageGenerationError";
  }
}

const COURSE_IMAGE_LEASE_MS = 2 * 60 * 1000;
const COURSE_IMAGE_HEARTBEAT_MS = 30 * 1000;
const COURSE_IMAGE_MAX_RUNTIME_MS = 12 * 60 * 1000;

export async function recoverStaleCourseImages(db: VisualResourcesDb, courseId: string, now = new Date()) {
  return db.courseImage.updateMany({
    where: {
      courseId,
      status: { in: ["pending", "submitting", "generating"] },
      OR: [
        { leaseExpiresAt: { lte: now } },
        { startedAt: { lte: new Date(now.getTime() - COURSE_IMAGE_MAX_RUNTIME_MS) } },
      ],
    },
    data: {
      status: "failed",
      failureCode: "retryable",
      failureReason: "上次图片生成已中断或超时，请重试",
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function invalidateCharacterDependentSlots(db: VisualResourcesDb, courseId: string, characterId: string) {
  const slots = await db.courseVisualImageSlot.findMany({ where: { courseId }, select: { id: true, slotType: true, characterIds: true } });
  const affectedSlots = slots.filter((slot) => asStrings(slot.characterIds).includes(characterId));
  const slotIds = affectedSlots.map((slot) => slot.id);
  const coverAffected = affectedSlots.some((slot) => slot.slotType === "visual_cover");
  await Promise.all([
    slotIds.length ? db.courseVisualImageSlot.updateMany({ where: { id: { in: slotIds } }, data: { activeImageId: null } }) : Promise.resolve(),
    coverAffected ? db.courseVisualResourcePlan.updateMany({ where: { courseId }, data: { confirmedCoverAssetId: null } }) : Promise.resolve(),
  ]);
}

type StoredVisualPlan = CourseVisualPlan & { schemaVersion: 4; mainCharacterIds: string[] };

function storedVisualPlan(value: unknown): StoredVisualPlan | null {
  if (!value || typeof value !== "object" || Reflect.get(value, "schemaVersion") !== 4) return null;
  if (typeof Reflect.get(value, "visualStyle") !== "string" || typeof Reflect.get(value, "storyWorld") !== "string") return null;
  if (!Array.isArray(Reflect.get(value, "characterDesigns")) || !Array.isArray(Reflect.get(value, "mainCharacterIds"))) return null;
  return value as StoredVisualPlan;
}

function mainCharacters(plan: CourseVisualPlan, characters: Array<{ id: string; sourceType: string; roleInStory: string }>) {
  const appearances = new Map<string, number>();
  for (const scene of [plan.cover, ...plan.shots]) {
    for (const id of scene.characterIds) appearances.set(id, (appearances.get(id) ?? 0) + 1);
  }
  const people = characters.filter((character) => character.sourceType === "person").map((character) => character.id);
  const candidates = characters.filter((character) => character.sourceType !== "person" && appearances.has(character.id)).sort((a, b) => {
    const score = (character: typeof a) => (plan.cover.characterIds.includes(character.id) ? 100 : 0)
      + (appearances.get(character.id) ?? 0) * 10
      + (/主角|核心|protagonist|hero|antagonist|对手/i.test(character.roleInStory) ? 30 : 0);
    return score(b) - score(a);
  }).slice(0, 3).map((character) => character.id);
  return [...new Set([...people, ...candidates])];
}

function toAsset(asset: {
  id: string;
  parentAssetId: string | null;
  operation: string;
  userInstruction: string | null;
  quality: string;
  planRevision: number;
  status: string;
  publicUrl: string | null;
  failureCode: string | null;
  failureReason: string | null;
  startedAt: Date | null;
  createdAt: Date;
}): CourseVisualAsset {
  return {
    id: asset.id,
    parentAssetId: asset.parentAssetId,
    operation: asset.operation as CourseVisualAsset["operation"],
    userInstruction: asset.userInstruction,
    quality: asset.quality as CourseImageQuality,
    planRevision: asset.planRevision,
    status: asset.status as CourseVisualAsset["status"],
    publicUrl: asset.publicUrl,
    failureCode: asset.failureCode as CourseImageFailureCode | null,
    failureReason: asset.failureReason,
    startedAt: asset.startedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function getCourseVisualResources(db: VisualResourcesDb, courseId: string): Promise<CourseVisualResourcesState> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, currentStage: true, visualQuality: true, imageGenerationConcurrency: true } });
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  await recoverStaleCourseImages(db, courseId);
  const [characters, visuals, plan, slots, people, content] = await Promise.all([
    db.courseCharacter.findMany({ where: { courseId }, include: { sourceReference: true }, orderBy: { createdAt: "asc" } }),
    db.courseCharacterVisual.findMany({ where: { courseId }, include: { activeImage: true, images: { orderBy: { createdAt: "asc" } } } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
    db.courseVisualImageSlot.findMany({ where: { courseId }, include: { activeImage: true, images: { orderBy: { createdAt: "asc" } } }, orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }] }),
    db.coursePerson.findMany({ where: { courseId }, include: { visualAssetSnapshot: true } }),
    db.courseLessonContent.findUnique({ where: { courseId }, select: { chapters: true } }),
  ]);
  const visualByCharacter = new Map(visuals.map((visual) => [visual.characterId, visual]));
  const visualPlan = storedVisualPlan(plan?.coverBrief);
  const designByCharacter = new Map(visualPlan?.characterDesigns.map((design) => [design.characterId, design]) ?? []);
  const peopleIdentities = people.map((person) => ({ personId: person.personId, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot }));
  const matchedPeople = new Map(characters.filter((character) => character.sourceType === "person" && character.shouldAppearInImages).flatMap((character) => {
    const person = matchCoursePersonForCharacter(character, peopleIdentities);
    return person ? [[character.id, person.personId] as const] : [];
  }));
  const personById = new Map(people.map((person) => [person.personId, person]));
  const contentChapters = (Array.isArray(content?.chapters) ? content.chapters : []) as ContentChapter[];
  const chapterMeta = new Map(contentChapters.map((chapter, index) => [chapter.id, {
    order: chapter.order ?? index + 1,
    title: chapter.title,
  }]));
  const characterStates = characters.filter((character) => character.shouldAppearInImages).map((character) => {
    const visual = visualByCharacter.get(character.id);
    const matchedPersonId = matchedPeople.get(character.id) ?? character.sourcePersonId;
    const personSnapshot = matchedPersonId ? personById.get(matchedPersonId) : null;
    const personVisualUrl = personSnapshot?.visualAssetSnapshot?.publicUrl ?? null;
    const inferredIntent = defaultCharacterVisualIntent(character.sourceType as CourseCharacterSourceType);
    const design = designByCharacter.get(character.id);
    return {
      id: visual?.id ?? character.id,
      characterId: character.id,
      displayName: character.displayName,
      chineseName: personSnapshot?.chineseNameSnapshot ?? character.displayName,
      englishName: personSnapshot?.englishNameSnapshot ?? character.englishName,
      sourceType: character.sourceType,
      sourceReferenceType: character.sourceReference?.type ?? null,
      sourceReferenceName: character.sourceReference?.name ?? null,
      visualAnchorMode: visual?.activeImageId && character.sourceType === "referenced" && design?.visualAnchor.mode !== "description" ? "reference" as const : design?.visualAnchor.mode ?? null,
      visualAnchorLabel: design?.visualAnchor.label ?? null,
      visualAnchorContext: design?.visualAnchor.context ?? null,
      appearanceDescription: design?.appearanceDescription ?? null,
      shouldAppearInImages: character.shouldAppearInImages,
      isMain: Boolean(visualPlan?.mainCharacterIds.includes(character.id)),
      intent: visual?.intent ?? inferredIntent,
      source: visual?.source ?? (personVisualUrl ? "person_asset" : null),
      status: visual?.status ?? (personVisualUrl || character.sourceType !== "person" ? "ready" : "missing"),
      personVisualUrl,
      storyVisualDesign: design?.courseAppearance ?? null,
      activeAssetId: visual?.activeImageId ?? null,
      activeAsset: visual?.activeImage ? toAsset(visual.activeImage) : null,
      versions: (visual?.images ?? []).map(toAsset),
    };
  });
  const characterById = new Map(characterStates.map((character) => [character.characterId, character]));
  const characterKeyById = new Map((visualPlan?.characterDesigns ?? []).map((design, index) => [design.characterId, `C${String(index + 1).padStart(2, "0")}`]));
  const promptForSlot = (slot: typeof slots[number]) => {
    if (!visualPlan) return slot.prompt;
    const scene: CourseVisualPlanScene | undefined = slot.slotType === "visual_cover"
      ? visualPlan.cover
      : visualPlan.shots.find((shot) => shot.paragraphId === slot.paragraphId);
    if (!scene) return slot.prompt;
    let referenceIndex = 0;
    return compileCourseImagePrompt(visualPlan, scene, slot.slotType === "visual_cover" ? "cover" : "illustration", asStrings(slot.characterIds).map((characterId) => {
      const character = characterById.get(characterId);
      const hasReference = Boolean(character?.personVisualUrl || character?.activeAssetId);
      if (hasReference) referenceIndex += 1;
      return {
        characterId,
        characterKey: characterKeyById.get(characterId) ?? "C00",
        chineseName: character?.chineseName ?? characterId,
        englishName: character?.englishName ?? characterId,
        referenceIndex: hasReference ? referenceIndex : undefined,
        useVisualLabel: character?.sourceType === "referenced" && designByCharacter.get(characterId)?.visualAnchor.mode === "description",
      };
    }));
  };
  const unsyncedSlotIds = new Set(slots
    .filter((slot) => Boolean(visualPlan && slot.activeImage && hasUnsyncedCharacterAppearance(slot.activeImage.prompt, asStrings(slot.characterIds), visualPlan.characterDesigns)))
    .map((slot) => slot.id));
  return {
    course: { id: course.id, title: course.title, currentStage: course.currentStage },
    quality: course.visualQuality,
    imageGenerationConcurrency: course.imageGenerationConcurrency,
    planReady: Boolean(visualPlan),
    planRevision: visualPlan ? plan?.revision ?? null : null,
    planMode: visualPlan ? plan?.mode ?? null : null,
    confirmedCoverAssetId: visualPlan ? plan?.confirmedCoverAssetId ?? null : null,
    policyBlocked: Boolean(visualPlan && plan && slots.some((slot) => {
      const latestAttempt = slot.images.findLast((asset) => asset.planRevision === plan.revision);
      return latestAttempt?.status === "failed" && latestAttempt.failureCode === "policy_blocked";
    })),
    characters: characterStates,
    slots: slots.map((slot) => {
      const chapter = slot.chapterId ? chapterMeta.get(slot.chapterId) : null;
      return {
      id: slot.id,
      stableKey: slot.stableKey,
      slotType: slot.slotType,
      chapterId: slot.chapterId,
      chapterOrder: chapter?.order ?? null,
      chapterTitle: chapter?.title ?? null,
      paragraphId: slot.paragraphId,
      sourceText: slot.sourceText,
      characterIds: asStrings(slot.characterIds),
      focus: slot.focus,
      sceneDescription: slot.sceneDescription,
      prompt: promptForSlot(slot),
      hasUnsyncedChanges: unsyncedSlotIds.has(slot.id),
      activeAssetId: slot.activeImageId,
      activeAsset: slot.activeImage ? toAsset(slot.activeImage) : null,
      versions: slot.images.map(toAsset),
      };
    }),
  };
}

export async function updateCourseVisualSettings(
  db: VisualResourcesDb,
  courseId: string,
  input: { quality?: CourseImageQuality; imageGenerationConcurrency?: number },
) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  const data = {
    ...(input.quality === undefined ? {} : { visualQuality: input.quality }),
    ...(input.imageGenerationConcurrency === undefined ? {} : { imageGenerationConcurrency: input.imageGenerationConcurrency }),
  };
  const updated = await db.course.update({
    where: { id: courseId },
    data,
    select: { visualQuality: true, imageGenerationConcurrency: true },
  });
  return { quality: updated.visualQuality, imageGenerationConcurrency: updated.imageGenerationConcurrency };
}

export async function updateVisualCharacterAppearance(
  db: VisualResourcesDb,
  courseId: string,
  characterId: string,
  input: { courseAppearance: string; appearanceDescription?: string },
) {
  const [character, record] = await Promise.all([
    db.courseCharacter.findFirst({ where: { id: characterId, courseId } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
  ]);
  if (!character) throw new VisualResourcesNotFoundError("角色不存在");
  const plan = storedVisualPlan(record?.coverBrief);
  if (!record || !plan) throw new VisualResourcesInvalidStateError("请先生成视觉方案");
  const designIndex = plan.characterDesigns.findIndex((design) => design.characterId === characterId);
  if (designIndex < 0) throw new VisualResourcesNotFoundError("视觉方案中缺少该角色");
  if (character.sourceType === "person" && input.appearanceDescription !== undefined) {
    throw new VisualResourcesInvalidStateError("老师和学生只能修改本课造型");
  }
  if (character.sourceType !== "person" && !input.appearanceDescription?.trim()) {
    throw new VisualResourcesInvalidStateError("课程角色必须保留角色形象");
  }
  if (!input.courseAppearance.trim()) throw new VisualResourcesInvalidStateError("本课造型不能为空");
  const designs = plan.characterDesigns.map((design, index) => index !== designIndex ? design : {
    ...design,
    ...(character.sourceType === "person" ? {} : { appearanceDescription: input.appearanceDescription!.trim() }),
    courseAppearance: input.courseAppearance.trim(),
  });
  const nextPlan: StoredVisualPlan = { ...plan, characterDesigns: designs };
  await db.courseVisualResourcePlan.update({ where: { courseId }, data: { coverBrief: nextPlan as Prisma.InputJsonValue } });
  return { characterId };
}

export async function updateCharacterVisualIntent(db: VisualResourcesDb, courseId: string, characterId: string, intent: CharacterVisualIntent) {
  const character = await db.courseCharacter.findFirst({ where: { id: characterId, courseId }, select: { id: true, sourceType: true } });
  if (!character) throw new VisualResourcesNotFoundError("角色不存在");
  if (character.sourceType !== "referenced") throw new VisualResourcesInvalidStateError("只有外部引用角色需要选择视觉意图");
  return db.courseCharacterVisual.upsert({
    where: { characterId },
    create: { courseId, characterId, intent, status: "missing" },
    update: { intent, status: "missing", source: null, activeImageId: null },
  });
}

export async function adoptLatestPersonVisual(db: VisualResourcesDb, courseId: string, characterId: string) {
  const character = await db.courseCharacter.findFirst({ where: { id: characterId, courseId }, select: { id: true, displayName: true, sourceType: true, sourcePersonId: true } });
  if (!character || character.sourceType !== "person") throw new VisualResourcesInvalidStateError("该角色不是人物档案角色");
  const coursePeople = await db.coursePerson.findMany({ where: { courseId } });
  const matched = matchCoursePersonForCharacter(character, coursePeople.map((person) => ({ personId: person.personId, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot })));
  if (!matched) throw new VisualResourcesInvalidStateError("找不到该角色对应的人物档案，请返回故事大纲重新选择人物");
  const person = await db.person.findUnique({ where: { id: matched.personId }, select: { activeVisualAssetId: true, activeVisualAsset: { select: { id: true, status: true } } } });
  if (!person?.activeVisualAssetId || person.activeVisualAsset?.status !== "succeeded") throw new VisualResourcesInvalidStateError("人物档案还没有可用的当前形象");
  await db.coursePerson.update({ where: { courseId_personId: { courseId, personId: matched.personId } }, data: { visualAssetIdSnapshot: person.activeVisualAssetId } });
  if (character.sourcePersonId !== matched.personId) await db.courseCharacter.update({ where: { id: character.id }, data: { sourcePersonId: matched.personId } });
  const result = await db.courseCharacterVisual.upsert({
    where: { characterId },
    create: { courseId, characterId, source: "person_asset", personVisualAssetId: person.activeVisualAssetId, status: "ready" },
    update: { source: "person_asset", personVisualAssetId: person.activeVisualAssetId, activeImageId: null, status: "ready" },
  });
  await invalidateCharacterDependentSlots(db, courseId, characterId);
  return result;
}

export async function selectCourseVisualAsset(db: VisualResourcesDb, courseId: string, assetId: string) {
  const asset = await db.courseImage.findFirst({ where: { id: assetId, courseId }, select: { id: true, courseId: true, slotId: true, characterVisualId: true, status: true } });
  if (!asset) throw new VisualResourcesNotFoundError("图片版本不存在");
  if (asset.status !== "succeeded") throw new VisualResourcesInvalidStateError("只能采用生成成功的图片版本");
  if (asset.slotId) {
    const slot = await db.courseVisualImageSlot.update({ where: { id: asset.slotId }, data: { activeImageId: asset.id } });
    if (slot.slotType === "visual_cover") await db.courseVisualResourcePlan.update({ where: { courseId }, data: { confirmedCoverAssetId: null } });
  }
  else if (asset.characterVisualId) await db.courseCharacterVisual.update({ where: { id: asset.characterVisualId }, data: { activeImageId: asset.id, status: "ready" } });
  else throw new VisualResourcesInvalidStateError("图片版本没有可采用的目标");
  return { assetId: asset.id };
}

export async function confirmVisualCover(db: VisualResourcesDb, courseId: string, assetId: string) {
  const [plan, asset] = await Promise.all([
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
    db.courseImage.findFirst({ where: { id: assetId, courseId }, include: { slot: true } }),
  ]);
  if (!plan) throw new VisualResourcesInvalidStateError("请先生成视觉方案");
  if (!asset || asset.status !== "succeeded" || asset.slot?.slotType !== "visual_cover" || asset.slot.activeImageId !== asset.id) throw new VisualResourcesInvalidStateError("只能确认当前采用的成功视觉封面");
  if (asset.planRevision !== plan.revision) throw new VisualResourcesInvalidStateError("封面来自旧视觉方案，请重新生成");
  await db.courseVisualResourcePlan.update({ where: { courseId }, data: { confirmedCoverAssetId: asset.id } });
  return getCourseVisualResources(db, courseId);
}

type ContentChapter = {
  id: string;
  order?: number;
  outlineChapterId: string;
  title: string;
  paragraphs: Array<{ id: string; parts: Parameters<typeof buildCleanParagraphText>[0]["parts"] }>;
};

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function operationPlan(value: unknown) {
  return recordObject(recordObject(value)?.plan) as CourseVisualPlan | null;
}

function operationDiagnostics(value: unknown) {
  return recordObject(recordObject(value)?.diagnostics) as CourseVisualPlanDiagnostics | null;
}

function persistedFailure(error: unknown) {
  if (error instanceof CourseVisualPlanResponseError) {
    return { message: error.message, outputSnapshot: { diagnostics: error.diagnostics } };
  }
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
  return {
    message: error instanceof Error ? error.message : "视觉资源方案生成失败",
    outputSnapshot: {
      diagnostics: {
        kind: "service_error",
        errorName: error instanceof Error ? error.name : typeof error,
        causeName: cause?.name,
        causeMessage: cause?.message,
      },
    },
  };
}

export async function generateCourseVisualPlan(
  db: VisualResourcesDb,
  courseId: string,
  requestId: string,
  deps: CourseVisualPlanDeps = createCourseVisualPlanDeps(),
  mode: "faithful" | "originalized" = "faithful",
) {
  let operation = await db.aiGenerationLog.findUnique({ where: { requestId } });
  const existingInput = recordObject(operation?.inputSnapshot);
  if (operation && existingInput?.mode !== mode) throw new VisualResourcesInvalidStateError("重复提交标识已用于其他视觉方案操作");
  if (operation?.status === "succeeded") return getCourseVisualResources(db, courseId);
  let replayPlan = operationPlan(operation?.outputSnapshot);
  if (operation?.status === "running" && !replayPlan) throw new VisualPlanOperationConflictError();
  if (operation?.status === "failed" && !replayPlan) {
    const diagnostics = operationDiagnostics(operation.outputSnapshot);
    throw new CourseVisualPlanResponseError(operation.errorMessage ?? undefined, diagnostics ?? undefined);
  }
  const [course, content, outline, characters, existingPlan] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { id: true } }),
    db.courseLessonContent.findUnique({ where: { courseId } }),
    db.courseStoryOutline.findUnique({ where: { courseId } }),
    db.courseCharacter.findMany({ where: { courseId, shouldAppearInImages: true }, include: { sourceReference: true } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId }, select: { revision: true, mode: true, coverBrief: true } }),
  ]);
  if (!course || !content || !outline) throw new VisualResourcesInvalidStateError("请先确认文案与练习");
  if (content.status !== "confirmed") throw new VisualResourcesInvalidStateError("请先确认文案与练习");
  const baselinePlan = storedVisualPlan(existingPlan?.coverBrief);
  if (mode === "originalized" && (!existingPlan || !baselinePlan)) {
    throw new VisualResourcesInvalidStateError("请先生成视觉方案，再调整为原创视觉设定");
  }
  const unlinkedReferencedCharacters = characters.filter((character) => character.sourceType === "referenced" && !character.sourceReference);
  if (unlinkedReferencedCharacters.length) {
    throw new VisualResourcesInvalidStateError(`故事大纲中的引用角色缺少参考资料关联：${unlinkedReferencedCharacters.map((character) => character.displayName).join("、")}。请返回故事大纲重新生成`);
  }
  const chapters = (Array.isArray(content.chapters) ? content.chapters : []) as ContentChapter[];
  const promptInput = {
    mode,
    baselinePlan: mode === "originalized" ? baselinePlan : null,
    storyTitle: outline.title,
    characters: characters.map((character) => ({
      id: character.id,
      displayName: character.displayName,
      englishName: character.englishName,
      sourceType: character.sourceType,
      reference: character.sourceReference ? {
        name: character.sourceReference.name,
        type: character.sourceReference.type,
        summary: character.sourceReference.summary,
      } : null,
      roleInStory: character.roleInStory,
    })),
    chapters: chapters.map((chapter, index) => ({
      id: chapter.id,
      order: chapter.order ?? index + 1,
      title: chapter.title,
      paragraphs: chapter.paragraphs.map((paragraph) => ({ id: paragraph.id, cleanReading: buildCleanParagraphText(paragraph) })),
    })),
  };
  if (!operation) {
    try {
      operation = await db.aiGenerationLog.create({
        data: {
          requestId,
          courseId,
          stage: "visual_resources",
          operation: mode === "originalized" ? "visual_originalize_resource_plan" : "visual_generate_resource_plan",
          status: "running",
          writingProvider: content.writingProvider,
          inputSnapshot: {
            mode,
            sourceRevision: `${content.sourceRevision}:${content.contentVersion}`,
            characterCount: characters.length,
            paragraphCount: promptInput.chapters.reduce((count, chapter) => count + chapter.paragraphs.length, 0),
          },
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      operation = await db.aiGenerationLog.findUnique({ where: { requestId } });
      if (!operation) throw new VisualPlanOperationConflictError();
      replayPlan = operationPlan(operation.outputSnapshot);
      if (operation.status === "succeeded") return getCourseVisualResources(db, courseId);
      if (!replayPlan && operation.status === "failed") {
        throw new CourseVisualPlanResponseError(operation.errorMessage ?? undefined, operationDiagnostics(operation.outputSnapshot) ?? undefined);
      }
      if (!replayPlan) throw new VisualPlanOperationConflictError();
    }
  }
  let generatedPlanSaved = Boolean(replayPlan);
  let capturedOutput = recordObject(operation.outputSnapshot) as Prisma.InputJsonObject | null;
  try {
    let generatedPlan = replayPlan;
    let tokenUsage: Awaited<ReturnType<CourseVisualPlanDeps["generate"]>>["usage"];
    if (!generatedPlan) {
      const generated = await deps.generate(promptInput, content.writingProvider, async (response) => {
        capturedOutput = { rawResponse: response.text, ...(response.usage ? { tokenUsage: response.usage } : {}) } as Prisma.InputJsonObject;
        await db.aiGenerationLog.update({ where: { id: operation.id }, data: { outputSnapshot: capturedOutput } });
      });
      generatedPlan = mode === "originalized" && baselinePlan
        ? mergeOriginalizedVisualPlan(baselinePlan, generated.plan, promptInput.characters)
        : generated.plan;
      tokenUsage = generated.usage;
      capturedOutput = { ...(capturedOutput ?? {}), plan: generatedPlan, ...(tokenUsage ? { tokenUsage } : {}) } as Prisma.InputJsonObject;
      await db.aiGenerationLog.update({
        where: { id: operation.id },
        data: { outputSnapshot: capturedOutput, errorMessage: null },
      });
      generatedPlanSaved = true;
    } else {
      generatedPlan = parseCourseVisualPlan(generatedPlan, promptInput);
      if (mode === "originalized" && baselinePlan) generatedPlan = mergeOriginalizedVisualPlan(baselinePlan, generatedPlan, promptInput.characters);
    }
  const revision = (existingPlan?.revision ?? 0) + 1;
  const plan: StoredVisualPlan = { ...generatedPlan, schemaVersion: 4, mainCharacterIds: mainCharacters(generatedPlan, characters) };
  const coverCharacterIds = generatedPlan.cover.characterIds;
  const characterNames = new Map(characters.map((character, index) => [character.id, {
    characterKey: `C${String(index + 1).padStart(2, "0")}`,
    chineseName: character.displayName,
    englishName: character.englishName,
    useVisualLabel: mode === "originalized" && character.sourceType === "referenced",
  }]));
  const basePrompt = (scene: CourseVisualPlanScene, kind: "cover" | "illustration") => compileCourseImagePrompt(plan, scene, kind, scene.characterIds.map((characterId) => ({
    characterId,
    characterKey: characterNames.get(characterId)?.characterKey ?? "C00",
    chineseName: characterNames.get(characterId)?.chineseName ?? characterId,
    englishName: characterNames.get(characterId)?.englishName ?? characterId,
    useVisualLabel: characterNames.get(characterId)?.useVisualLabel ?? false,
  })));
  const coverPrompt = basePrompt(generatedPlan.cover, "cover");
  await db.courseVisualResourcePlan.upsert({
    where: { courseId },
    create: { courseId, sourceRevision: `${content.sourceRevision}:${content.contentVersion}`, revision, mode, coverBrief: plan, confirmedCoverAssetId: null },
    update: { sourceRevision: `${content.sourceRevision}:${content.contentVersion}`, revision, mode, coverBrief: plan, confirmedCoverAssetId: null },
  });
  if (mode === "originalized") {
    await Promise.all(characters.filter((character) => character.sourceType === "referenced").map((character) => db.courseCharacterVisual.upsert({
      where: { characterId: character.id },
      create: { courseId, characterId: character.id, intent: "originalize", status: "ready" },
      update: { intent: "originalize", source: null, activeImageId: null, status: "ready" },
    })));
  }
  await db.courseVisualImageSlot.upsert({
    where: { courseId_stableKey: { courseId, stableKey: "visual-cover" } },
    create: { courseId, stableKey: "visual-cover", slotType: "visual_cover", sourceText: outline.summary, characterIds: coverCharacterIds, focus: generatedPlan.cover.focus, sceneDescription: generatedPlan.cover.sceneDescription, prompt: coverPrompt, activeImageId: null },
    update: { sourceText: outline.summary, characterIds: coverCharacterIds, focus: generatedPlan.cover.focus, sceneDescription: generatedPlan.cover.sceneDescription, prompt: coverPrompt, activeImageId: null },
  });
  const shotByParagraph = new Map(generatedPlan.shots.map((shot) => [shot.paragraphId, shot]));
  for (const chapter of chapters) {
    for (const paragraph of chapter.paragraphs) {
      const sourceText = buildCleanParagraphText(paragraph);
      const shot = shotByParagraph.get(paragraph.id);
      if (!shot) throw new Error(`视觉资源方案缺少段落 ${paragraph.id}`);
      const prompt = basePrompt(shot, "illustration");
      await db.courseVisualImageSlot.upsert({
        where: { courseId_stableKey: { courseId, stableKey: `paragraph-${paragraph.id}` } },
        create: { courseId, stableKey: `paragraph-${paragraph.id}`, slotType: "lesson_shot", chapterId: chapter.id, paragraphId: paragraph.id, sourceText, characterIds: shot.characterIds, focus: shot.focus, sceneDescription: shot.sceneDescription, prompt, activeImageId: null },
        update: { chapterId: chapter.id, paragraphId: paragraph.id, sourceText, characterIds: shot.characterIds, focus: shot.focus, sceneDescription: shot.sceneDescription, prompt, activeImageId: null },
      });
    }
  }
  await db.course.update({ where: { id: courseId }, data: { currentStage: "visual_resources" } });
  await db.aiGenerationLog.update({ where: { id: operation.id }, data: { status: "succeeded", errorMessage: null } });
  return getCourseVisualResources(db, courseId);
  } catch (error) {
    const failure = persistedFailure(error);
    const failedOutput = { ...(capturedOutput ?? {}), ...failure.outputSnapshot } as Prisma.InputJsonObject;
    await db.aiGenerationLog.update({
      where: { id: operation.id },
      data: { status: "failed", errorMessage: failure.message, ...(generatedPlanSaved ? {} : { outputSnapshot: failedOutput }) },
    }).catch(() => undefined);
    throw error;
  }
}

function recoverableUrl(url: string | null) {
  if (!url || url.startsWith("data:")) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function imageFailureCode(error: unknown, hasRemoteResult: boolean): CourseImageFailureCode {
  if (error instanceof VisualImageGenerationError) return error.failureCode;
  if (error instanceof CourseImageSourceError && !error.retryable) return "provider_result_invalid";
  if (hasRemoteResult) return "storage_recoverable";
  const message = error instanceof Error ? error.message : String(error);
  if (/safety|policy|copyright|content moderation|content policy|blocked by|违规|安全策略|版权/i.test(message)) return "policy_blocked";
  if (/invalid|unsupported|parameter|尺寸|格式|参数/i.test(message)) return "invalid_request";
  if (/timeout|network|fetch|saturated|busy|429|繁忙|超时|连接/i.test(message)) return "retryable";
  return "unknown";
}

function storageFailureMessage(error: unknown) {
  const raw = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : error instanceof Error ? error.message : "未知保存错误";
  const detail = /timeout|timed out|aborted|超时/i.test(raw) ? "下载远端图片超时" : raw;
  return `图片已生成，但下载或保存失败：${detail}`;
}

async function adoptSucceededCourseImage(
  db: VisualResourcesDb,
  asset: { id: string; courseId: string; slotId?: string | null; characterVisualId?: string | null; status: CourseImageStatus },
) {
  if (asset.status !== "succeeded") return;
  if (asset.slotId) {
    const slot = await db.courseVisualImageSlot.update({ where: { id: asset.slotId }, data: { activeImageId: asset.id } });
    if (slot.slotType === "visual_cover") {
      await db.courseVisualResourcePlan.update({ where: { courseId: asset.courseId }, data: { confirmedCoverAssetId: null } });
    }
  }
  if (asset.characterVisualId) {
    await db.courseCharacterVisual.update({ where: { id: asset.characterVisualId }, data: { activeImageId: asset.id, status: "ready" } });
  }
}

async function finishCourseImage(
  db: VisualResourcesDb,
  asset: { id: string; courseId: string; slotId?: string | null; characterVisualId?: string | null; prompt: string; quality: CourseImageQuality; referenceAssetIds?: unknown; status: CourseImageStatus; failureCode?: CourseImageFailureCode | null; providerImageUrl: string | null; temporarySourcePath: string | null },
  deps: CourseImageGenerationDeps,
  input: { storagePaths?: string[]; portrait?: boolean; sourceDataUrl?: string; allowTextGeneration?: boolean },
) {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + COURSE_IMAGE_LEASE_MS);
  const claimed = await db.courseImage.updateMany({
    where: {
      id: asset.id,
      OR: [
        { status: "pending" },
        { status: "failed", failureCode: { in: ["retryable", "storage_recoverable", "unknown"] } },
        { status: { in: ["submitting", "generating"] }, leaseExpiresAt: { lte: new Date() } },
      ],
    },
    data: {
      status: "generating",
      attempt: { increment: 1 },
      startedAt: new Date(),
      leaseToken,
      leaseExpiresAt,
      failureCode: null,
      failureReason: null,
    },
  });
  if (claimed.count === 0) return db.courseImage.findUnique({ where: { id: asset.id } });
  const heartbeat = setInterval(() => {
    void db.courseImage.updateMany({
      where: { id: asset.id, leaseToken, status: "generating" },
      data: { leaseExpiresAt: new Date(Date.now() + COURSE_IMAGE_LEASE_MS) },
    }).catch(() => undefined);
  }, COURSE_IMAGE_HEARTBEAT_MS);
  heartbeat.unref?.();
  let remoteUrl = recoverableUrl(asset.providerImageUrl);
  let actualQuality = asset.quality;
  try {
    let sourceUrl = remoteUrl;
    if (!sourceUrl) {
      if (input.allowTextGeneration) {
        const generated = await deps.generate({ prompt: asset.prompt, quality: asset.quality, portrait: input.portrait });
        sourceUrl = generated.imageUrl;
        actualQuality = generated.quality ?? asset.quality;
      }
      else {
        const imageDataUrl = input.sourceDataUrl ?? await deps.composeReferences(input.storagePaths ?? []);
        const edited = await deps.edit({ prompt: asset.prompt, quality: asset.quality, imageDataUrl, portrait: input.portrait });
        sourceUrl = edited.imageUrl;
        actualQuality = edited.quality ?? asset.quality;
      }
      remoteUrl = recoverableUrl(sourceUrl);
      if (remoteUrl) {
        const recorded = await db.courseImage.updateMany({
          where: { id: asset.id, leaseToken, status: "generating" },
          data: {
            providerImageUrl: remoteUrl,
            quality: actualQuality,
            sourceHash: visualGenerationFingerprint({ prompt: asset.prompt, quality: actualQuality, referenceAssetIds: asStrings(asset.referenceAssetIds) }),
          },
        });
        if (recorded.count === 0) throw new VisualImageGenerationError("图片任务已被新的重试接管，请刷新查看", "retryable");
      }
    }
    if (!sourceUrl) throw new Error("图片生成服务未返回图片");
    const stored = await deps.persist({ sourceUrl, courseId: asset.courseId, assetId: asset.id, portrait: input.portrait });
    const stillOwned = await db.courseImage.updateMany({
      where: { id: asset.id, leaseToken, status: "generating" },
      data: { leaseExpiresAt: new Date(Date.now() + COURSE_IMAGE_LEASE_MS) },
    });
    if (stillOwned.count === 0) throw new VisualImageGenerationError("图片任务已被新的重试接管，请刷新查看", "retryable");
    const completed = await db.courseImage.updateMany({
      where: { id: asset.id, leaseToken, status: "generating" },
      data: {
        status: "succeeded",
        providerImageUrl: remoteUrl,
        storagePath: stored.storagePath,
        publicUrl: stored.publicUrl,
        quality: actualQuality,
        sourceHash: visualGenerationFingerprint({ prompt: asset.prompt, quality: actualQuality, referenceAssetIds: asStrings(asset.referenceAssetIds) }),
        temporarySourcePath: null,
        failureCode: null,
        failureReason: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (completed.count === 0) throw new VisualImageGenerationError("图片任务已被新的重试接管，请刷新查看", "retryable");
    const succeeded = await db.courseImage.findUnique({ where: { id: asset.id } });
    if (succeeded) await adoptSucceededCourseImage(db, succeeded);
    return succeeded;
  } catch (error) {
    const failureCode = imageFailureCode(error, Boolean(remoteUrl));
    const message = failureCode === "storage_recoverable"
      ? storageFailureMessage(error)
      : failureCode === "provider_result_invalid"
        ? "图片生成服务返回的地址或图片内容无效，请重新生成图片"
      : error instanceof Error ? error.message : "图片生成失败";
    await db.courseImage.updateMany({
      where: { id: asset.id, leaseToken, status: "generating" },
      data: {
        status: "failed",
        providerImageUrl: remoteUrl,
        quality: actualQuality,
        sourceHash: visualGenerationFingerprint({ prompt: asset.prompt, quality: actualQuality, referenceAssetIds: asStrings(asset.referenceAssetIds) }),
        failureCode,
        failureReason: message,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    throw new VisualImageGenerationError(message, failureCode);
  } finally {
    clearInterval(heartbeat);
    if (asset.temporarySourcePath) await deps.removeTemporarySource(asset.temporarySourcePath).catch(() => undefined);
  }
}

async function getOrCreateCharacterVisual(db: VisualResourcesDb, courseId: string, characterId: string) {
  const character = await db.courseCharacter.findFirst({ where: { id: characterId, courseId } });
  if (!character) throw new VisualResourcesNotFoundError("角色不存在");
  const intent = defaultCharacterVisualIntent(character.sourceType as CourseCharacterSourceType);
  const visual = await db.courseCharacterVisual.upsert({
    where: { characterId },
    create: { courseId, characterId, intent, status: "missing" },
    update: {},
  });
  return { character, visual };
}

export async function saveUploadedCharacterReference(
  db: VisualResourcesDb,
  courseId: string,
  characterId: string,
  idempotencyKey: string,
  prepared: { temporarySourcePath: string; sourceDataUrl: string },
  deps: { persist: CourseImageGenerationDeps["persist"] },
) {
  const characterQuality: CourseImageQuality = "low";
  const [{ visual, character }, course] = await Promise.all([
    getOrCreateCharacterVisual(db, courseId, characterId),
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
  ]);
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  if (character.sourceType === "person") throw new VisualResourcesInvalidStateError("老师和学生使用人物档案形象，不能在此上传参考图");
  const prompt = `Identity reference for ${character.displayName}: preserve body build, face shape, facial features, hairstyle, hair color, glasses, distinctive traits, and age impression. Ignore clothing, pose, background, and framing.`;
  const sourceHash = visualGenerationFingerprint({ prompt, quality: characterQuality, referenceAssetIds: [`upload:${idempotencyKey}`] });
  const now = new Date();
  const asset = await db.courseImage.upsert({
    where: { courseId_idempotencyKey: { courseId, idempotencyKey } },
    create: { courseId, characterVisualId: visual.id, operation: "initial", prompt, quality: characterQuality, sourceHash, idempotencyKey, referenceAssetIds: [], status: "submitting", temporarySourcePath: prepared.temporarySourcePath, startedAt: now, leaseExpiresAt: new Date(now.getTime() + COURSE_IMAGE_LEASE_MS) },
    update: {},
  });
  if (asset.status === "succeeded") {
    await db.courseCharacterVisual.update({ where: { id: visual.id }, data: { activeImageId: asset.id, source: "uploaded_reference", status: "ready" } });
    await invalidateCharacterDependentSlots(db, courseId, characterId);
    return asset;
  }
  try {
    const stored = await deps.persist({ sourceUrl: prepared.sourceDataUrl, courseId, assetId: asset.id, portrait: true });
    const succeeded = await db.courseImage.update({ where: { id: asset.id }, data: { status: "succeeded", storagePath: stored.storagePath, publicUrl: stored.publicUrl, temporarySourcePath: null, failureReason: null, leaseExpiresAt: null } });
    await db.courseCharacterVisual.update({ where: { id: visual.id }, data: { activeImageId: asset.id, source: "uploaded_reference", status: "ready" } });
    await invalidateCharacterDependentSlots(db, courseId, characterId);
    return succeeded;
  } catch (error) {
    await db.courseImage.update({ where: { id: asset.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "外形参考保存失败", leaseExpiresAt: null } });
    throw error;
  }
}

async function slotReferenceAssets(db: VisualResourcesDb, courseId: string, characterIds: string[], plan: CourseVisualPlan) {
  const paths: string[] = [];
  const ids: string[] = [];
  const characters: CourseImagePromptCharacter[] = [];
  const characterKeys = new Map(plan.characterDesigns.map((design, index) => [design.characterId, `C${String(index + 1).padStart(2, "0")}`]));
  const designByCharacterId = new Map(plan.characterDesigns.map((design) => [design.characterId, design]));
  for (const characterId of characterIds) {
    const character = await db.courseCharacter.findFirst({ where: { id: characterId, courseId } });
    if (!character) continue;
    let referenceIndex: number | undefined;
    if (character.sourceType === "person") {
      const coursePeople = await db.coursePerson.findMany({ where: { courseId }, include: { visualAssetSnapshot: true } });
      const matched = matchCoursePersonForCharacter(character, coursePeople.map((person) => ({ personId: person.personId, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot })));
      const snapshot = matched ? coursePeople.find((person) => person.personId === matched.personId) : null;
      if (snapshot?.visualAssetSnapshot?.storagePath) {
        paths.push(snapshot.visualAssetSnapshot.storagePath);
        ids.push(snapshot.visualAssetSnapshot.id);
        referenceIndex = paths.length;
      } else {
        throw new VisualResourcesInvalidStateError(`人物“${character.displayName}”还没有可用的外形参考`);
      }
    }
    if (character.sourceType !== "person") {
      const visual = await db.courseCharacterVisual.findUnique({ where: { characterId }, include: { activeImage: true } });
      const isOriginalizedReference = character.sourceType === "referenced" && designByCharacterId.get(characterId)?.visualAnchor.mode === "description";
      const canUseReference = !isOriginalizedReference || visual?.intent === "originalize";
      if (canUseReference && visual?.activeImage?.storagePath) {
        paths.push(visual.activeImage.storagePath);
        ids.push(visual.activeImage.id);
        referenceIndex = paths.length;
      }
    }
    characters.push({
      characterId,
      characterKey: characterKeys.get(characterId) ?? "C00",
      chineseName: character.displayName,
      englishName: character.englishName,
      referenceIndex,
      useVisualLabel: character.sourceType === "referenced" && designByCharacterId.get(characterId)?.visualAnchor.mode === "description",
    });
  }
  return { paths, ids, characters };
}

export async function generateVisualSlot(db: VisualResourcesDb, courseId: string, slotId: string, idempotencyKey: string, deps: CourseImageGenerationDeps, options: { forceRegenerate?: boolean } = {}) {
  const [course, slot, planRecord] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
    db.courseVisualImageSlot.findFirst({ where: { id: slotId, courseId } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
  ]);
  const plan = storedVisualPlan(planRecord?.coverBrief);
  if (!course || !slot || !plan || !planRecord) throw new VisualResourcesNotFoundError("图片槽或视觉方案不存在");
  if (slot.slotType === "lesson_shot" && !planRecord.confirmedCoverAssetId) throw new VisualResourcesInvalidStateError("请先确认视觉封面");
  await recoverStaleCourseImages(db, courseId);
  const runningAsset = await db.courseImage.findFirst({
    where: { courseId, slotId, planRevision: planRecord.revision, status: { in: ["pending", "submitting", "generating"] } },
    orderBy: { createdAt: "desc" },
  });
  if (runningAsset) return runningAsset;
  const latestAsset = await db.courseImage.findFirst({
    where: {
      courseId,
      slotId,
      planRevision: planRecord.revision,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!options.forceRegenerate && latestAsset?.status === "failed" && latestAsset.failureCode === "storage_recoverable" && recoverableUrl(latestAsset.providerImageUrl)) {
    return finishCourseImage(db, latestAsset, deps, { portrait: Boolean(latestAsset.characterVisualId) });
  }
  const references = await slotReferenceAssets(db, courseId, asStrings(slot.characterIds), plan);
  const scene = slot.slotType === "visual_cover" ? plan.cover : plan.shots.find((shot) => shot.paragraphId === slot.paragraphId);
  if (!scene) throw new VisualResourcesInvalidStateError("图片槽缺少当前视觉场景");
  const prompt = compileCourseImagePrompt(plan, scene, slot.slotType === "visual_cover" ? "cover" : "illustration", references.characters);
  const quality = deps.normalizeQuality?.(course.visualQuality) ?? course.visualQuality;
  const sourceHash = visualGenerationFingerprint({ prompt, quality, referenceAssetIds: references.ids });
  const now = new Date();
  const asset = await db.courseImage.upsert({ where: { courseId_idempotencyKey: { courseId, idempotencyKey } }, create: { courseId, slotId, operation: "initial", prompt, quality, provider: deps.provider ?? "quickrouter_gpt_image_2", referenceAssetIds: references.ids, sourceHash, planRevision: planRecord.revision, idempotencyKey, startedAt: now, leaseExpiresAt: new Date(now.getTime() + COURSE_IMAGE_LEASE_MS) }, update: {} }).catch(async (error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const concurrent = await db.courseImage.findFirst({
      where: { courseId, slotId, planRevision: planRecord.revision, status: { in: ["pending", "submitting", "generating"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!concurrent) throw error;
    return concurrent;
  });
  if (asset.status === "succeeded") {
    await adoptSucceededCourseImage(db, asset);
    return asset;
  }
  return finishCourseImage(db, asset, deps, { storagePaths: references.paths, allowTextGeneration: references.paths.length === 0 });
}

export async function refineCourseVisualAsset(db: VisualResourcesDb, courseId: string, assetId: string, instruction: string, idempotencyKey: string, deps: CourseImageGenerationDeps) {
  const [course, parent, planRecord] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
    db.courseImage.findFirst({ where: { id: assetId, courseId } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
  ]);
  if (!course || !parent) throw new VisualResourcesNotFoundError("图片版本不存在");
  if (parent.status !== "succeeded" || !parent.storagePath) throw new VisualResourcesInvalidStateError("只能修改生成成功的图片版本");
  const referencePaths = [parent.storagePath];
  const referenceAssetIds = [parent.id];
  const prompt = buildCourseImageEditPrompt(instruction);
  const requestedQuality = parent.characterVisualId ? "low" : course.visualQuality;
  const quality = deps.normalizeQuality?.(requestedQuality) ?? requestedQuality;
  const sourceHash = visualGenerationFingerprint({ prompt, quality, referenceAssetIds });
  const now = new Date();
  const asset = await db.courseImage.upsert({ where: { courseId_idempotencyKey: { courseId, idempotencyKey } }, create: { courseId, slotId: parent.slotId, characterVisualId: parent.characterVisualId, parentAssetId: parent.id, operation: "revision", userInstruction: instruction.trim(), prompt, quality, provider: deps.provider ?? "quickrouter_gpt_image_2", referenceAssetIds, sourceHash, planRevision: planRecord?.revision ?? parent.planRevision, idempotencyKey, startedAt: now, leaseExpiresAt: new Date(now.getTime() + COURSE_IMAGE_LEASE_MS) }, update: {} });
  if (asset.status === "succeeded") {
    await adoptSucceededCourseImage(db, asset);
    return asset;
  }
  return finishCourseImage(db, asset, deps, { storagePaths: referencePaths, portrait: Boolean(parent.characterVisualId) });
}
