import type {
  CourseStage,
  EnglishLevel,
  GrammarExerciseType,
  StoryComplexity,
  TeachingPlan,
  TeachingPlanState,
} from "@/lib/contracts/api";
import { buildTeachingPlanDraft, TeachingPlanValidationError, validateTeachingPlanForConfirm } from "@/lib/server/validation/teaching-plan";
import {
  ALL_GRAMMAR_EXERCISE_TYPES,
  defaultPracticeConfig,
  defaultReadingExerciseConfig,
  DEFAULT_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
  MAX_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
  MAX_READING_PAGE_COUNT,
  MIN_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
  MIN_READING_PAGE_COUNT,
  recommendedReadingPageCount,
} from "@/lib/domain/teaching-plan-policy";
import { defaultStoryComplexity, storyLengthPolicy } from "@/lib/domain/story-length-policy";
import { furthestCourseStage } from "@/lib/domain/course-stage";
import { clearCourseDataAfterStage, hasCourseDownstream, removeCourseImageFiles, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";
import { resolveGrammarBookKnowledgePoints, resolveGrammarKnowledgePoints, type GrammarContextDb } from "@/lib/server/repositories/grammar-context";

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  currentStage: CourseStage;
  staleFromStage?: CourseStage | null;
  lifecycleStatus?: "draft" | "published" | "archived";
  englishLevel?: EnglishLevel | null;
  grammarBookEditionId?: string | null;
  knowledgePointIds?: unknown;
  storySetting?: { storyComplexity?: StoryComplexity | null; alignmentDetails?: unknown } | null;
};

type DbOutlineChapter = {
  id: string;
  order: number;
  title: string;
  storyGoal: string;
  keyEvents: unknown;
  recommendedKnowledgePointIds?: unknown;
  knowledgePointRecommendationSummary?: string;
};

type DbOutline = {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  chapters?: DbOutlineChapter[];
};

type DbTeachingPlan = {
  id: string;
  courseId: string;
  status: "draft" | "confirmed";
  englishLevel: EnglishLevel | null;
  mainIdeaTargetWordCount?: number;
  chapters: unknown;
  afterClassPractice: unknown;
  confirmedAt: Date | null;
  updatedAt: Date;
};

type DbLessonContent = {
  courseId: string;
  status?: string;
  contentVersion?: number;
  chapters?: unknown;
  mainIdea?: unknown;
  homework?: unknown;
};

type Delegate<T> = {
  findUnique?: (query: Record<string, unknown>) => Promise<T | null>;
  findMany?: (query: Record<string, unknown>) => Promise<T[]>;
  upsert?: (query: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<T>;
  update?: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<T>;
  deleteMany?: (query: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};

export type TeachingPlanDb = {
  course: Required<Pick<Delegate<DbCourse>, "findUnique" | "update">>;
  courseStoryOutline: Required<Pick<Delegate<DbOutline>, "findUnique">>;
  courseTeachingPlan: Required<Pick<Delegate<DbTeachingPlan>, "findUnique" | "upsert" | "update">>;
  knowledgePoint?: GrammarContextDb["knowledgePoint"];
  presetOption?: GrammarContextDb["presetOption"];
  courseLessonContent?: Pick<Delegate<DbLessonContent>, "findUnique" | "deleteMany">;
  courseContentGeneration?: Pick<Delegate<{ courseId: string }>, "deleteMany">;
  courseContentChatMessage?: Pick<Delegate<{ courseId: string }>, "deleteMany">;
  $transaction?: <T>(callback: (tx: TeachingPlanDb) => Promise<T>) => Promise<T>;
};

export class CourseTeachingPlanNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CourseTeachingPlanNotFoundError";
  }
}

export class CourseTeachingPlanPrerequisiteError extends Error {
  constructor(message = "请先确认故事大纲") {
    super(message);
    this.name = "CourseTeachingPlanPrerequisiteError";
  }
}

