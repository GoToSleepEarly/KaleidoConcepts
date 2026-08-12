import type { PrismaClient } from "@prisma/client";

import type {
  CharacterVisualIntent,
  CourseCharacterSourceType,
  CourseImageStatus,
  CourseImageQuality,
  CourseVisualAsset,
  CourseVisualResourcesState,
} from "@/lib/contracts/api";
import { buildCleanParagraphText } from "@/lib/domain/course-content";
import { defaultCharacterVisualIntent, matchCoursePersonForCharacter } from "@/lib/domain/visual-resources";
import { visualGenerationFingerprint } from "@/lib/domain/visual-resources";
import { compileCourseImagePrompt, createCourseVisualPlanDeps, type CourseVisualPlanDeps } from "@/lib/server/ai/course-visual-plan-deps";

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
>;

export type CourseImageGenerationDeps = {
  generate: (input: { prompt: string; quality: CourseImageQuality; portrait?: boolean }) => Promise<{ imageUrl: string }>;
  edit: (input: { prompt: string; quality: CourseImageQuality; imageDataUrl: string; portrait?: boolean }) => Promise<{ imageUrl: string }>;
  persist: (input: { sourceUrl: string; courseId: string; assetId: string; portrait?: boolean }) => Promise<{ storagePath: string; publicUrl: string }>;
  composeReferences: (storagePaths: string[]) => Promise<string>;
  removeTemporarySource: (storagePath: string) => Promise<void>;
};

export class VisualResourcesNotFoundError extends Error {
  constructor(message = "课程视觉资源不存在") { super(message); this.name = "VisualResourcesNotFoundError"; }
}

export class VisualResourcesInvalidStateError extends Error {
  constructor(message: string) { super(message); this.name = "VisualResourcesInvalidStateError"; }
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function storyVisualDesigns(value: unknown) {
  if (!value || typeof value !== "object") return new Map<string, string>();
  const designs = Reflect.get(value, "characterDesigns");
  if (!Array.isArray(designs)) return new Map<string, string>();
  return new Map(designs.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const characterId = Reflect.get(item, "characterId");
    const storyVisualDesign = Reflect.get(item, "storyVisualDesign");
    return typeof characterId === "string" && typeof storyVisualDesign === "string" ? [[characterId, storyVisualDesign] as const] : [];
  }));
}

function isCurrentVisualPlan(value: unknown) {
  return Boolean(value && typeof value === "object"
    && typeof Reflect.get(value, "visualStyle") === "string"
    && typeof Reflect.get(value, "storyWorld") === "string"
    && Array.isArray(Reflect.get(value, "characterDesigns")));
}

