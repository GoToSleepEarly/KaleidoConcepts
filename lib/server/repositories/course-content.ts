import { createHash } from "node:crypto";

import type { CourseContentChapter, CourseContentPart, CourseContentPhase, CourseContentState, CourseContentStatus, CourseGrammarQuestion, StoryContentIntent, StoryWritingProvider, TeachingPlanState } from "@/lib/contracts/api";
import { buildCleanParagraphText, collectVocabularyMatching, courseContentQuestionPageSize, englishWordCount, paginateBalanced, stableShuffle, validateGrammarCoverage, validateParagraphParts } from "@/lib/domain/course-content";
import { furthestCourseStage, staleStageAfterConfirming } from "@/lib/domain/course-stage";
import { englishWordRangesForTarget } from "@/lib/domain/story-length-policy";
import { readingPageCount } from "@/lib/domain/teaching-plan-policy";
import { storyContentIntentFromAlignmentDetails } from "@/lib/domain/story-content-intent";
import { buildPromptParts, buildPromptQuestions, buildReadingTemplateRequirements, mainIdeaWordCountPolicy, type CourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import {
  STEP4_CONTENT_CONTRACT_VERSION,
  applyChapterTemplateRepairs,
  compileChapterTemplate,
  decompileChapterTemplate,
  repairFullyResolvesChapter,
  type ChapterTemplateIssue,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
} from "@/lib/server/ai/course-content-template";
import { getTeachingPlanState, type TeachingPlanDb } from "@/lib/server/repositories/teaching-plan";
import type { GeneratedModification, GeneratedQuestion } from "@/lib/server/validation/course-content";

type ContentRecord = {
  id: string; courseId: string; status: CourseContentStatus; phase: CourseContentPhase; writingProvider: StoryWritingProvider;
  sourceRevision: string; contentVersion: number; chapters: unknown; mainIdea: unknown; homework: unknown; exercisesStale: boolean;
  errorMessage: string | null; activeGenerationId: string | null; updatedAt: Date;
};
type ContentOperation = "reading" | "exercises" | "modify";
type GenerationRecord = {
  id: string; courseId: string; operation: ContentOperation; status: "running" | "succeeded" | "failed" | "result_unknown";
  baseContentVersion: number; previousStatus: CourseContentStatus; leaseExpiresAt: Date; startedAt: Date; updatedAt: Date;
};
type MessageRecord = { id: string; role: "teacher" | "assistant" | "system"; content: string; targetType?: "chapter" | "paragraph" | "chapter_practice" | "main_idea" | "homework" | null; targetId?: string | null; createdAt: Date };
type PromptPersonRecord = { role: "teacher" | "student"; chineseNameSnapshot: string; englishNameSnapshot: string };
type PromptCharacterRecord = { displayName: string; englishName: string; roleInStory: string; shortDescription: string };
type Delegate<T> = {
  findUnique: (query: Record<string, unknown>) => Promise<T | null>;
  findMany?: (query: Record<string, unknown>) => Promise<T[]>;
  upsert?: (query: Record<string, unknown>) => Promise<T>;
  create?: (query: Record<string, unknown>) => Promise<T>;
  update?: (query: Record<string, unknown>) => Promise<T>;
  updateMany?: (query: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany?: (query: Record<string, unknown>) => Promise<{ count: number }>;
};

export type CourseContentDb = Omit<TeachingPlanDb, "courseLessonContent" | "courseContentGeneration" | "courseContentChatMessage"> & {
  courseLessonContent: Delegate<ContentRecord>;
  courseContentGeneration: Delegate<GenerationRecord>;
  courseContentChatMessage: Delegate<MessageRecord>;
  coursePerson?: Required<Pick<Delegate<PromptPersonRecord>, "findMany">>;
  courseCharacter?: Required<Pick<Delegate<PromptCharacterRecord>, "findMany">>;
  aiGenerationLog?: Required<Pick<Delegate<Record<string, unknown>>, "create">>;
};

export class CourseContentNotFoundError extends Error { constructor(message = "课程不存在") { super(message); this.name = "CourseContentNotFoundError"; } }
export class CourseContentPrerequisiteError extends Error { constructor(message = "请先确认教学规划") { super(message); this.name = "CourseContentPrerequisiteError"; } }
export class CourseContentConflictError extends Error { constructor(message = "已有相同内容正在生成，请勿重复提交") { super(message); this.name = "CourseContentConflictError"; } }
export class CourseContentSupersededError extends Error { constructor(message = "内容已在其他页面更新，本次旧结果未写入") { super(message); this.name = "CourseContentSupersededError"; } }

const mainIdeaTitle = "Main Idea Reading Practice";
const operationLeaseMs = 90_000;
const operationHeartbeatMs = 25_000;
export const courseContentSemanticRepairAttempts = 1;

function leaseDeadline(now = new Date()) { return new Date(now.getTime() + operationLeaseMs); }

function inTransaction<T>(db: CourseContentDb, callback: (tx: CourseContentDb) => Promise<T>) {
  return db.$transaction ? db.$transaction((tx) => callback(tx as CourseContentDb)) : callback(db);
}

function sourceRevision(input: TeachingPlanState & { contentIntent?: StoryContentIntent }) {
  return createHash("sha256").update(JSON.stringify({ contractVersion: STEP4_CONTENT_CONTRACT_VERSION, outline: input.outline, plan: input.plan, contentIntent: input.contentIntent })).digest("hex");
}

const wordCount = englishWordCount;

export function requiresExerciseAi(plan: TeachingPlanState["plan"]) {
  const hasQuestions = (grammar: { optionCloze: number; wordForm: number }) => grammar.optionCloze > 0 || grammar.wordForm > 0;
  return plan.chapters.some((chapter) => chapter.chapterPractice.enabled && hasQuestions(chapter.chapterPractice.grammar))
    || (plan.afterClassPractice.practice.enabled && hasQuestions(plan.afterClassPractice.practice.grammar));
}

function locallyAssembledExercises(state: TeachingPlanState, chapters: CourseContentChapter[]) {
  const normalizedChapters = chapters.map((chapter) => ({ ...chapter, chapterPractice: [] }));
  const homework = state.plan.afterClassPractice.enabled
    ? { grammar: [], vocabularyMatching: state.plan.afterClassPractice.vocabularyReviewEnabled ? collectVocabularyMatching(normalizedChapters) : [] }
    : null;
  return { chapters: normalizedChapters, homework };
}

function pointKeyMap(state: TeachingPlanState) {
  return new Map(state.knowledgePoints.map((point, index) => [`KP${index + 1}`, point.id]));
}

function promptPoints(state: TeachingPlanState, ids: string[]) {
  const keys = new Map(state.knowledgePoints.map((point, index) => [point.id, { key: `KP${index + 1}`, label: point.label, category: point.category, bookTitle: point.bookTitle, edition: point.edition, officialLevel: point.officialLevel, unitStart: point.unitStart, unitEnd: point.unitEnd, sourceUnits: point.units }]));
  return ids.map((id) => keys.get(id)).filter((point): point is NonNullable<ReturnType<typeof keys.get>> => Boolean(point));
}

function knowledgePointLabels(knowledgePoints: Array<{ id: string; label: string }>, ids: string[]) {
  const labels = new Map(knowledgePoints.map((point) => [point.id, point.label]));
  const known = ids.map((id) => labels.get(id)).filter((label): label is string => Boolean(label));
  const unknownCount = ids.length - known.length;
  return [...known, ...(unknownCount ? [`未识别知识点 ${unknownCount} 个`] : [])];
}

function normalizeTemplateChapter(
  state: TeachingPlanState,
  generated: GeneratedChapterTemplate | null,
  requirements: ChapterTemplateRequirements,
  parseError?: string | null,
): { chapter: CourseContentChapter; draft: GeneratedChapterTemplate | null; structuredIssues: ChapterTemplateIssue[] } {
  const keyMap = new Map(requirements.grammarPoints.flatMap((point) => point.knowledgePointId ? [[point.key, point.knowledgePointId] as const] : []));
  const outlineChapter = state.outline.chapters.find((chapter) => chapter.id === requirements.outlineChapterId)!;
  const planChapter = state.plan.chapters.find((chapter) => chapter.outlineChapterId === requirements.outlineChapterId)!;
  const compiled = generated ? compileChapterTemplate(generated, requirements) : null;
  const structuredIssues = compiled?.issues ?? [{ code: "part_structure" as const, message: parseError ?? "章节缺失" }];
  const paragraphs = (compiled?.paragraphs ?? []).map((paragraph) => ({
    ...paragraph,
    parts: paragraph.parts.map((part): CourseContentPart => part.type === "grammar"
      ? { ...part, knowledgePointId: keyMap.get(part.knowledgePointId) ?? part.knowledgePointId }
      : part),
  }));
  const chapter: CourseContentChapter = {
    id: `chapter-${outlineChapter.id}`,
    outlineChapterId: outlineChapter.id,
    order: outlineChapter.order,
    title: outlineChapter.title,
    targetWordCount: planChapter.targetWordCount ?? 90,
    readingExerciseMode: planChapter.readingExerciseMode,
    paragraphs,
    chapterPractice: [],
    validationIssues: structuredIssues.map((issue) => issue.message),
  };
  return { chapter, draft: generated, structuredIssues };
}

function normalizeModifiedChapter(state: TeachingPlanState, generated: NonNullable<GeneratedModification["chapter"]>): CourseContentChapter {
  const outlineChapter = state.outline.chapters.find((chapter) => chapter.id === generated.outlineChapterId);
  const planChapter = state.plan.chapters.find((chapter) => chapter.outlineChapterId === generated.outlineChapterId);
  if (!outlineChapter || !planChapter) throw new Error("章节修改返回了非目标章节");
  const keyMap = pointKeyMap(state);
  return {
    id: `chapter-${outlineChapter.id}`,
    outlineChapterId: outlineChapter.id,
    order: outlineChapter.order,
    title: outlineChapter.title,
    targetWordCount: planChapter.targetWordCount ?? 90,
    readingExerciseMode: planChapter.readingExerciseMode,
    paragraphs: generated.paragraphs.map((paragraph, paragraphIndex) => ({
      id: `paragraph-${outlineChapter.id}-${paragraphIndex + 1}`,
      parts: paragraph.parts.map((part, partIndex): CourseContentPart => {
        if (part.type === "text") return part;
        const id = `${part.type}-${outlineChapter.id}-${paragraphIndex + 1}-${partIndex + 1}`;
        if (part.type === "vocabulary") return { ...part, id };
        if (part.exerciseType === "optionCloze") return { type: "grammar", id, exerciseType: part.exerciseType, knowledgePointId: keyMap.get(part.knowledgePointKey) ?? part.knowledgePointKey, answer: part.answer, options: stableShuffle([part.answer, ...part.distractors], id) };
        return { type: "grammar", id, exerciseType: part.exerciseType, knowledgePointId: keyMap.get(part.knowledgePointKey) ?? part.knowledgePointKey, answer: part.answer, baseForm: part.baseForm };
      }),
    })),
    chapterPractice: [],
    validationIssues: [],
  };
}

function validateChapter(state: TeachingPlanState, chapter: CourseContentChapter) {
  const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
  const issues = chapter.paragraphs.flatMap(validateParagraphParts);
  const parts = chapter.paragraphs.flatMap((paragraph) => paragraph.parts);
  const grammar = parts.filter((part): part is Extract<typeof part, { type: "grammar" }> => part.type === "grammar");
  const vocabulary = parts.filter((part) => part.type === "vocabulary");
  const missing = validateGrammarCoverage(plan.knowledgePointIds, grammar);
  if (missing.length) issues.push(`正文语法题未覆盖知识点：${knowledgePointLabels(state.knowledgePoints, missing).join("、")}`);
  const optionCount = grammar.filter((item) => item.exerciseType === "optionCloze").length;
  const wordFormCount = grammar.filter((item) => item.exerciseType === "wordForm").length;
  if (optionCount !== plan.readingExercises.grammar.optionCloze) issues.push(`选项填空数量应为 ${plan.readingExercises.grammar.optionCloze}，实际 ${optionCount}`);
  if (wordFormCount !== plan.readingExercises.grammar.wordForm) issues.push(`给词变形数量应为 ${plan.readingExercises.grammar.wordForm}，实际 ${wordFormCount}`);
  if (vocabulary.length !== plan.readingExercises.vocabulary.chineseHint) issues.push(`词汇题数量应为 ${plan.readingExercises.vocabulary.chineseHint}，实际 ${vocabulary.length}`);
  const actualWords = wordCount(chapter.paragraphs.map(buildCleanParagraphText).join(" "));
  const [minimumWords, maximumWords] = englishWordRangesForTarget(chapter.targetWordCount).validationRange;
  if (actualWords < minimumWords || actualWords > maximumWords) issues.push(`正文词数目标 ${chapter.targetWordCount}，实际 ${actualWords}`);
  const expectedPages = readingPageCount(plan.targetWordCount ?? 90, plan.paragraphCount);
  if (chapter.paragraphs.length !== expectedPages) issues.push(`正文应分为 ${expectedPages} 个段落页，实际 ${chapter.paragraphs.length}`);
  return [...new Set(issues)];
}

function normalizeQuestion(raw: GeneratedQuestion, prefix: string, index: number, keys: Map<string, string>): CourseGrammarQuestion {
  const id = `${prefix}-${index + 1}`;
  if (raw.type === "optionCloze") return { id, type: raw.type, knowledgePointId: keys.get(raw.knowledgePointKey) ?? raw.knowledgePointKey, before: raw.before, after: raw.after, answer: raw.answer, options: stableShuffle([raw.answer, ...raw.distractors], id) };
  return { id, type: raw.type, knowledgePointId: keys.get(raw.knowledgePointKey) ?? raw.knowledgePointKey, before: raw.before, after: raw.after, answer: raw.answer, baseForm: raw.baseForm };
}

export function exerciseQuestionIssues(
  knowledgePoints: Array<{ id: string; label: string }>,
  requiredIds: string[],
  expected: { optionCloze: number; wordForm: number },
  questions: CourseGrammarQuestion[],
) {
  const issues: string[] = [];
  const missing = validateGrammarCoverage(requiredIds, questions);
  if (missing.length) issues.push(`未覆盖知识点：${knowledgePointLabels(knowledgePoints, missing).join("、")}`);
  const labels = { optionCloze: "选项填空", wordForm: "给词变形" } as const;
  for (const type of ["optionCloze", "wordForm"] as const) {
    const actual = questions.filter((question) => question.type === type).length;
    if (actual !== expected[type]) issues.push(`${labels[type]}数量应为 ${expected[type]}，实际 ${actual}`);
  }
  const invalidOptions = questions.filter((question) => question.type === "optionCloze" && (question.options?.length !== 3 || new Set(question.options.map((option) => option.trim().toLocaleLowerCase())).size !== 3 || !question.options.includes(question.answer))).length;
  if (invalidOptions) issues.push(`${invalidOptions} 道选项填空的选项结构无效`);
  const missingBaseForms = questions.filter((question) => question.type === "wordForm" && !question.baseForm).length;
  if (missingBaseForms) issues.push(`${missingBaseForms} 道给词变形缺少原形提示`);
  return issues;
}

async function prerequisite(db: CourseContentDb, courseId: string) {
  const state = await getTeachingPlanState(db, courseId);
  if (state.plan.status !== "confirmed") throw new CourseContentPrerequisiteError();
  const [course, people, characters] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, include: { storySetting: true } }),
    db.coursePerson?.findMany ? db.coursePerson.findMany({ where: { courseId }, orderBy: { role: "asc" } }) : [],
    db.courseCharacter?.findMany ? db.courseCharacter.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  return {
    ...state,
    contentIntent: storyContentIntentFromAlignmentDetails(course?.storySetting?.alignmentDetails),
    promptPeople: people.map((person) => ({ role: person.role, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot })),
    promptCharacters: characters.map((character) => ({ displayName: character.displayName, englishName: character.englishName, roleInStory: character.roleInStory, shortDescription: character.shortDescription })),
  };
}