export class CourseTeachingPlanConflictError extends Error {
  constructor(message = "修改教学规划将重置后续流程，请确认后继续") {
    super(message);
    this.name = "CourseTeachingPlanConflictError";
  }
}

function outlineSummary(chapter: DbOutlineChapter) {
  const events = Array.isArray(chapter.keyEvents) ? chapter.keyEvents.filter((event): event is string => typeof event === "string") : [];
  return events[0] || chapter.storyGoal;
}

function toOutlineState(outline: DbOutline) {
  const chapters = [...(outline.chapters ?? [])].sort((left, right) => left.order - right.order);
  return {
    id: outline.id,
    title: outline.title,
    summary: outline.summary,
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      summary: outlineSummary(chapter),
      recommendedKnowledgePointIds: Array.isArray(chapter.recommendedKnowledgePointIds) ? chapter.recommendedKnowledgePointIds.filter((id): id is string => typeof id === "string") : [],
      knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "",
    })),
  };
}

function toTeachingPlan(record: DbTeachingPlan): TeachingPlan {
  return {
    courseId: record.courseId,
    status: record.status,
    englishLevel: record.englishLevel,
    mainIdeaTargetWordCount: typeof record.mainIdeaTargetWordCount === "number" ? record.mainIdeaTargetWordCount : 120,
    chapters: normalizeChapters(record.chapters, record.englishLevel),
    afterClassPractice: normalizeAfterClassPractice(record.afterClassPractice),
    updatedAt: record.updatedAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericField(value: unknown, key: string, fallback: number) {
  return isRecord(value) && typeof value[key] === "number" ? value[key] as number : fallback;
}

function grammarTypes(value: unknown, legacyCounts?: Record<string, unknown>): GrammarExerciseType[] {
  if (Array.isArray(value)) {
    return ALL_GRAMMAR_EXERCISE_TYPES.filter((type) => value.includes(type));
  }
  return ALL_GRAMMAR_EXERCISE_TYPES.filter((type) => typeof legacyCounts?.[type] === "number" && Number(legacyCounts[type]) > 0);
}

function normalizeGrammarPlan(value: unknown, fallback: TeachingPlan["chapters"][number]["readingExercises"]["grammar"]) {
  const record = isRecord(value) ? value : {};
  if (Array.isArray(record.enabledTypes) && typeof record.total === "number") {
    return { enabledTypes: grammarTypes(record.enabledTypes), total: record.total };
  }
  const enabledTypes = grammarTypes(undefined, record);
  const legacyTotal = ALL_GRAMMAR_EXERCISE_TYPES.reduce((total, type) => total + numericField(record, type, 0), 0);
  const hasLegacyCounts = ALL_GRAMMAR_EXERCISE_TYPES.some((type) => typeof record[type] === "number");
  return hasLegacyCounts ? { enabledTypes, total: legacyTotal } : fallback;
}

function normalizeReadingExerciseConfig(value: unknown): TeachingPlan["chapters"][number]["readingExercises"] {
  const record = isRecord(value) ? value : {};
  const defaults = defaultReadingExerciseConfig();
  const grammar = normalizeGrammarPlan(record.grammar, defaults.grammar);
  const vocabulary = isRecord(record.vocabulary) ? record.vocabulary : {};
  const legacyVocabularyTotal = numericField(vocabulary, "chineseHint", defaults.vocabulary.total);
  return {
    enabled: true,
    grammar,
    vocabulary: Array.isArray(vocabulary.enabledTypes) && typeof vocabulary.total === "number"
      ? { enabledTypes: vocabulary.enabledTypes.includes("chineseHint") ? ["chineseHint"] : [], total: vocabulary.total }
      : { enabledTypes: legacyVocabularyTotal > 0 ? ["chineseHint"] : [], total: legacyVocabularyTotal },
  };
}

function normalizePracticeConfig(value: unknown): TeachingPlan["chapters"][number]["chapterPractice"] {
  const record = isRecord(value) ? value : {};
  const defaults = defaultPracticeConfig(false);
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    grammar: normalizeGrammarPlan(record.grammar, defaults.grammar),
  };
}

function normalizeChapters(value: unknown, englishLevel: EnglishLevel | null): TeachingPlan["chapters"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((chapter) => {
    const touched = isRecord(chapter.touched) ? chapter.touched : {};
    const targetWordCount = typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : null;
    const readingExercises = normalizeReadingExerciseConfig(chapter.readingExercises ?? chapter.embeddedExercises);
    const savedReadingMode = chapter.readingExerciseMode === "interactive" || chapter.readingExerciseMode === "embedded" ? "interactive" : "complete";
    const savedChapterPractice = normalizePracticeConfig(chapter.chapterPractice);
    return {
      outlineChapterId: typeof chapter.outlineChapterId === "string" ? chapter.outlineChapterId : "",
      targetWordCount,
      paragraphCount: touched.paragraphCount === true && typeof chapter.paragraphCount === "number"
        ? Math.min(MAX_READING_PAGE_COUNT, Math.max(MIN_READING_PAGE_COUNT, Math.round(chapter.paragraphCount)))
        : recommendedReadingPageCount(englishLevel ?? "A2", targetWordCount ?? 90),
      knowledgePointIds: Array.isArray(chapter.knowledgePointIds) ? chapter.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
      readingExerciseMode: touched.readingExerciseMode === true ? savedReadingMode : "interactive",
      readingExercises,
      chapterPractice: touched.chapterPractice === true ? savedChapterPractice : defaultPracticeConfig(false),
      touched: {
        targetWordCount: touched.targetWordCount === true,
        paragraphCount: touched.paragraphCount === true,
        knowledgePointIds: touched.knowledgePointIds === true,
        readingExerciseMode: touched.readingExerciseMode === true,
        readingExercises: touched.readingExercises === true || touched.embeddedExercises === true,
        chapterPractice: touched.chapterPractice === true,
      },
    };
  });
}

function normalizeAfterClassPractice(value: unknown): TeachingPlan["afterClassPractice"] {
  const record = isRecord(value) ? value : {};
  const touched = isRecord(record.touched) ? record.touched : {};
  const manuallyConfigured = touched.practice === true;
  const practiceRecord = isRecord(record.practice) ? record.practice : {};
  const legacyPractice = normalizePracticeConfig(practiceRecord);
  const knowledgePointIds = Array.isArray(record.knowledgePointIds) ? record.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const legacyPerPoint = knowledgePointIds.length ? Math.ceil(legacyPractice.grammar.total / knowledgePointIds.length) : DEFAULT_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT;
  const practice = manuallyConfigured ? {
    enabled: practiceRecord.enabled === true,
    enabledTypes: Array.isArray(practiceRecord.enabledTypes)
      ? grammarTypes(practiceRecord.enabledTypes)
      : legacyPractice.grammar.enabledTypes,
    questionsPerKnowledgePoint: Math.min(
      MAX_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
      Math.max(
        MIN_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
        typeof practiceRecord.questionsPerKnowledgePoint === "number" ? practiceRecord.questionsPerKnowledgePoint : legacyPerPoint,
      ),
    ),
  } : {
    enabled: false,
    enabledTypes: [...ALL_GRAMMAR_EXERCISE_TYPES],
    questionsPerKnowledgePoint: DEFAULT_HOMEWORK_QUESTIONS_PER_KNOWLEDGE_POINT,
  };
  const vocabularyReviewEnabled = manuallyConfigured && record.enabled === true && (typeof record.vocabularyReviewEnabled === "boolean" ? record.vocabularyReviewEnabled : true);
  return {
    ...record,
    enabled: vocabularyReviewEnabled || practice.enabled,
    vocabularyReviewEnabled,
    knowledgePointIds,
    practice,
    touched: { knowledgePointIds: touched.knowledgePointIds === true, practice: manuallyConfigured },
  } as TeachingPlan["afterClassPractice"];
}

function planWriteData(plan: TeachingPlan) {
  return {
    englishLevel: plan.englishLevel,
    mainIdeaTargetWordCount: plan.mainIdeaTargetWordCount ?? 120,
    chapters: plan.chapters,
    afterClassPractice: plan.afterClassPractice,
  };
}

async function getCourse(db: TeachingPlanDb, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, include: { storySetting: true } });
  if (!course) throw new CourseTeachingPlanNotFoundError();
  return course;
}