function toAsset(asset: {
  id: string;
  parentAssetId: string | null;
  operation: string;
  userInstruction: string | null;
  quality: string;
  status: string;
  publicUrl: string | null;
  failureReason: string | null;
  createdAt: Date;
}): CourseVisualAsset {
  return {
    id: asset.id,
    parentAssetId: asset.parentAssetId,
    operation: asset.operation as CourseVisualAsset["operation"],
    userInstruction: asset.userInstruction,
    quality: asset.quality as CourseImageQuality,
    status: asset.status as CourseVisualAsset["status"],
    publicUrl: asset.publicUrl,
    failureReason: asset.failureReason,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function getCourseVisualResources(db: VisualResourcesDb, courseId: string): Promise<CourseVisualResourcesState> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, currentStage: true, visualQuality: true } });
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  const [characters, visuals, plan, slots, people, content] = await Promise.all([
    db.courseCharacter.findMany({ where: { courseId }, include: { sourceReference: true }, orderBy: { createdAt: "asc" } }),
    db.courseCharacterVisual.findMany({ where: { courseId }, include: { activeImage: true, images: { orderBy: { createdAt: "asc" } } } }),
    db.courseVisualResourcePlan.findUnique({ where: { courseId } }),
    db.courseVisualImageSlot.findMany({ where: { courseId }, include: { activeImage: true, images: { orderBy: { createdAt: "asc" } } }, orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }] }),
    db.coursePerson.findMany({ where: { courseId }, include: { visualAssetSnapshot: true } }),
    db.courseLessonContent.findUnique({ where: { courseId }, select: { chapters: true } }),
  ]);
  const visualByCharacter = new Map(visuals.map((visual) => [visual.characterId, visual]));
  const designByCharacter = storyVisualDesigns(plan?.coverBrief);
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
  return {
    course: { id: course.id, title: course.title, currentStage: course.currentStage },
    quality: course.visualQuality,
    planReady: Boolean(plan && isCurrentVisualPlan(plan.coverBrief)),
    characters: characters.filter((character) => character.shouldAppearInImages).map((character) => {
      const visual = visualByCharacter.get(character.id);
      const matchedPersonId = matchedPeople.get(character.id) ?? character.sourcePersonId;
      const personSnapshot = matchedPersonId ? personById.get(matchedPersonId) : null;
      const personVisualUrl = personSnapshot?.visualAssetSnapshot?.publicUrl ?? null;
      const inferredIntent = defaultCharacterVisualIntent(character.sourceType as CourseCharacterSourceType);
      return {
        id: visual?.id ?? character.id,
        characterId: character.id,
        displayName: character.displayName,
        sourceType: character.sourceType,
        sourceReferenceType: character.sourceReference?.type ?? null,
        shouldAppearInImages: character.shouldAppearInImages,
        intent: visual?.intent ?? inferredIntent,
        source: visual?.source ?? (personVisualUrl ? "person_asset" : null),
        status: visual?.status ?? (personVisualUrl ? "ready" : "missing"),
        personVisualUrl,
        storyVisualDesign: designByCharacter.get(character.id) ?? null,
        activeAssetId: visual?.activeImageId ?? null,
        activeAsset: visual?.activeImage ? toAsset(visual.activeImage) : null,
        versions: (visual?.images ?? []).map(toAsset),
      };
    }),
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
      prompt: slot.prompt,
      activeAssetId: slot.activeImageId,
      activeAsset: slot.activeImage ? toAsset(slot.activeImage) : null,
      versions: slot.images.map(toAsset),
      };
    }),
  };
}

export async function updateCourseVisualQuality(db: VisualResourcesDb, courseId: string, quality: CourseImageQuality) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  await db.course.update({ where: { id: courseId }, data: { visualQuality: quality } });
  return { quality };
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
  return db.courseCharacterVisual.upsert({
    where: { characterId },
    create: { courseId, characterId, source: "person_asset", personVisualAssetId: person.activeVisualAssetId, status: "ready" },
    update: { source: "person_asset", personVisualAssetId: person.activeVisualAssetId, activeImageId: null, status: "ready" },
  });
}

export async function selectCourseVisualAsset(db: VisualResourcesDb, courseId: string, assetId: string) {
  const asset = await db.courseImage.findFirst({ where: { id: assetId, courseId }, select: { id: true, courseId: true, slotId: true, characterVisualId: true, status: true } });
  if (!asset) throw new VisualResourcesNotFoundError("图片版本不存在");
  if (asset.status !== "succeeded") throw new VisualResourcesInvalidStateError("只能采用生成成功的图片版本");
  if (asset.slotId) await db.courseVisualImageSlot.update({ where: { id: asset.slotId }, data: { activeImageId: asset.id } });
  else if (asset.characterVisualId) await db.courseCharacterVisual.update({ where: { id: asset.characterVisualId }, data: { activeImageId: asset.id, status: "ready" } });
  else throw new VisualResourcesInvalidStateError("图片版本没有可采用的目标");
  return { assetId: asset.id };
}

type ContentChapter = {
  id: string;
  order?: number;
  outlineChapterId: string;
  title: string;
  paragraphs: Array<{ id: string; parts: Parameters<typeof buildCleanParagraphText>[0]["parts"] }>;
};