async function ensureContent(db: CourseContentDb, state: TeachingPlanState) {
  const existing = await db.courseLessonContent.findUnique({ where: { courseId: state.course.id } });
  if (existing) return existing;
  return db.courseLessonContent.upsert!({ where: { courseId: state.course.id }, create: { courseId: state.course.id, sourceRevision: sourceRevision(state) }, update: {} });
}

function toState(state: TeachingPlanState, content: ContentRecord, messages: MessageRecord[], operation: GenerationRecord | null): CourseContentState {
  return {
    course: { id: state.course.id, title: state.course.title, currentStage: state.course.currentStage, staleFromStage: state.course.staleFromStage ?? null, englishLevel: state.course.englishLevel!, storyComplexity: state.lengthPolicy.storyComplexity },
    storyTitle: state.outline.title,
    knowledgePoints: state.knowledgePoints,
    chapterKnowledgePointIds: Object.fromEntries(state.plan.chapters.map((chapter) => [chapter.outlineChapterId, chapter.knowledgePointIds])),
    homeworkKnowledgePointIds: state.plan.afterClassPractice.knowledgePointIds,
    status: content.status,
    phase: content.phase,
    writingProvider: content.writingProvider,
    sourceRevision: content.sourceRevision,
    contentVersion: content.contentVersion,
    chapters: Array.isArray(content.chapters) ? content.chapters as CourseContentChapter[] : [],
    mainIdea: (content.mainIdea as CourseContentState["mainIdea"]) ?? null,
    homework: (content.homework as CourseContentState["homework"]) ?? null,
    exercisesStale: content.exercisesStale,
    messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content, ...(message.targetType ? { targetType: message.targetType, targetId: message.targetId ?? null } : {}), createdAt: message.createdAt.toISOString() })),
    errorMessage: content.errorMessage,
    updatedAt: content.updatedAt?.toISOString() ?? null,
    operation: operation?.status === "running" ? {
      id: operation.id,
      type: operation.operation,
      status: "running",
      startedAt: operation.startedAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    } : null,
  };
}

