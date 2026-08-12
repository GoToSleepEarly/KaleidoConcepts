import { createHash } from "node:crypto";

import type { CourseContentChapter, CourseContentPart, CourseContentPhase, CourseContentState, CourseContentStatus, CourseGrammarQuestion, StoryWritingProvider, TeachingPlanState } from "@/lib/contracts/api";
import { buildCleanParagraphText, collectVocabularyMatching, courseContentQuestionPageSize, paginateBalanced, stableShuffle, validateGrammarCoverage, validateParagraphParts, wordFormQuestionIssue } from "@/lib/domain/course-content";
import { readingPageCount } from "@/lib/domain/teaching-plan-policy";
import { mainIdeaWordCountPolicy, type CourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { getTeachingPlanState, type TeachingPlanDb } from "@/lib/server/repositories/teaching-plan";
import type { GeneratedModification, GeneratedQuestion, GeneratedReading } from "@/lib/server/validation/course-content";

type ContentRecord = {
  id: string; courseId: string; status: CourseContentStatus; phase: CourseContentPhase; writingProvider: StoryWritingProvider;
  sourceRevision: string; contentVersion: number; chapters: unknown; mainIdea: unknown; homework: unknown; exercisesStale: boolean;
  errorMessage: string | null; updatedAt: Date;
};
type GenerationRecord = { id: string; status: "running" | "succeeded" | "failed" | "result_unknown" };
type MessageRecord = { id: string; role: "teacher" | "assistant" | "system"; content: string; createdAt: Date };
type PromptPersonRecord = { role: "teacher" | "student"; chineseNameSnapshot: string; englishNameSnapshot: string };
type Delegate<T> = {
  findUnique: (query: Record<string, unknown>) => Promise<T | null>;
  findMany?: (query: Record<string, unknown>) => Promise<T[]>;
  upsert?: (query: Record<string, unknown>) => Promise<T>;
  create?: (query: Record<string, unknown>) => Promise<T>;
  update?: (query: Record<string, unknown>) => Promise<T>;
  deleteMany?: (query: Record<string, unknown>) => Promise<{ count: number }>;
};

export type CourseContentDb = TeachingPlanDb & {
  courseLessonContent: Delegate<ContentRecord>;
  courseContentGeneration: Delegate<GenerationRecord>;
  courseContentChatMessage: Delegate<MessageRecord>;
  coursePerson?: Required<Pick<Delegate<PromptPersonRecord>, "findMany">>;
};

export class CourseContentNotFoundError extends Error { constructor(message = "课程不存在") { super(message); this.name = "CourseContentNotFoundError"; } }
export class CourseContentPrerequisiteError extends Error { constructor(message = "请先确认教学规划") { super(message); this.name = "CourseContentPrerequisiteError"; } }
export class CourseContentConflictError extends Error { constructor(message = "已有相同内容正在生成，请勿重复提交") { super(message); this.name = "CourseContentConflictError"; } }

function sourceRevision(input: TeachingPlanState) {
  return createHash("sha256").update(JSON.stringify({ outline: input.outline, plan: input.plan })).digest("hex");
}

function wordCount(text: string) { return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length; }

export function requiresExerciseAi(plan: TeachingPlanState["plan"]) {
  const hasQuestions = (grammar: { optionCloze: number; wordForm: number }) => grammar.optionCloze > 0 || grammar.wordForm > 0;
  return plan.chapters.some((chapter) => chapter.chapterPractice.enabled && hasQuestions(chapter.chapterPractice.grammar))
    || (plan.afterClassPractice.enabled && hasQuestions(plan.afterClassPractice.practice.grammar));
}

function locallyAssembledExercises(state: TeachingPlanState, chapters: CourseContentChapter[]) {
  const normalizedChapters = chapters.map((chapter) => ({ ...chapter, chapterPractice: [] }));
  const homework = state.plan.afterClassPractice.enabled
    ? { grammar: [], vocabularyMatching: collectVocabularyMatching(normalizedChapters) }
    : null;
  return { chapters: normalizedChapters, homework };
}

function pointKeyMap(state: TeachingPlanState) {
  return new Map(state.knowledgePoints.map((point, index) => [`KP${index + 1}`, point.id]));
}

function promptPoints(state: TeachingPlanState, ids: string[]) {
  const keys = new Map(state.knowledgePoints.map((point, index) => [point.id, { key: `KP${index + 1}`, label: point.label }]));
  return ids.map((id) => keys.get(id)).filter((point): point is { key: string; label: string } => Boolean(point));
}

function knowledgePointLabels(knowledgePoints: Array<{ id: string; label: string }>, ids: string[]) {
  const labels = new Map(knowledgePoints.map((point) => [point.id, point.label]));
  const known = ids.map((id) => labels.get(id)).filter((label): label is string => Boolean(label));
  const unknownCount = ids.length - known.length;
  return [...known, ...(unknownCount ? [`未识别知识点 ${unknownCount} 个`] : [])];
}

function normalizeReading(state: TeachingPlanState, generated: GeneratedReading): CourseContentChapter[] {
  const keyMap = pointKeyMap(state);
  return state.outline.chapters.map((outlineChapter, chapterIndex) => {
    const generatedChapter = generated.chapters.find((chapter) => chapter.outlineChapterId === outlineChapter.id) ?? generated.chapters[chapterIndex];
    const planChapter = state.plan.chapters.find((chapter) => chapter.outlineChapterId === outlineChapter.id)!;
    return {
      id: `chapter-${outlineChapter.id}`,
      outlineChapterId: outlineChapter.id,
      order: outlineChapter.order,
      title: outlineChapter.title,
      targetWordCount: planChapter.targetWordCount ?? 90,
      readingExerciseMode: planChapter.readingExerciseMode,
      paragraphs: (generatedChapter?.paragraphs ?? []).map((paragraph, paragraphIndex) => ({
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
  });
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
  const tolerance = Math.max(10, Math.round(chapter.targetWordCount * 0.12));
  if (Math.abs(actualWords - chapter.targetWordCount) > tolerance) issues.push(`正文词数目标 ${chapter.targetWordCount}，实际 ${actualWords}`);
  const expectedPages = readingPageCount(plan.targetWordCount ?? 90, plan.readingExercises, plan.paragraphCount);
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
  const invalidWordForms = questions.map(wordFormQuestionIssue).filter((issue) => issue !== null);
  if (invalidWordForms.length) issues.push(...new Set(invalidWordForms));
  return issues;
}

async function prerequisite(db: CourseContentDb, courseId: string) {
  const state = await getTeachingPlanState(db, courseId);
  if (state.plan.status !== "confirmed") throw new CourseContentPrerequisiteError();
  const people = db.coursePerson?.findMany ? await db.coursePerson.findMany({ where: { courseId }, orderBy: { role: "asc" } }) : [];
  return {
    ...state,
    promptPeople: people.map((person) => ({ role: person.role, chineseName: person.chineseNameSnapshot, englishName: person.englishNameSnapshot })),
  };
}

async function ensureContent(db: CourseContentDb, state: TeachingPlanState) {
  const existing = await db.courseLessonContent.findUnique({ where: { courseId: state.course.id } });
  if (existing) return existing;
  return db.courseLessonContent.upsert!({ where: { courseId: state.course.id }, create: { courseId: state.course.id, sourceRevision: sourceRevision(state) }, update: {} });
}

function toState(state: TeachingPlanState, content: ContentRecord, messages: MessageRecord[]): CourseContentState {
  return {
    course: { id: state.course.id, title: state.course.title, currentStage: state.course.currentStage, englishLevel: state.course.englishLevel! },
    knowledgePoints: state.knowledgePoints.map(({ id, label }) => ({ id, label })),
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
    messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.toISOString() })),
    errorMessage: content.errorMessage,
    updatedAt: content.updatedAt?.toISOString() ?? null,
  };
}

export async function getCourseContentState(db: CourseContentDb, courseId: string) {
  const state = await prerequisite(db, courseId);
  const [content, messages] = await Promise.all([ensureContent(db, state), db.courseContentChatMessage.findMany!({ where: { courseId }, orderBy: { createdAt: "asc" } })]);
  return toState(state, content, messages);
}

export async function updateCourseContentProvider(db: CourseContentDb, courseId: string, writingProvider: StoryWritingProvider) {
  const state = await prerequisite(db, courseId);
  await ensureContent(db, state);
  await db.courseLessonContent.update!({ where: { courseId }, data: { writingProvider } });
  return getCourseContentState(db, courseId);
}

export async function resetCourseContent(db: CourseContentDb, courseId: string) {
  await prerequisite(db, courseId);
  const reset = async (tx: CourseContentDb) => {
    if (!tx.courseContentChatMessage.deleteMany || !tx.courseContentGeneration.deleteMany || !tx.courseLessonContent.deleteMany) {
      throw new Error("当前数据库不支持重置 Step 4");
    }
    await tx.courseContentChatMessage.deleteMany({ where: { courseId } });
    await tx.courseContentGeneration.deleteMany({ where: { courseId } });
    await tx.courseLessonContent.deleteMany({ where: { courseId } });
    await tx.course.update({ where: { id: courseId }, data: { currentStage: "content" } });
    return getCourseContentState(tx, courseId);
  };
  return db.$transaction ? db.$transaction((tx) => reset(tx as CourseContentDb)) : reset(db);
}

async function claim(db: CourseContentDb, courseId: string, revision: string, operation: "reading" | "exercises" | "modify", idempotencyKey: string) {
  const prior = await db.courseContentGeneration.findUnique({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation } } });
  if (prior?.status === "succeeded") return false;
  if (prior?.status === "running") throw new CourseContentConflictError();
  if (prior) await db.courseContentGeneration.update!({ where: { id: prior.id }, data: { status: "running", idempotencyKey, attempt: { increment: 1 }, errorMessage: null } });
  else await db.courseContentGeneration.create!({ data: { courseId, sourceRevision: revision, operation, idempotencyKey } });
  return true;
}