export async function generateCourseVisualPlan(db: VisualResourcesDb, courseId: string, deps: CourseVisualPlanDeps = createCourseVisualPlanDeps()) {
  const [course, content, outline, characters] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, englishLevel: true } }),
    db.courseLessonContent.findUnique({ where: { courseId } }),
    db.courseStoryOutline.findUnique({ where: { courseId }, include: { chapters: true } }),
    db.courseCharacter.findMany({ where: { courseId, shouldAppearInImages: true } }),
  ]);
  if (!course || !content || !outline) throw new VisualResourcesInvalidStateError("请先确认文案与练习");
  if (content.status !== "confirmed") throw new VisualResourcesInvalidStateError("请先确认文案与练习");
  const chapters = (Array.isArray(content.chapters) ? content.chapters : []) as ContentChapter[];
  const paragraphs = chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    chapterId: chapter.id,
    text: buildCleanParagraphText(paragraph),
  })));
  const generatedPlan = await deps.generate({
    course: { title: course.title, englishLevel: course.englishLevel },
    outline: {
      title: outline.title,
      summary: outline.summary,
      chapters: outline.chapters.map((chapter) => ({ id: chapter.id, order: chapter.order, title: chapter.title, setting: chapter.setting })),
    },
    characters: characters.map((character) => ({
      id: character.id,
      displayName: character.displayName,
      sourceType: character.sourceType,
      roleInStory: character.roleInStory,
      shortDescription: character.shortDescription,
      visualDescription: character.visualDescription,
    })),
    paragraphs,
  }, content.writingProvider);
  const coverCharacterIds = generatedPlan.cover.characterIds;
  const coverPrompt = compileCourseImagePrompt(generatedPlan, generatedPlan.cover);
  await db.courseVisualResourcePlan.upsert({
    where: { courseId },
    create: { courseId, sourceRevision: `${content.sourceRevision}:${content.contentVersion}`, coverBrief: { focus: generatedPlan.cover.focus, prompt: coverPrompt, characterIds: coverCharacterIds, visualStyle: generatedPlan.visualStyle, storyWorld: generatedPlan.storyWorld, characterDesigns: generatedPlan.characterDesigns } },
    update: { sourceRevision: `${content.sourceRevision}:${content.contentVersion}`, coverBrief: { focus: generatedPlan.cover.focus, prompt: coverPrompt, characterIds: coverCharacterIds, visualStyle: generatedPlan.visualStyle, storyWorld: generatedPlan.storyWorld, characterDesigns: generatedPlan.characterDesigns } },
  });
  await db.courseVisualImageSlot.upsert({
    where: { courseId_stableKey: { courseId, stableKey: "visual-cover" } },
    create: { courseId, stableKey: "visual-cover", slotType: "visual_cover", sourceText: outline.summary, characterIds: coverCharacterIds, focus: generatedPlan.cover.focus, prompt: coverPrompt },
    update: { sourceText: outline.summary, characterIds: coverCharacterIds, focus: generatedPlan.cover.focus, prompt: coverPrompt },
  });
  const shotByParagraph = new Map(generatedPlan.shots.map((shot) => [shot.paragraphId, shot]));
  for (const chapter of chapters) {
    for (const paragraph of chapter.paragraphs) {
      const sourceText = buildCleanParagraphText(paragraph);
      const shot = shotByParagraph.get(paragraph.id);
      if (!shot) throw new Error(`视觉资源方案缺少段落 ${paragraph.id}`);
      const prompt = compileCourseImagePrompt(generatedPlan, shot);
      await db.courseVisualImageSlot.upsert({
        where: { courseId_stableKey: { courseId, stableKey: `paragraph-${paragraph.id}` } },
        create: { courseId, stableKey: `paragraph-${paragraph.id}`, slotType: "lesson_shot", chapterId: chapter.id, paragraphId: paragraph.id, sourceText, characterIds: shot.characterIds, focus: shot.focus, prompt },
        update: { chapterId: chapter.id, paragraphId: paragraph.id, sourceText, characterIds: shot.characterIds, focus: shot.focus, prompt },
      });
    }
  }
  await db.course.update({ where: { id: courseId }, data: { currentStage: "visual_resources" } });
  return getCourseVisualResources(db, courseId);
}

function recoverableUrl(url: string | null) {
  return url && !url.startsWith("data:") ? url : null;
}