function interruptedStatus(generation: GenerationRecord | null, content: ContentRecord): CourseContentStatus {
  if (generation?.operation === "exercises" || content.status === "generating_exercises") return "reading_ready";
  if (generation?.operation === "modify") return generation.previousStatus;
  if (generation?.previousStatus && generation.previousStatus !== "empty") return generation.previousStatus;
  return "failed";
}

export async function recoverStaleCourseContentOperation(db: CourseContentDb, courseId: string, now = new Date()) {
  return inTransaction(db, async (tx) => {
    const content = await tx.courseLessonContent.findUnique({ where: { courseId } });
    if (!content) return false;
    const generation = content.activeGenerationId
      ? await tx.courseContentGeneration.findUnique({ where: { id: content.activeGenerationId } })
      : null;
    if (!content.activeGenerationId) return false;
    if (generation?.status === "running" && generation.leaseExpiresAt.getTime() > now.getTime()) return false;

    if (generation?.status === "running") {
      const generationUpdate = tx.courseContentGeneration.updateMany
        ? tx.courseContentGeneration.updateMany({ where: { id: generation.id, status: "running", leaseExpiresAt: { lte: now } }, data: { status: "result_unknown", errorMessage: "任务执行中断，结果未能确认" } })
        : tx.courseContentGeneration.update!({ where: { id: generation.id }, data: { status: "result_unknown", errorMessage: "任务执行中断，结果未能确认" } }).then(() => ({ count: 1 }));
      const changed = await generationUpdate;
      if (!changed.count) return false;
    }

    const data = {
      activeGenerationId: null,
      status: interruptedStatus(generation, content),
      phase: null,
      errorMessage: "上次处理已中断，现有内容已保留。可以重试或重新开始。",
    };
    if (tx.courseLessonContent.updateMany) {
      const released = await tx.courseLessonContent.updateMany({
        where: content.activeGenerationId ? { courseId, activeGenerationId: content.activeGenerationId } : { courseId, activeGenerationId: null, status: content.status },
        data,
      });
      return released.count === 1;
    }
    await tx.courseLessonContent.update!({ where: { courseId }, data });
    return true;
  });
}

export async function getCourseContentState(db: CourseContentDb, courseId: string) {
  const state = await prerequisite(db, courseId);
  const ensured = await ensureContent(db, state);
  await recoverStaleCourseContentOperation(db, courseId);
  const [persistedContent, messages] = await Promise.all([db.courseLessonContent.findUnique({ where: { courseId } }), db.courseContentChatMessage.findMany!({ where: { courseId }, orderBy: { createdAt: "asc" } })]);
  const content = persistedContent ?? ensured;
  const operation = content.activeGenerationId ? await db.courseContentGeneration.findUnique({ where: { id: content.activeGenerationId } }) : null;
  return toState(state, content, messages, operation);
}

export async function updateCourseContentProvider(db: CourseContentDb, courseId: string, writingProvider: StoryWritingProvider) {
  const state = await prerequisite(db, courseId);
  await ensureContent(db, state);
  await db.courseLessonContent.update!({ where: { courseId }, data: { writingProvider } });
  return getCourseContentState(db, courseId);
}