async function getConfirmedOutline(db: TeachingPlanDb, course: DbCourse) {
  if (course.currentStage === "audience" || course.currentStage === "story_outline") {
    throw new CourseTeachingPlanPrerequisiteError();
  }
  const outline = await db.courseStoryOutline.findUnique({
    where: { courseId: course.id },
    include: { chapters: true },
  });
  if (!outline || !outline.chapters?.length) throw new CourseTeachingPlanPrerequisiteError();
  return outline;
}

async function listKnowledgePoints(db: TeachingPlanDb, ids: string[]) {
  return resolveGrammarKnowledgePoints(db, ids);
}

function buildFreshTeachingPlan(course: DbCourse, outline: DbOutline) {
  if (!course.englishLevel) throw new CourseTeachingPlanPrerequisiteError("请先在第一步选择英语难度和知识点");
  const outlineState = toOutlineState(outline);
  return buildTeachingPlanDraft({
    courseId: course.id,
    englishLevel: course.englishLevel,
    storyComplexity: course.storySetting?.storyComplexity ?? defaultStoryComplexity(course.englishLevel),
    chapters: outlineState.chapters.map((chapter) => ({ ...chapter, recommendedKnowledgePointIds: chapter.recommendedKnowledgePointIds ?? [], knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "" })),
    updatedAt: new Date().toISOString(),
  });
}