async function finishCourseImage(
  db: VisualResourcesDb,
  asset: { id: string; courseId: string; slotId?: string | null; characterVisualId?: string | null; prompt: string; quality: CourseImageQuality; status: CourseImageStatus; providerImageUrl: string | null; temporarySourcePath: string | null },
  deps: CourseImageGenerationDeps,
  input: { storagePaths?: string[]; portrait?: boolean; sourceDataUrl?: string; allowTextGeneration?: boolean },
) {
  const claimed = await db.courseImage.updateMany({ where: { id: asset.id, status: { in: ["pending", "failed"] } }, data: { status: "submitting", failureReason: null } });
  if (claimed.count === 0) return db.courseImage.findUnique({ where: { id: asset.id } });
  let remoteUrl = recoverableUrl(asset.providerImageUrl);
  try {
    let sourceUrl = remoteUrl;
    if (!sourceUrl) {
      if (input.allowTextGeneration) sourceUrl = (await deps.generate({ prompt: asset.prompt, quality: asset.quality, portrait: input.portrait })).imageUrl;
      else {
        const imageDataUrl = input.sourceDataUrl ?? await deps.composeReferences(input.storagePaths ?? []);
        sourceUrl = (await deps.edit({ prompt: asset.prompt, quality: asset.quality, imageDataUrl, portrait: input.portrait })).imageUrl;
      }
      remoteUrl = recoverableUrl(sourceUrl);
    }
    if (!sourceUrl) throw new Error("图片生成服务未返回图片");
    const stored = await deps.persist({ sourceUrl, courseId: asset.courseId, assetId: asset.id, portrait: input.portrait });
    const succeeded = await db.courseImage.update({ where: { id: asset.id }, data: { status: "succeeded", providerImageUrl: remoteUrl, storagePath: stored.storagePath, publicUrl: stored.publicUrl, temporarySourcePath: null, failureReason: null } });
    if (asset.slotId) await db.courseVisualImageSlot.update({ where: { id: asset.slotId }, data: { activeImageId: asset.id } });
    if (asset.characterVisualId) await db.courseCharacterVisual.update({ where: { id: asset.characterVisualId }, data: { activeImageId: asset.id, status: "ready" } });
    return succeeded;
  } catch (error) {
    await db.courseImage.update({ where: { id: asset.id }, data: { status: "failed", providerImageUrl: remoteUrl, failureReason: error instanceof Error ? error.message : "图片生成失败" } });
    throw error;
  } finally {
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
  const [{ visual, character }, course] = await Promise.all([
    getOrCreateCharacterVisual(db, courseId, characterId),
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
  ]);
  if (!course) throw new VisualResourcesNotFoundError("课程不存在");
  if (character.sourceType !== "referenced" || visual.intent !== "preserve_identity") throw new VisualResourcesInvalidStateError("只有保持原形象的外部角色需要上传外形参考");
  const prompt = `Identity appearance reference for ${character.displayName}; use facial identity, hairstyle, age impression, body build, and distinctive physical traits only.`;
  const sourceHash = visualGenerationFingerprint({ prompt, quality: course.visualQuality, referenceAssetIds: [`upload:${idempotencyKey}`] });
  const asset = await db.courseImage.upsert({
    where: { courseId_idempotencyKey: { courseId, idempotencyKey } },
    create: { courseId, characterVisualId: visual.id, operation: "initial", prompt, quality: course.visualQuality, sourceHash, idempotencyKey, referenceAssetIds: [], status: "submitting", temporarySourcePath: prepared.temporarySourcePath },
    update: {},
  });
  if (asset.status === "succeeded") {
    await db.courseCharacterVisual.update({ where: { id: visual.id }, data: { activeImageId: asset.id, source: "uploaded_reference", status: "ready" } });
    return asset;
  }
  try {
    const stored = await deps.persist({ sourceUrl: prepared.sourceDataUrl, courseId, assetId: asset.id, portrait: true });
    const succeeded = await db.courseImage.update({ where: { id: asset.id }, data: { status: "succeeded", storagePath: stored.storagePath, publicUrl: stored.publicUrl, temporarySourcePath: null, failureReason: null } });
    await db.courseCharacterVisual.update({ where: { id: visual.id }, data: { activeImageId: asset.id, source: "uploaded_reference", status: "ready" } });
    return succeeded;
  } catch (error) {
    await db.courseImage.update({ where: { id: asset.id }, data: { status: "failed", failureReason: error instanceof Error ? error.message : "外形参考保存失败" } });
    throw error;
  }
}

async function slotReferenceAssets(db: VisualResourcesDb, courseId: string, characterIds: string[]) {
  const paths: string[] = [];
  const ids: string[] = [];
  for (const characterId of characterIds) {
    const character = await db.courseCharacter.findFirst({ where: { id: characterId, courseId } });
    if (!character) continue;
    if (character.sourceType === "person") {
      const coursePeople = await db.coursePerson.findMany({ where: { courseId }, include: { visualAssetSnapshot: true } });
      const matched = matchCoursePersonForCharacter(character, coursePeople.map((person) => ({ personId: person.personId, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot })));
      const snapshot = matched ? coursePeople.find((person) => person.personId === matched.personId) : null;
      if (snapshot?.visualAssetSnapshot?.storagePath) {
        paths.push(snapshot.visualAssetSnapshot.storagePath);
        ids.push(snapshot.visualAssetSnapshot.id);
        continue;
      }
    }
    const visual = await db.courseCharacterVisual.findUnique({ where: { characterId }, include: { activeImage: true } });
    if (visual?.activeImage?.storagePath) {
      paths.push(visual.activeImage.storagePath);
      ids.push(visual.activeImage.id);
      continue;
    }
    if (character.sourceType === "original" || (character.sourceType === "referenced" && visual?.intent === "originalize")) continue;
    throw new VisualResourcesInvalidStateError(`角色“${character.displayName}”还没有可用的外形参考`);
  }
  return { paths, ids };
}

export async function generateVisualSlot(db: VisualResourcesDb, courseId: string, slotId: string, idempotencyKey: string, deps: CourseImageGenerationDeps) {
  const [course, slot] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
    db.courseVisualImageSlot.findFirst({ where: { id: slotId, courseId } }),
  ]);
  if (!course || !slot) throw new VisualResourcesNotFoundError("图片槽不存在");
  const references = await slotReferenceAssets(db, courseId, asStrings(slot.characterIds));
  const runningAsset = await db.courseImage.findFirst({
    where: { courseId, slotId, status: { in: ["pending", "submitting", "generating"] } },
    orderBy: { createdAt: "desc" },
  });
  if (runningAsset) return runningAsset;
  const sourceHash = visualGenerationFingerprint({ prompt: slot.prompt, quality: course.visualQuality, referenceAssetIds: references.ids });
  const asset = await db.courseImage.upsert({ where: { courseId_idempotencyKey: { courseId, idempotencyKey } }, create: { courseId, slotId, operation: "initial", prompt: slot.prompt, quality: course.visualQuality, referenceAssetIds: references.ids, sourceHash, idempotencyKey }, update: {} });
  if (asset.status === "succeeded") return asset;
  return finishCourseImage(db, asset, deps, { storagePaths: references.paths, allowTextGeneration: references.paths.length === 0 });
}