export async function resetCourseContent(db: CourseContentDb, courseId: string) {
  const state = await prerequisite(db, courseId);
  const reset = async (tx: CourseContentDb) => {
    if (!tx.courseContentChatMessage.deleteMany || !tx.courseContentGeneration.deleteMany || !tx.courseLessonContent.deleteMany) {
      throw new Error("当前数据库不支持重新开始文案与练习");
    }
    await tx.courseContentChatMessage.deleteMany({ where: { courseId } });
    await tx.courseContentGeneration.deleteMany({ where: { courseId } });
    await tx.courseLessonContent.deleteMany({ where: { courseId } });
    await tx.course.update({ where: { id: courseId }, data: { currentStage: state.course.currentStage } });
    return getCourseContentState(tx, courseId);
  };
  return db.$transaction ? db.$transaction((tx) => reset(tx as CourseContentDb)) : reset(db);
}

type ClaimedOperation = { claimed: boolean; firstAttempt: boolean; id: string; baseContentVersion: number; previousStatus: CourseContentStatus };

async function claim(
  db: CourseContentDb,
  courseId: string,
  revision: string,
  operation: ContentOperation,
  idempotencyKey: string,
  startData: Record<string, unknown> = {},
): Promise<ClaimedOperation> {
  try {
    return await inTransaction(db, async (tx) => {
      let content = await tx.courseLessonContent.findUnique({ where: { courseId } });
      if (!content) throw new CourseContentNotFoundError();
      if (content.activeGenerationId) {
        const active = await tx.courseContentGeneration.findUnique({ where: { id: content.activeGenerationId } });
        if (active?.status === "running" && active.leaseExpiresAt.getTime() > Date.now()) throw new CourseContentConflictError("当前内容正在处理，请等待完成或重新开始");
        throw new CourseContentConflictError("上次处理状态需要恢复，请刷新页面后重试");
      }

      const prior = await tx.courseContentGeneration.findUnique({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation } } });
      if (prior?.status === "succeeded") return { claimed: false, firstAttempt: false, id: prior.id, baseContentVersion: prior.baseContentVersion, previousStatus: prior.previousStatus };
      if (prior?.status === "running" && prior.leaseExpiresAt.getTime() > Date.now()) throw new CourseContentConflictError();
      const now = new Date();
      const generation = prior
        ? await tx.courseContentGeneration.update!({ where: { id: prior.id }, data: { status: "running", idempotencyKey, attempt: { increment: 1 }, baseContentVersion: content.contentVersion, previousStatus: content.status, leaseExpiresAt: leaseDeadline(now), startedAt: now, errorMessage: null } })
        : await tx.courseContentGeneration.create!({ data: { courseId, sourceRevision: revision, operation, idempotencyKey, attempt: 1, baseContentVersion: content.contentVersion, previousStatus: content.status, leaseExpiresAt: leaseDeadline(now), startedAt: now } });
      if (tx.courseLessonContent.updateMany) {
        const bound = await tx.courseLessonContent.updateMany({
          where: { courseId, activeGenerationId: null, contentVersion: content.contentVersion },
          data: { ...startData, activeGenerationId: generation.id, errorMessage: null },
        });
        if (bound.count !== 1) throw new CourseContentConflictError("当前内容已在其他页面开始处理");
      } else {
        await tx.courseLessonContent.update!({ where: { courseId }, data: { ...startData, activeGenerationId: generation.id, errorMessage: null } });
      }
      content = { ...content, ...startData, activeGenerationId: generation.id } as ContentRecord;
      return { claimed: true, firstAttempt: !prior, id: generation.id, baseContentVersion: content.contentVersion, previousStatus: generation.previousStatus };
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new CourseContentConflictError("当前内容正在处理，请勿重复提交");
    throw error;
  }
}

async function renewLease(db: CourseContentDb, generationId: string) {
  if (db.courseContentGeneration.updateMany) {
    await db.courseContentGeneration.updateMany({ where: { id: generationId, status: "running" }, data: { leaseExpiresAt: leaseDeadline() } });
  }
}

async function withLease<T>(db: CourseContentDb, generationId: string, callback: () => Promise<T>) {
  const timer = setInterval(() => { void renewLease(db, generationId).catch(() => undefined); }, operationHeartbeatMs);
  timer.unref?.();
  try { return await callback(); }
  finally { clearInterval(timer); }
}

async function updateOwnedContent(db: CourseContentDb, courseId: string, operation: ClaimedOperation, data: Record<string, unknown>, requireVersion = true) {
  if (db.courseLessonContent.updateMany) {
    const updated = await db.courseLessonContent.updateMany({
      where: { courseId, activeGenerationId: operation.id, ...(requireVersion ? { contentVersion: operation.baseContentVersion } : {}) },
      data,
    });
    if (updated.count !== 1) throw new CourseContentSupersededError();
    return;
  }
  await db.courseLessonContent.update!({ where: { courseId }, data });
}

async function appendOwnedMessage(db: CourseContentDb, courseId: string, operation: ClaimedOperation, data: Record<string, unknown>) {
  return inTransaction(db, async (tx) => {
    await updateOwnedContent(tx, courseId, operation, { activeGenerationId: operation.id });
    await tx.courseContentChatMessage.create!({ data: { courseId, ...data } });
  });
}

async function finishOperation(db: CourseContentDb, courseId: string, operation: ClaimedOperation, contentData: Record<string, unknown>, generationData: Record<string, unknown>, sideEffect?: (tx: CourseContentDb) => Promise<void>) {
  return inTransaction(db, async (tx) => {
    await updateOwnedContent(tx, courseId, operation, { ...contentData, activeGenerationId: null });
    await sideEffect?.(tx);
    await tx.courseContentGeneration.update!({ where: { id: operation.id }, data: generationData });
  });
}

async function failOperation(db: CourseContentDb, courseId: string, operation: ClaimedOperation, message: string, fallbackStatus?: CourseContentStatus) {
  try {
    await finishOperation(db, courseId, operation, {
      ...(fallbackStatus ? { status: fallbackStatus } : {}),
      phase: null,
      errorMessage: message,
    }, { status: "failed", errorMessage: message });
  } catch (failure) {
    if (!(failure instanceof CourseContentSupersededError)) throw failure;
  }
}

async function recordContentAiUsage(
  db: CourseContentDb,
  courseId: string,
  operation: ClaimedOperation,
  writingProvider: StoryWritingProvider,
  idempotencyKey: string,
  callType: "candidate" | "final" | "repair",
  usage: unknown,
  targetCount: number,
  diagnostics: Record<string, unknown> = {},
) {
  if (!db.aiGenerationLog?.create || !usage) return;
  await db.aiGenerationLog.create({ data: {
    requestId: `${operation.id}:${idempotencyKey}:step4-reading:${callType}`,
    courseId,
    stage: "content",
    operation: `reading_v2_${callType}`,
    status: "succeeded",
    writingProvider,
    inputSnapshot: { contractVersion: STEP4_CONTENT_CONTRACT_VERSION, targetCount },
    outputSnapshot: { tokenUsage: usage, ...diagnostics },
  } }).catch(() => undefined);
}