export async function generateCourseReading(db: CourseContentDb, courseId: string, idempotencyKey: string, deps: CourseContentGenerationDeps, options: { regenerate?: boolean } = {}) {
  const state = await prerequisite(db, courseId);
  const current = await ensureContent(db, state);
  const baseRevision = sourceRevision(state);
  const revision = options.regenerate ? `${baseRevision}:regenerate:${current.contentVersion + 1}` : baseRevision;
  if (!(await claim(db, courseId, revision, "reading", idempotencyKey))) return getCourseContentState(db, courseId);
  await db.courseLessonContent.update!({ where: { courseId }, data: { status: "generating_reading", phase: "generating_chapters", sourceRevision: baseRevision, errorMessage: null } });
  try {
    const reusableChapters = !options.regenerate && current.status === "failed" && Array.isArray(current.chapters) && current.chapters.length
      ? structuredClone(current.chapters as CourseContentChapter[])
      : null;
    const reusableMainIdea = !options.regenerate && current.status === "failed" && current.mainIdea
      ? structuredClone(current.mainIdea as { title: string; text: string })
      : null;
    const generatedReading = reusableChapters && reusableMainIdea ? null : await deps.generateReading(state, current.writingProvider);
    await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_chapters" } });
    let chapters = reusableChapters ?? normalizeReading(state, generatedReading!);
    let mainIdeaRaw = reusableMainIdea ?? generatedReading!.mainIdea;
    await db.courseLessonContent.update!({ where: { courseId }, data: { chapters, mainIdea: { id: "main-idea", ...mainIdeaRaw } } });
    for (let round = 0; round < 2; round += 1) {
      const failed = chapters.map((chapter) => ({ chapter, issues: validateChapter(state, chapter) })).filter((item) => item.issues.length);
      if (!failed.length) break;
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "repairing_chapters", chapters: chapters.map((chapter) => ({ ...chapter, validationIssues: validateChapter(state, chapter) })) } });
      await db.courseContentChatMessage.create!({ data: { courseId, role: "system", content: `检测到 ${failed.length} 个章节需要修复：${failed.map((item) => `第 ${item.chapter.order} 章（${item.issues.join("；")}）`).join("；")}。正在统一修复。` } });
      const repaired = normalizeReading(state, await deps.repairReading(state, current.writingProvider, failed.map((item) => item.chapter), failed.map((item) => item.issues)));
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_chapters" } });
      const repairedById = new Map(repaired.filter((chapter) => failed.some((item) => item.chapter.outlineChapterId === chapter.outlineChapterId)).map((chapter) => [chapter.outlineChapterId, chapter]));
      chapters = chapters.map((chapter) => repairedById.get(chapter.outlineChapterId) ?? chapter);
      await db.courseLessonContent.update!({ where: { courseId }, data: { chapters } });
    }
    const remaining = chapters.map((chapter) => ({ ...chapter, validationIssues: validateChapter(state, chapter) }));
    await db.courseLessonContent.update!({ where: { courseId }, data: { chapters: remaining } });
    if (remaining.some((chapter) => chapter.validationIssues.length)) throw new Error("部分章节连续两次修复后仍未通过校验，请重试失败章节");
    await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_main_idea" } });
    const mainIdeaPolicy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120);
    let mainIdeaCount = wordCount(mainIdeaRaw.text);
    for (let round = 0; (mainIdeaCount < mainIdeaPolicy.acceptedRange[0] || mainIdeaCount > mainIdeaPolicy.acceptedRange[1]) && round < 2; round += 1) {
      const issue = `Main Idea 词数应为 ${mainIdeaPolicy.acceptedRange[0]}–${mainIdeaPolicy.acceptedRange[1]}，实际 ${mainIdeaCount}`;
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "repairing_main_idea" } });
      await db.courseContentChatMessage.create!({ data: { courseId, role: "system", content: `检测到 Main Idea 需要修复：${issue}。正在单独修复 Main Idea。` } });
      mainIdeaRaw = await deps.repairMainIdea(current.writingProvider, mainIdeaRaw, [issue], mainIdeaPolicy.targetWordCount);
      mainIdeaCount = wordCount(mainIdeaRaw.text);
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_main_idea", mainIdea: { id: "main-idea", ...mainIdeaRaw } } });
    }
    if (mainIdeaCount < mainIdeaPolicy.acceptedRange[0] || mainIdeaCount > mainIdeaPolicy.acceptedRange[1]) throw new Error(`Main Idea 连续两次修复后词数仍应为 ${mainIdeaPolicy.acceptedRange[0]}–${mainIdeaPolicy.acceptedRange[1]}，实际 ${mainIdeaCount}`);
    const needsExerciseAi = requiresExerciseAi(state.plan);
    const localExercises = needsExerciseAi ? { chapters: remaining, homework: null } : locallyAssembledExercises(state, remaining);
    await db.courseLessonContent.update!({ where: { courseId }, data: { status: needsExerciseAi ? "reading_ready" : "ready", phase: null, chapters: localExercises.chapters, mainIdea: { id: "main-idea", ...mainIdeaRaw }, homework: localExercises.homework, exercisesStale: false, contentVersion: { increment: 1 } } });
    await db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "reading" } }, data: { status: "succeeded" } });
    return getCourseContentState(db, courseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "正文生成失败";
    await Promise.all([
      db.courseLessonContent.update!({ where: { courseId }, data: { status: options.regenerate ? current.status : "failed", phase: null, errorMessage: message } }),
      db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "reading" } }, data: { status: "failed", errorMessage: message } }),
    ]);
    throw error;
  }
}