async function ensureTeachingPlan(db: TeachingPlanDb, course: DbCourse, outline: DbOutline) {
  const existing = await db.courseTeachingPlan.findUnique({ where: { courseId: course.id } });
  const outlineState = toOutlineState(outline);
  if (existing) {
    const savedPlan = toTeachingPlan(existing);
    const outlineChapterIds = outlineState.chapters.map((chapter) => chapter.id);
    const savedChapterIds = savedPlan.chapters.map((chapter) => chapter.outlineChapterId);
    if (outlineChapterIds.join("\n") !== savedChapterIds.join("\n")) {
      const replacement = buildFreshTeachingPlan(course, outline);
      const updated = await db.courseTeachingPlan.upsert({
        where: { courseId: course.id },
        create: { courseId: course.id, status: "draft", ...planWriteData(replacement) },
        update: { status: "draft", confirmedAt: null, ...planWriteData(replacement) },
      });
      await db.course.update({ where: { id: course.id }, data: { currentStage: furthestCourseStage(course.currentStage, "teaching_plan") } });
      return toTeachingPlan(updated);
    }
    return savedPlan;
  }
  const draft = buildFreshTeachingPlan(course, outline);
  const created = await db.courseTeachingPlan.upsert({
    where: { courseId: course.id },
    create: {
      courseId: course.id,
      status: "draft",
      ...planWriteData(draft),
    },
    update: {},
  });
  return toTeachingPlan(created);
}

export async function resetTeachingPlan(db: TeachingPlanDb, courseId: string) {
  const reset = async (tx: TeachingPlanDb) => {
    const course = await getCourse(tx, courseId);
    const outline = await getConfirmedOutline(tx, course);
    const storagePaths = await clearCourseDataAfterStage(tx as unknown as CourseDownstreamDb, courseId, "story_outline", "teaching_plan");
    const draft = buildFreshTeachingPlan(course, outline);
    const saved = await tx.courseTeachingPlan.upsert({
      where: { courseId },
      create: { courseId, status: "draft", ...planWriteData(draft) },
      update: { status: "draft", confirmedAt: null, ...planWriteData(draft) },
    });
    return { storagePaths, state: {
      plan: toTeachingPlan(saved),
      course: {
        id: course.id,
        currentStage: "teaching_plan" as const,
        staleFromStage: null,
      },
    } };
  };
  const result = db.$transaction ? await db.$transaction(reset) : await reset(db);
  await removeCourseImageFiles(result.storagePaths);
  return result.state;
}