export async function generateCourseReading(db: CourseContentDb, courseId: string, idempotencyKey: string, deps: CourseContentGenerationDeps, options: { regenerate?: boolean } = {}) {
  const state = await prerequisite(db, courseId);
  const current = await ensureContent(db, state);
  const baseRevision = sourceRevision(state);
  const revision = options.regenerate ? `${baseRevision}:regenerate:${current.contentVersion + 1}` : baseRevision;
  const operation = await claim(db, courseId, revision, "reading", idempotencyKey, { status: "generating_reading", phase: "generating_chapters", sourceRevision: baseRevision });
  if (!operation.claimed) return getCourseContentState(db, courseId);
  return withLease(db, operation.id, async () => {
  try {
    const requirements = buildReadingTemplateRequirements(state);
    const requirementById = new Map(requirements.map((requirement) => [requirement.outlineChapterId, requirement]));
    const reusableChapters = !options.regenerate && current.status === "failed" && Array.isArray(current.chapters) && current.chapters.length
      ? structuredClone(current.chapters as CourseContentChapter[])
      : null;
    const reusableMainIdea = !options.regenerate && current.status === "failed" && current.mainIdea
      ? structuredClone(current.mainIdea as { title: string; text: string })
      : null;
    const generatedReading = reusableChapters ? null : await deps.generateReading(state, current.writingProvider);
    await updateOwnedContent(db, courseId, operation, { phase: "validating_chapters" });
    let chapterResults = reusableChapters
      ? reusableChapters.map((chapter) => {
          const requirement = requirementById.get(chapter.outlineChapterId)!;
          const knowledgePointKeyById = new Map(requirement.grammarPoints.flatMap((point) => point.knowledgePointId ? [[point.knowledgePointId, point.key] as const] : []));
          const messages = validateChapter(state, chapter);
          return {
            chapter: { ...chapter, validationIssues: messages },
            draft: decompileChapterTemplate(chapter, knowledgePointKeyById),
            structuredIssues: messages.map((message) => ({ code: "part_structure" as const, message })),
            parseError: messages.length ? "历史失败章节需要重新校验" : null,
            requirement,
          };
        })
      : requirements.map((requirement) => {
          const parsed = generatedReading!.chapters.find((chapter) => chapter.outlineChapterId === requirement.outlineChapterId);
          const normalized = normalizeTemplateChapter(state, parsed?.generated ?? null, requirement, parsed?.parseError);
          return { ...normalized, parseError: parsed?.parseError ?? null, requirement };
        });
    let chapters = chapterResults.map((result) => result.chapter);
    let mainIdeaRaw = reusableMainIdea ?? generatedReading?.mainIdea ?? { text: "" };
    if (generatedReading) {
      const firstPassValidChapterCount = chapterResults.filter((result) => !result.structuredIssues.length && !validateChapter(state, result.chapter).length).length;
      const mainIdeaPolicy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120);
      const firstPassMainIdeaCount = wordCount(mainIdeaRaw.text);
      const firstPassMainIdeaValid = firstPassMainIdeaCount >= mainIdeaPolicy.acceptedRange[0] && firstPassMainIdeaCount <= mainIdeaPolicy.acceptedRange[1];
      await recordContentAiUsage(db, courseId, operation, current.writingProvider, idempotencyKey, "candidate", generatedReading.candidateUsage, requirements.length, {
        phase: "candidate_positions",
      });
      await recordContentAiUsage(db, courseId, operation, current.writingProvider, idempotencyKey, "final", generatedReading.usage, requirements.length, {
        validChapterCount: firstPassValidChapterCount,
        mainIdeaValid: firstPassMainIdeaValid,
        firstPassReady: firstPassValidChapterCount === requirements.length && firstPassMainIdeaValid,
      });
    }
    await updateOwnedContent(db, courseId, operation, { chapters, mainIdea: { id: "main-idea", ...mainIdeaRaw, title: mainIdeaTitle } });

    const failed = chapterResults.filter((result) => result.structuredIssues.length || validateChapter(state, result.chapter).length);
    const mainIdeaPolicy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120);
    let mainIdeaCount = wordCount(mainIdeaRaw.text);
    const mainIdeaIssue = mainIdeaCount < mainIdeaPolicy.acceptedRange[0] || mainIdeaCount > mainIdeaPolicy.acceptedRange[1]
      ? `Main Idea 词数应为 ${mainIdeaPolicy.acceptedRange[0]}–${mainIdeaPolicy.acceptedRange[1]}，实际 ${mainIdeaCount}`
      : null;
    if (failed.length || mainIdeaIssue) {
      const phase = failed.length ? "repairing_chapters" : "repairing_main_idea";
      await updateOwnedContent(db, courseId, operation, { phase, chapters: chapters.map((chapter) => ({ ...chapter, validationIssues: validateChapter(state, chapter) })) });
      const chapterDetails = failed.map((item) => `第 ${item.chapter.order} 章（${[...item.structuredIssues.map((issue) => issue.message), ...validateChapter(state, item.chapter)].filter((message, index, all) => all.indexOf(message) === index).join("；")}）`);
      await appendOwnedMessage(db, courseId, operation, { role: "system", content: `检测到 ${[...chapterDetails, ...(mainIdeaIssue ? [mainIdeaIssue.replaceAll("Main Idea", "课后阅读")] : [])].join("；")}。正在一次统一修复全部失败位置。` });
      const repairBundle = await deps.repairReading(state, current.writingProvider, failed.map((item) => ({
        current: item.draft,
        requirements: item.requirement,
        issues: item.structuredIssues.length ? item.structuredIssues : validateChapter(state, item.chapter).map((message) => ({ code: "part_structure" as const, message })),
        parseError: item.parseError,
      })), mainIdeaIssue ? { current: mainIdeaRaw.text ? { text: mainIdeaRaw.text } : null, issues: [mainIdeaIssue] } : undefined);
      await updateOwnedContent(db, courseId, operation, { phase: "validating_chapters" });
      chapterResults = chapterResults.map((result) => {
        if (!failed.some((item) => item.chapter.outlineChapterId === result.chapter.outlineChapterId)) return result;
        const repairs = repairBundle.repairs.filter((repair) => repair.outlineChapterId === result.chapter.outlineChapterId);
        let candidateDraft: GeneratedChapterTemplate | null;
        try {
          const chapterRepair = repairs.find((repair) => repair.kind === "chapter");
          candidateDraft = result.draft
            ? applyChapterTemplateRepairs(result.draft, repairs)
            : chapterRepair?.kind === "chapter" ? chapterRepair.chapter : null;
        } catch {
          candidateDraft = null;
        }
        if (!candidateDraft) return result;
        const candidate = normalizeTemplateChapter(state, candidateDraft, result.requirement);
        const domainIssues = validateChapter(state, candidate.chapter);
        if (!repairFullyResolvesChapter(result.structuredIssues.length ? result.structuredIssues : [{ code: "part_structure", message: "章节未通过" }], candidate.structuredIssues) || domainIssues.length) return result;
        return { ...candidate, parseError: null, requirement: result.requirement };
      });
      const resolvedChapterCount = failed.filter((failedItem) => {
        const result = chapterResults.find((item) => item.chapter.outlineChapterId === failedItem.chapter.outlineChapterId);
        return result && !result.structuredIssues.length && !validateChapter(state, result.chapter).length;
      }).length;
      if (mainIdeaIssue && repairBundle.mainIdea) mainIdeaRaw = repairBundle.mainIdea;
      mainIdeaCount = wordCount(mainIdeaRaw.text);
      await recordContentAiUsage(db, courseId, operation, current.writingProvider, idempotencyKey, "repair", repairBundle.usage, failed.length + (mainIdeaIssue ? 1 : 0), { resolvedChapterCount, mainIdeaResolved: !mainIdeaIssue || (mainIdeaCount >= mainIdeaPolicy.acceptedRange[0] && mainIdeaCount <= mainIdeaPolicy.acceptedRange[1]) });
      chapters = chapterResults.map((result) => result.chapter);
      await updateOwnedContent(db, courseId, operation, { chapters, mainIdea: { id: "main-idea", ...mainIdeaRaw, title: mainIdeaTitle } });
    }

    const remaining = chapterResults.map((result) => ({ ...result.chapter, validationIssues: [...new Set([...result.structuredIssues.map((issue) => issue.message), ...validateChapter(state, result.chapter)])] }));
    await updateOwnedContent(db, courseId, operation, { chapters: remaining });
    if (remaining.some((chapter) => chapter.validationIssues.length)) throw new Error("部分章节一次最小修复后仍未通过校验，请重试失败章节");
    await updateOwnedContent(db, courseId, operation, { phase: "validating_main_idea" });
    if (mainIdeaCount < mainIdeaPolicy.acceptedRange[0] || mainIdeaCount > mainIdeaPolicy.acceptedRange[1]) throw new Error(`课后阅读一次修复后词数仍应为 ${mainIdeaPolicy.acceptedRange[0]}–${mainIdeaPolicy.acceptedRange[1]}，实际 ${mainIdeaCount}`);
    const needsExerciseAi = requiresExerciseAi(state.plan);
    const localExercises = needsExerciseAi ? { chapters: remaining, homework: null } : locallyAssembledExercises(state, remaining);
    await finishOperation(db, courseId, operation, { status: needsExerciseAi ? "reading_ready" : "ready", phase: null, chapters: localExercises.chapters, mainIdea: { id: "main-idea", ...mainIdeaRaw, title: mainIdeaTitle }, homework: localExercises.homework, exercisesStale: false, contentVersion: { increment: 1 }, errorMessage: null }, { status: "succeeded" });
    return getCourseContentState(db, courseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "正文生成失败";
    await failOperation(db, courseId, operation, message, options.regenerate ? current.status : "failed");
    throw error;
  }
  });
}