export async function generateCourseExercises(db: CourseContentDb, courseId: string, idempotencyKey: string, deps: CourseContentGenerationDeps, options: { regenerate?: boolean } = {}) {
  const state = await prerequisite(db, courseId);
  const content = await ensureContent(db, state);
  if (!Array.isArray(content.chapters) || !content.chapters.length || !content.mainIdea) throw new CourseContentPrerequisiteError("请先生成并确认正文");
  if (!requiresExerciseAi(state.plan)) {
    const localExercises = locallyAssembledExercises(state, content.chapters as CourseContentChapter[]);
    await db.courseLessonContent.update!({ where: { courseId }, data: { status: "ready", phase: null, chapters: localExercises.chapters, homework: localExercises.homework, exercisesStale: false, errorMessage: null } });
    return getCourseContentState(db, courseId);
  }
  const baseRevision = `${sourceRevision(state)}:${content.contentVersion}`;
  const revision = options.regenerate ? `${baseRevision}:regenerate` : baseRevision;
  if (!(await claim(db, courseId, revision, "exercises", idempotencyKey))) return getCourseContentState(db, courseId);
  await db.courseLessonContent.update!({ where: { courseId }, data: { status: "generating_exercises", phase: "generating_exercises", errorMessage: null } });
  try {
    const cleanChapters = (content.chapters as CourseContentChapter[]).map((chapter) => ({
      outlineChapterId: chapter.outlineChapterId,
      title: chapter.title,
      cleanText: chapter.paragraphs.map(buildCleanParagraphText).join(" "),
    }));
    let generated = await deps.generateExercises(state, content.writingProvider, cleanChapters);
    await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_exercises" } });
    const keys = pointKeyMap(state);
    const homeworkPlan = state.plan.afterClassPractice;
    for (let round = 0; round <= 2; round += 1) {
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
      const grammar = homeworkPlan.enabled ? generated.homeworkGrammar.map((question, index) => normalizeQuestion(question, "homework", index, keys)) : [];
      if (homeworkPlan.enabled) {
        const issues = exerciseQuestionIssues(state.knowledgePoints, homeworkPlan.knowledgePointIds, homeworkPlan.practice.grammar, grammar);
        if (issues.length) failedTargets.push({ id: "homework", label: "课后练习", issues });
      }
      if (!failedTargets.length) {
        const homework = homeworkPlan.enabled ? { grammar, vocabularyMatching: collectVocabularyMatching(chapters) } : null;
        await db.courseLessonContent.update!({ where: { courseId }, data: { status: "ready", phase: null, chapters, homework, exercisesStale: false, contentVersion: { increment: 1 } } });
        await db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "exercises" } }, data: { status: "succeeded" } });
        return getCourseContentState(db, courseId);
      }
      if (round === 2) throw new Error(`练习连续两次修复后仍未通过：${failedTargets.map((target) => `${target.label}（${target.issues.join("；")}）`).join("；")}`);
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "repairing_chapters" } });
      await db.courseContentChatMessage.create!({ data: { courseId, role: "system", content: `检测到 ${failedTargets.length} 个练习区域需要修复：${failedTargets.map((target) => `${target.label}（${target.issues.join("；")}）`).join("；")}。正在统一修复。` } });
      const repaired = await deps.repairExercises(state, content.writingProvider, failedTargets, generated, cleanChapters);
      await db.courseLessonContent.update!({ where: { courseId }, data: { phase: "validating_exercises" } });
      const repairedIds = new Set(repaired.chapters.map((item) => item.outlineChapterId));
      generated = {
        chapters: [...generated.chapters.filter((item) => !repairedIds.has(item.outlineChapterId)), ...repaired.chapters],
        homeworkGrammar: failedTargets.some((target) => target.id === "homework") && repaired.homeworkGrammar.length ? repaired.homeworkGrammar : generated.homeworkGrammar,
      };
    }
    throw new Error("练习生成未完成");
  } catch (error) {
    const message = error instanceof Error ? error.message : "练习生成失败";
    await Promise.all([
      db.courseLessonContent.update!({ where: { courseId }, data: { status: options.regenerate ? content.status : "reading_ready", phase: null, errorMessage: message } }),
      db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "exercises" } }, data: { status: "failed", errorMessage: message } }),
    ]);
    throw error;
  }
}