export async function getTeachingPlanState(db: TeachingPlanDb, courseId: string): Promise<TeachingPlanState> {
  const course = await getCourse(db, courseId);
  const outline = await getConfirmedOutline(db, course);
  const [savedPlan, knowledgePoints] = await Promise.all([
    ensureTeachingPlan(db, course, outline),
    course.grammarBookEditionId
      ? resolveGrammarBookKnowledgePoints(db, course.grammarBookEditionId)
      : listKnowledgePoints(db, Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : []),
  ]);
  const plan = savedPlan.afterClassPractice.touched.knowledgePointIds && savedPlan.afterClassPractice.knowledgePointIds.length
    ? savedPlan
    : {
        ...savedPlan,
        afterClassPractice: {
          ...savedPlan.afterClassPractice,
          knowledgePointIds: [...new Set(savedPlan.chapters.flatMap((chapter) => chapter.knowledgePointIds))],
        },
      };
  return {
    course: {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes as 30 | 45 | 60,
      currentStage: course.currentStage,
      staleFromStage: course.staleFromStage ?? null,
      englishLevel: course.englishLevel as EnglishLevel,
      storyComplexity: course.storySetting?.storyComplexity ?? defaultStoryComplexity(course.englishLevel as EnglishLevel),
      knowledgePointIds: Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
    },
    outline: toOutlineState(outline),
    knowledgePoints,
    plan,
    lengthPolicy: storyLengthPolicy(
      course.englishLevel as EnglishLevel,
      course.storySetting?.storyComplexity ?? defaultStoryComplexity(course.englishLevel as EnglishLevel),
      toOutlineState(outline).chapters.length,
    ),
  };
}

export async function saveTeachingPlan(db: TeachingPlanDb, courseId: string, plan: TeachingPlan, options: { preserveProgress?: boolean } = {}) {
  const course = await getCourse(db, courseId);
  const outline = await getConfirmedOutline(db, course);
  const outlineChapterIds = toOutlineState(outline).chapters.map((chapter) => chapter.id);
  if (plan.courseId !== courseId) throw new TeachingPlanValidationError();
  if (!course.englishLevel || plan.englishLevel !== course.englishLevel) throw new TeachingPlanValidationError("英语难度以第一步设置为准。");
  const existingKnowledgePointIds = Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const submittedKnowledgePointIds = [...new Set([
    ...plan.chapters.flatMap((chapter) => chapter.knowledgePointIds),
    ...plan.afterClassPractice.knowledgePointIds,
  ])];
  const allowedKnowledgePointIds = new Set(existingKnowledgePointIds);
  if (course.grammarBookEditionId && db.knowledgePoint) {
    const editionPoints = await db.knowledgePoint.findMany({
      where: { id: { in: submittedKnowledgePointIds }, bookEditionId: course.grammarBookEditionId, source: "grammar_in_use" },
    });
    editionPoints.forEach((point) => allowedKnowledgePointIds.add(point.id));
  }
  if (plan.chapters.some((chapter) => chapter.knowledgePointIds.some((id) => !allowedKnowledgePointIds.has(id)))
    || plan.afterClassPractice.knowledgePointIds.some((id) => !allowedKnowledgePointIds.has(id))) {
    throw new TeachingPlanValidationError("知识点只能从当前语法书版本中选择。");
  }
  const parsedPlan = {
    ...plan,
    englishLevel: course.englishLevel,
    status: "draft" as const,
    confirmedAt: null,
    chapters: plan.chapters,
  };
  if (parsedPlan.chapters.map((chapter) => chapter.outlineChapterId).join("\n") !== outlineChapterIds.join("\n")) {
    throw new TeachingPlanValidationError("教学规划章节与故事大纲不一致。");
  }
  const save = async (tx: TeachingPlanDb) => {
    const saved = await tx.courseTeachingPlan.upsert({
      where: { courseId },
      create: {
        courseId,
        status: "draft",
        ...planWriteData(parsedPlan),
      },
      update: {
        status: "draft",
        confirmedAt: null,
        ...planWriteData(parsedPlan),
      },
    });
    if (!options.preserveProgress) {
      await tx.course.update({
        where: { id: courseId },
        data: { currentStage: furthestCourseStage(course.currentStage, "teaching_plan") },
      });
    }
    return toTeachingPlan(saved);
  };
  return db.$transaction ? db.$transaction(save) : save(db);
}