export async function generateCourseExercises(db: CourseContentDb, courseId: string, idempotencyKey: string, deps: CourseContentGenerationDeps, options: { regenerate?: boolean } = {}) {
  const state = await prerequisite(db, courseId);
  const content = await ensureContent(db, state);
  if (!Array.isArray(content.chapters) || !content.chapters.length || !content.mainIdea) throw new CourseContentPrerequisiteError("请先生成并确认正文");
  const baseRevision = `${sourceRevision(state)}:${content.contentVersion}`;
  const revision = options.regenerate ? `${baseRevision}:regenerate` : baseRevision;
  const operation = await claim(db, courseId, revision, "exercises", idempotencyKey, { status: "generating_exercises", phase: "generating_exercises" });
  if (!operation.claimed) return getCourseContentState(db, courseId);
  return withLease(db, operation.id, async () => {
  try {
    if (!options.regenerate && operation.firstAttempt) {
      await appendOwnedMessage(db, courseId, operation, { role: "teacher", content: "我确认正文与课后阅读，请生成章节与课后练习。" });
    }
    if (!requiresExerciseAi(state.plan)) {
      const localExercises = locallyAssembledExercises(state, content.chapters as CourseContentChapter[]);
      await finishOperation(db, courseId, operation, { status: "ready", phase: null, chapters: localExercises.chapters, homework: localExercises.homework, exercisesStale: false, errorMessage: null }, { status: "succeeded" });
      return getCourseContentState(db, courseId);
    }
    const cleanChapters = (content.chapters as CourseContentChapter[]).map((chapter) => ({
      outlineChapterId: chapter.outlineChapterId,
      title: chapter.title,
      cleanText: chapter.paragraphs.map(buildCleanParagraphText).join(" "),
    }));
    let generated = await deps.generateExercises(state, content.writingProvider, cleanChapters);
    await updateOwnedContent(db, courseId, operation, { phase: "validating_exercises" });
    const keys = pointKeyMap(state);
    const homeworkPlan = state.plan.afterClassPractice;
    for (let round = 0; round <= courseContentSemanticRepairAttempts; round += 1) {
      const failedTargets: Array<{ id: string; label: string; issues: string[] }> = [];
      const chapters = (content.chapters as CourseContentChapter[]).map((chapter) => {
        const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
        if (!plan.chapterPractice.enabled) return { ...chapter, chapterPractice: [] };
        const raw = generated.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)?.questions ?? [];
        const questions = raw.map((question, index) => normalizeQuestion(question, `chapter-practice-${chapter.outlineChapterId}`, index, keys));
        const issues = exerciseQuestionIssues(state.knowledgePoints, plan.knowledgePointIds, plan.chapterPractice.grammar, questions);
        if (issues.length) failedTargets.push({ id: chapter.outlineChapterId, label: `第 ${chapter.order} 章`, issues });
        return { ...chapter, chapterPractice: questions };
      });
      const grammar = homeworkPlan.practice.enabled ? generated.homeworkGrammar.map((question, index) => normalizeQuestion(question, "homework", index, keys)) : [];
      if (homeworkPlan.practice.enabled) {
        const issues = exerciseQuestionIssues(state.knowledgePoints, homeworkPlan.knowledgePointIds, homeworkPlan.practice.grammar, grammar);
        if (issues.length) failedTargets.push({ id: "homework", label: "课后练习", issues });
      }
      if (!failedTargets.length) {
        const homework = homeworkPlan.enabled ? { grammar, vocabularyMatching: homeworkPlan.vocabularyReviewEnabled ? collectVocabularyMatching(chapters) : [] } : null;
        await finishOperation(db, courseId, operation, { status: "ready", phase: null, chapters, homework, exercisesStale: false, contentVersion: { increment: 1 }, errorMessage: null }, { status: "succeeded" });
        return getCourseContentState(db, courseId);
      }
      if (round === courseContentSemanticRepairAttempts) throw new Error(`练习一次修复后仍未通过：${failedTargets.map((target) => `${target.label}（${target.issues.join("；")}）`).join("；")}`);
      await updateOwnedContent(db, courseId, operation, { phase: "repairing_chapters" });
      await appendOwnedMessage(db, courseId, operation, { role: "system", content: `检测到 ${failedTargets.length} 个练习区域需要修复：${failedTargets.map((target) => `${target.label}（${target.issues.join("；")}）`).join("；")}。正在统一修复。` });
      const repaired = await deps.repairExercises(state, content.writingProvider, failedTargets, generated, cleanChapters);
      await updateOwnedContent(db, courseId, operation, { phase: "validating_exercises" });
      const repairedIds = new Set(repaired.chapters.map((item) => item.outlineChapterId));
      generated = {
        chapters: [...generated.chapters.filter((item) => !repairedIds.has(item.outlineChapterId)), ...repaired.chapters],
        homeworkGrammar: failedTargets.some((target) => target.id === "homework") && repaired.homeworkGrammar.length ? repaired.homeworkGrammar : generated.homeworkGrammar,
      };
    }
    throw new Error("练习生成未完成");
  } catch (error) {
    const message = error instanceof Error ? error.message : "练习生成失败";
    await failOperation(db, courseId, operation, message, options.regenerate ? content.status : "reading_ready");
    throw error;
  }
  });
}