export async function confirmCourseContent(db: CourseContentDb, courseId: string) {
  const state = await prerequisite(db, courseId);
  const content = await ensureContent(db, state);
  if (content.status !== "ready") throw new CourseContentPrerequisiteError("请先完成正文和练习生成");
  await Promise.all([
    db.courseLessonContent.update!({ where: { courseId }, data: { status: "confirmed", confirmedAt: new Date() } }),
    db.course.update({ where: { id: courseId }, data: { currentStage: "visual_resources" } }),
  ]);
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
  if (!(await claim(db, courseId, revision, "modify", idempotencyKey))) return getCourseContentState(db, courseId);
  try {
  const chapters = structuredClone(content.chapters as CourseContentChapter[]);
  const pageTarget = parseExercisePageTarget(input.targetId);
  const chapter = chapters.find((item) => item.id === (pageTarget?.ownerId ?? input.targetId) || item.outlineChapterId === input.targetId || item.paragraphs.some((paragraph) => paragraph.id === input.targetId));
  let target: unknown;
  let constraints: unknown;
  let relatedContext: Record<string, unknown> = {};
  if (input.targetType === "chapter" && chapter) {
    target = { outlineChapterId: chapter.outlineChapterId, title: chapter.title, paragraphs: chapter.paragraphs };
    const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
    constraints = { targetWordCount: plan.targetWordCount, paragraphCount: plan.paragraphCount, grammarPoints: promptPoints(state, plan.knowledgePointIds), exerciseCounts: { ...plan.readingExercises.grammar, vocabulary: plan.readingExercises.vocabulary.chineseHint } };
    relatedContext = { surroundingContext: state.outline.chapters.map(({ id, order, title, summary }) => ({ id, order, title, summary })) };
  }
  else if (input.targetType === "paragraph" && chapter) {
    target = chapter.paragraphs.find((item) => item.id === input.targetId);
    constraints = { preserveExerciseAnchors: (target as CourseContentChapter["paragraphs"][number] | undefined)?.parts.filter((part) => part.type !== "text").map((part) => part.type === "grammar" ? { type: part.type, exerciseType: part.exerciseType, knowledgePointId: part.knowledgePointId } : { type: part.type }) };
    relatedContext = { chapterText: chapter.paragraphs.map(buildCleanParagraphText).join(" "), grammarPoints: promptPoints(state, state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)?.knowledgePointIds ?? []) };
  }
  else if (input.targetType === "chapter_practice" && chapter && pageTarget) {
    target = exercisePage(chapter.chapterPractice, pageTarget.type, pageTarget.page);
    const plan = state.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
    constraints = { counts: plan.chapterPractice.grammar, pageType: pageTarget.type, pageSize: Array.isArray(target) ? target.length : 0, grammarPoints: promptPoints(state, plan.knowledgePointIds), preserveKnowledgePointPerQuestion: true };
    relatedContext = { chapterText: chapter.paragraphs.map(buildCleanParagraphText).join(" ") };
  }
  else if (input.targetType === "main_idea") { const policy = mainIdeaWordCountPolicy(state.plan.mainIdeaTargetWordCount ?? 120); target = content.mainIdea; constraints = { wordCount: policy.acceptedRange, targetWordCount: policy.targetWordCount, pureReading: true }; }
  else if (pageTarget) { const grammar = (content.homework as CourseContentState["homework"])?.grammar ?? []; target = exercisePage(grammar, pageTarget.type, pageTarget.page); constraints = { counts: state.plan.afterClassPractice.practice.grammar, pageType: pageTarget.type, pageSize: Array.isArray(target) ? target.length : 0, grammarPoints: promptPoints(state, state.plan.afterClassPractice.knowledgePointIds), preserveKnowledgePointPerQuestion: true }; relatedContext = { englishLevel: state.course.englishLevel }; }
  if (input.targetType === "main_idea") relatedContext = { cleanChapters: chapters.map((item) => ({ id: item.outlineChapterId, title: item.title, cleanText: item.paragraphs.map(buildCleanParagraphText).join(" ") })) };
  if (!target) throw new CourseContentPrerequisiteError("未找到要修改的内容区域");

  await db.courseContentChatMessage.create!({ data: { courseId, role: "teacher", content: input.instruction, targetType: input.targetType, targetId: input.targetId } });
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
    const normalized = normalizeReading(state, { chapters: [result.chapter] }).find((item) => item.outlineChapterId === chapter.outlineChapterId)!;
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
    if (count < policy.acceptedRange[0] || count > policy.acceptedRange[1]) throw new Error(`Main Idea 修改后词数应为 ${policy.acceptedRange[0]}–${policy.acceptedRange[1]}，实际 ${count}`);
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

  const data: Record<string, unknown> = { chapters, contentVersion: { increment: 1 }, errorMessage: null };
  if (input.targetType === "main_idea") data.mainIdea = { id: "main-idea", ...result.mainIdea };
  if (input.targetType === "homework") data.homework = content.homework;
  if (["chapter", "paragraph"].includes(input.targetType) && content.homework) data.exercisesStale = true;
  await db.courseLessonContent.update!({ where: { courseId }, data });
  await db.courseContentChatMessage.create!({ data: { courseId, role: "assistant", content: "已按指定范围完成修改并通过校验，其他内容未变。", targetType: input.targetType, targetId: input.targetId } });
  await db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "modify" } }, data: { status: "succeeded" } });
  return getCourseContentState(db, courseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "内容修改失败；原内容已保留";
    await db.courseContentGeneration.update!({ where: { courseId_sourceRevision_operation: { courseId, sourceRevision: revision, operation: "modify" } }, data: { status: "failed", errorMessage: message } });
    throw error;
  }
}