export async function refineCourseVisualAsset(db: VisualResourcesDb, courseId: string, assetId: string, instruction: string, idempotencyKey: string, deps: CourseImageGenerationDeps) {
  const [course, parent] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { visualQuality: true } }),
    db.courseImage.findFirst({ where: { id: assetId, courseId } }),
  ]);
  if (!course || !parent) throw new VisualResourcesNotFoundError("图片版本不存在");
  if (parent.status !== "succeeded" || !parent.storagePath) throw new VisualResourcesInvalidStateError("只能修改生成成功的图片版本");
  let basePrompt = parent.prompt;
  const referencePaths = [parent.storagePath];
  const referenceAssetIds = [parent.id];
  if (parent.slotId) {
    const slot = await db.courseVisualImageSlot.findUnique({ where: { id: parent.slotId } });
    if (slot) {
      basePrompt = slot.prompt;
      const characterReferences = await slotReferenceAssets(db, courseId, asStrings(slot.characterIds));
      referencePaths.push(...characterReferences.paths);
      referenceAssetIds.push(...characterReferences.ids);
    }
  }
  const prompt = `${basePrompt}\nUSER REVISION: ${instruction.trim()}\nKeep the locked character identity, course story design, wide 16:9 composition, and pure-image restrictions.`;
  const sourceHash = visualGenerationFingerprint({ prompt, quality: course.visualQuality, referenceAssetIds });
  const asset = await db.courseImage.upsert({ where: { courseId_idempotencyKey: { courseId, idempotencyKey } }, create: { courseId, slotId: parent.slotId, characterVisualId: parent.characterVisualId, parentAssetId: parent.id, operation: "revision", userInstruction: instruction.trim(), prompt, quality: course.visualQuality, referenceAssetIds, sourceHash, idempotencyKey }, update: {} });
  if (asset.status === "succeeded") return asset;
  return finishCourseImage(db, asset, deps, { storagePaths: referencePaths, portrait: Boolean(parent.characterVisualId) });
}