export async function confirmCourseContent(db: CourseContentDb, courseId: string) {
  const state = await prerequisite(db, courseId);
  const content = await ensureContent(db, state);
  if (content.status !== "ready") throw new CourseContentPrerequisiteError("请先完成正文和练习生成");
  if (content.activeGenerationId) throw new CourseContentConflictError("当前内容仍在处理，请等待完成后再确认");
  await inTransaction(db, async (tx) => {
    await tx.courseLessonContent.update!({ where: { courseId }, data: { status: "confirmed", confirmedAt: new Date() } });
    await tx.course.update({
      where: { id: courseId },
      data: {
        currentStage: furthestCourseStage(state.course.currentStage, "visual_resources"),
        staleFromStage: staleStageAfterConfirming(state.course.staleFromStage, "content", state.course.currentStage),
      },
    });
  });
  return getCourseContentState(db, courseId);
}

function normalizeModifiedParts(state: TeachingPlanState, outlineChapterId: string, paragraphId: string, modification: GeneratedModification) {
  const keys = pointKeyMap(state);
  const parts = modification.paragraph?.parts ?? [];
  return parts.map((part, index): CourseContentPart => {
    if (part.type === "text") return part;
    const id = `${part.type}-${paragraphId}-${index + 1}`;
    if (part.type === "vocabulary") return { ...part, id };
    if (part.exerciseType === "optionCloze") return { type: "grammar", id, exerciseType: part.exerciseType, knowledgePointId: keys.get(part.knowledgePointKey) ?? part.knowledgePointKey, answer: part.answer, options: stableShuffle([part.answer, ...part.distractors], id) };
    return { type: "grammar", id, exerciseType: part.exerciseType, knowledgePointId: keys.get(part.knowledgePointKey) ?? part.knowledgePointKey, answer: part.answer, baseForm: part.baseForm };
  });
}

function parseExercisePageTarget(targetId: string) {
  const [ownerId, type, rawPage] = targetId.split("|");
  const page = Number(rawPage);
  if (!ownerId || (type !== "optionCloze" && type !== "wordForm") || !Number.isInteger(page) || page < 0) return null;
  return { ownerId, type, page } as const;
}

function exercisePage(questions: CourseGrammarQuestion[], type: "optionCloze" | "wordForm", page: number) {
  return paginateBalanced(questions.filter((question) => question.type === type), courseContentQuestionPageSize)[page] ?? null;
}

function replaceExercisePage(questions: CourseGrammarQuestion[], currentPage: CourseGrammarQuestion[], replacements: CourseGrammarQuestion[]) {
  const byId = new Map(currentPage.map((question, index) => [question.id, { ...replacements[index], id: question.id }]));
  return questions.map((question) => byId.get(question.id) ?? question);
}