export type TeachingPlanDownstreamAction = "check" | "reset";

function hasGeneratedCourseContent(content: DbLessonContent | null) {
  if (!content) return false;
  return content.status !== undefined && content.status !== "empty"
    || typeof content.contentVersion === "number" && content.contentVersion > 0
    || Array.isArray(content.chapters) && content.chapters.length > 0
    || content.mainIdea != null
    || content.homework != null;
}

export async function confirmTeachingPlan(db: TeachingPlanDb, courseId: string, downstreamAction: TeachingPlanDownstreamAction, inputPlan?: TeachingPlan) {
  const confirm = async (tx: TeachingPlanDb) => {
    let course = await getCourse(tx, courseId);
    const outline = await getConfirmedOutline(tx, course);
    let existing = await tx.courseTeachingPlan.findUnique({ where: { courseId } });
    if (!existing) throw new TeachingPlanValidationError("教学规划信息不完整");
    let plan = toTeachingPlan(existing);
    if (!inputPlan && plan.status === "confirmed") return { storagePaths: [], state: { plan, course: { id: course.id, currentStage: course.currentStage, staleFromStage: course.staleFromStage ?? null } } };
    const outlineChapterIds = toOutlineState(outline).chapters.map((chapter) => chapter.id);

    const content = tx.courseLessonContent?.findUnique ? await tx.courseLessonContent.findUnique({ where: { courseId } }) : null;
    const hasDownstream = hasGeneratedCourseContent(content)
      || await hasCourseDownstream(tx as unknown as CourseDownstreamDb, courseId, "content");
    if (hasDownstream && downstreamAction === "check") throw new CourseTeachingPlanConflictError();

    if (inputPlan) {
      plan = await saveTeachingPlan(tx, courseId, inputPlan, { preserveProgress: true });
      existing = await tx.courseTeachingPlan.findUnique({ where: { courseId } });
      if (!existing) throw new TeachingPlanValidationError("教学规划信息不完整");
      course = await getCourse(tx, courseId);
    }
    validateTeachingPlanForConfirm(plan, outlineChapterIds);

    const confirmedAt = new Date();
    const storagePaths = hasDownstream
      ? await clearCourseDataAfterStage(tx as unknown as CourseDownstreamDb, courseId, "teaching_plan", "content")
      : [];
    const [saved, updatedCourse] = await Promise.all([
      tx.courseTeachingPlan.update({
        where: { courseId },
        data: { status: "confirmed", confirmedAt },
      }),
      tx.course.update({
        where: { id: courseId },
        data: {
          currentStage: hasDownstream ? "content" : furthestCourseStage(course.currentStage, "content"),
          staleFromStage: null,
          ...(hasDownstream ? { lifecycleStatus: "draft" } : {}),
        },
      }),
    ]);
    return { storagePaths, state: {
      plan: toTeachingPlan(saved),
      course: {
        id: updatedCourse.id,
        currentStage: updatedCourse.currentStage,
        staleFromStage: updatedCourse.staleFromStage ?? null,
      },
    } };
  };
  const result = db.$transaction ? await db.$transaction(confirm) : await confirm(db);
  await removeCourseImageFiles(result.storagePaths);
  return result.state;
}