export async function modifyCourseContent(db: CourseContentDb, courseId: string, input: { targetType: "chapter" | "paragraph" | "chapter_practice" | "main_idea" | "homework"; targetId: string; instruction: string }, idempotencyKey: string, deps: CourseContentGenerationDeps) {
  const state = await prerequisite(db, courseId);
  const content = await ensureContent(db, state);
  const revision = createHash("sha256").update(`${sourceRevision(state)}:${content.contentVersion}:${input.targetType}:${input.targetId}:${input.instruction}`).digest("hex");
  const operation = await claim(db, courseId, revision, "modify", idempotencyKey);
  if (!operation.claimed) return getCourseContentState(db, courseId);
  return withLease(db, operation.id, async () => {
  try {
  const chapters = structuredClone(content.chapters as CourseContentChapter[]);
  const pageTarget = parseExercisePageTarget(input.targetId);
  const chapter = chapters.find((item) => item.id === (pageTarget?.ownerId ?? input.targetId) || item.outlineChapterId === input.targetId || item.paragraphs.some((paragraph) => paragraph.id === input.targetId));
  let target: unknown;
  let constraints: unknown;
  let relatedContext: Record<string, unknown> = {};
  if (input.targetType === "chapter" && chapter) {
    target = { outlineChapterId: chapter.outlineChapterId, paragraphs: chapter.paragraphs.map((paragraph) => ({ parts: buildPromptParts(state, paragraph.parts) })) };
    const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
    constraints = { targetWordCount: plan.targetWordCount, paragraphCount: plan.paragraphCount, grammarPoints: promptPoints(state, plan.knowledgePointIds), exerciseCounts: { ...plan.readingExercises.grammar, vocabulary: plan.readingExercises.vocabulary.chineseHint } };
    relatedContext = { chapterTitle: chapter.title, storySummary: state.outline.summary, surroundingContext: state.outline.chapters.map(({ id, order, title, summary }) => ({ id, order, title, summary })) };
  }
  else if (input.targetType === "paragraph" && chapter) {
    const paragraphIndex = chapter.paragraphs.findIndex((item) => item.id === input.targetId);
    const paragraph = chapter.paragraphs[paragraphIndex];
    target = paragraph ? { parts: buildPromptParts(state, paragraph.parts) } : null;
    const promptPartAnchors = paragraph ? buildPromptParts(state, paragraph.parts).filter((part) => part.type !== "text") : [];
    constraints = { preserveExerciseAnchors: promptPartAnchors.map((part) => part.type === "grammar" ? { type: part.type, exerciseType: part.exerciseType, knowledgePointKey: part.knowledgePointKey } : { type: part.type }) };
    relatedContext = {
      chapterTitle: chapter.title,
      chapterSummary: state.outline.chapters.find((item) => item.id === chapter.outlineChapterId)?.summary,
      previousParagraph: paragraphIndex > 0 ? buildCleanParagraphText(chapter.paragraphs[paragraphIndex - 1]) : null,
      nextParagraph: paragraphIndex >= 0 && paragraphIndex < chapter.paragraphs.length - 1 ? buildCleanParagraphText(chapter.paragraphs[paragraphIndex + 1]) : null,
      grammarPoints: promptPoints(state, state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)?.knowledgePointIds ?? []),
    };
  }
  else if (input.targetType === "chapter_practice" && chapter && pageTarget) {
    const currentPage = exercisePage(chapter.chapterPractice, pageTarget.type, pageTarget.page);
    target = currentPage ? buildPromptQuestions(state, currentPage) : null;
    const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
    constraints = { counts: plan.chapterPractice.grammar, pageType: pageTarget.type, pageSize: Array.isArray(target) ? target.length : 0, grammarPoints: promptPoints(state, plan.knowledgePointIds), preserveKnowledgePointPerQuestion: true };
    relatedContext = { chapterText: chapter.paragraphs.map(buildCleanParagraphText).join(" ") };
  }
  else if (input.targetType === "main_idea") { const policy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120); target = content.mainIdea && typeof content.mainIdea === "object" ? { text: Reflect.get(content.mainIdea, "text") } : null; constraints = { wordCount: policy.acceptedRange, targetWordCount: policy.targetWordCount, pureReading: true }; }
  else if (pageTarget) { const grammar = (content.homework as CourseContentState["homework"])?.grammar ?? []; const currentPage = exercisePage(grammar, pageTarget.type, pageTarget.page); target = currentPage ? buildPromptQuestions(state, currentPage) : null; constraints = { counts: state.plan.afterClassPractice.practice.grammar, pageType: pageTarget.type, pageSize: currentPage?.length ?? 0, grammarPoints: promptPoints(state, state.plan.afterClassPractice.knowledgePointIds), preserveKnowledgePointPerQuestion: true }; relatedContext = { englishLevel: state.course.englishLevel }; }
  if (input.targetType === "main_idea") relatedContext = { cleanChapters: chapters.map((item) => ({ id: item.outlineChapterId, title: item.title, cleanText: item.paragraphs.map(buildCleanParagraphText).join(" ") })) };
  if (!target) throw new CourseContentPrerequisiteError("未找到要修改的内容区域");

  await appendOwnedMessage(db, courseId, operation, { role: "teacher", content: input.instruction, targetType: input.targetType, targetId: input.targetId });
  relatedContext = { englishLevel: state.course.englishLevel, ...relatedContext };
  const result = await deps.modifyContent(content.writingProvider, input.targetType, target, input.instruction, constraints, relatedContext);
  if (result.kind !== input.targetType) throw new Error("修改结果与指定范围不一致，原内容已保留");

  if (input.targetType === "paragraph" && chapter && result.paragraph) {
    const paragraph = chapter.paragraphs.find((item) => item.id === input.targetId)!;
    const next = { ...paragraph, parts: normalizeModifiedParts(state, chapter.outlineChapterId, paragraph.id, result) };
    const issues = validateParagraphParts(next);
    const anchorSignature = (parts: CourseContentPart[]) => parts.filter((part) => part.type !== "text").map((part) => part.type === "grammar" ? `grammar:${part.exerciseType}:${part.knowledgePointId}` : "vocabulary");
    if (anchorSignature(paragraph.parts).join("|") !== anchorSignature(next.parts).join("|")) issues.push("正文分页修改必须保留原题型、题量和语法知识点映射");
    if (issues.length) throw new Error(`段落修改未通过校验：${issues.join("；")}`);
    chapter.paragraphs = chapter.paragraphs.map((item) => item.id === paragraph.id ? next : item);
  } else if (input.targetType === "chapter" && chapter && result.chapter) {
    const normalized = normalizeModifiedChapter(state, result.chapter);
    const issues = validateChapter(state, normalized);
    if (issues.length) throw new Error(`章节修改未通过校验：${issues.join("；")}`);
    chapters.splice(chapters.indexOf(chapter), 1, { ...normalized, chapterPractice: chapter.chapterPractice });
  } else if (input.targetType === "chapter_practice" && chapter && pageTarget && result.questions) {
    const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
    const currentPage = exercisePage(chapter.chapterPractice, pageTarget.type, pageTarget.page)!;
    const replacements = result.questions.map((question, index) => normalizeQuestion(question, `chapter-practice-${chapter.outlineChapterId}-page-${pageTarget.page}`, index, pointKeyMap(state)));
    if (replacements.length !== currentPage.length || replacements.some((question, index) => question.type !== currentPage[index].type || question.knowledgePointId !== currentPage[index].knowledgePointId)) throw new Error("章节练习分页修改必须保留原题型、题量和知识点映射");
    const questions = replaceExercisePage(chapter.chapterPractice, currentPage, replacements);
    const issues = exerciseQuestionIssues(state.knowledgePoints, plan.knowledgePointIds, plan.chapterPractice.grammar, questions);
    if (issues.length) throw new Error(`章节练习修改未通过校验：${issues.join("；")}`);
    chapter.chapterPractice = questions;
  } else if (input.targetType === "main_idea" && result.mainIdea) {
    const count = wordCount(result.mainIdea.text);
    const policy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120);
    if (count < policy.acceptedRange[0] || count > policy.acceptedRange[1]) throw new Error(`课后阅读修改后词数应为 ${policy.acceptedRange[0]}–${policy.acceptedRange[1]}，实际 ${count}`);
  } else if (input.targetType === "homework" && pageTarget && result.questions) {
    const homework = content.homework as NonNullable<CourseContentState["homework"]>;
    const currentPage = exercisePage(homework.grammar, pageTarget.type, pageTarget.page)!;
    const replacements = result.questions.map((question, index) => normalizeQuestion(question, `homework-page-${pageTarget.page}`, index, pointKeyMap(state)));
    if (replacements.length !== currentPage.length || replacements.some((question, index) => question.type !== currentPage[index].type || question.knowledgePointId !== currentPage[index].knowledgePointId)) throw new Error("课后练习分页修改必须保留原题型、题量和知识点映射");
    const grammar = replaceExercisePage(homework.grammar, currentPage, replacements);
    const issues = exerciseQuestionIssues(state.knowledgePoints, state.plan.afterClassPractice.knowledgePointIds, state.plan.afterClassPractice.practice.grammar, grammar);
    if (issues.length) throw new Error(`课后练习修改未通过校验：${issues.join("；")}`);
    content.homework = { ...homework, grammar };
  } else throw new Error("修改结果缺少目标内容，原内容已保留");

  const data: Record<string, unknown> = { contentVersion: { increment: 1 }, errorMessage: null };
  if (["chapter", "paragraph", "chapter_practice"].includes(input.targetType)) data.chapters = chapters;
  if (input.targetType === "main_idea") data.mainIdea = { id: "main-idea", title: mainIdeaTitle, ...result.mainIdea };
  if (input.targetType === "homework") data.homework = content.homework;
  if (["chapter", "paragraph"].includes(input.targetType) && content.homework) data.exercisesStale = true;
  await finishOperation(db, courseId, operation, data, { status: "succeeded" }, async (tx) => {
    await tx.courseContentChatMessage.create!({ data: { courseId, role: "assistant", content: "已按指定范围完成修改并通过校验，其他内容未变。", targetType: input.targetType, targetId: input.targetId } });
  });
  return getCourseContentState(db, courseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "内容修改失败；原内容已保留";
    await failOperation(db, courseId, operation, message, content.status);
    throw error;
  }
  });
}
