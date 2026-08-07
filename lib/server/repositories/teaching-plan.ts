import type {
  CourseStage,
  EnglishLevel,
  ExerciseType,
  TeachingPlan,
  TeachingPlanKnowledgePoint,
  TeachingPlanState,
} from "@/lib/contracts/api";
import { buildTeachingPlanDraft, TeachingPlanValidationError, validateTeachingPlanForConfirm } from "@/lib/server/validation/teaching-plan";

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  currentStage: CourseStage;
  englishLevel?: EnglishLevel | null;
  knowledgePointIds?: unknown;
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
  chapters: unknown;
  afterClassPractice: unknown;
  confirmedAt: Date | null;
  updatedAt: Date;
};

type DbPreset = {
  id: string;
  kind: "theme" | "grammar";
  label: string;
  category: string | null;
  sortOrder: number;
  archivedAt: Date | null;
};

type Delegate<T> = {
  findUnique?: (query: Record<string, unknown>) => Promise<T | null>;
  findMany?: (query: Record<string, unknown>) => Promise<T[]>;
  upsert?: (query: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<T>;
  update?: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<T>;
};

export type TeachingPlanDb = {
  course: Required<Pick<Delegate<DbCourse>, "findUnique" | "update">>;
  courseStoryOutline: Required<Pick<Delegate<DbOutline>, "findUnique">>;
  courseTeachingPlan: Required<Pick<Delegate<DbTeachingPlan>, "findUnique" | "upsert" | "update">>;
  presetOption: Required<Pick<Delegate<DbPreset>, "findMany">>;
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
  constructor(message = "确认后会重置已生成的文案、练习和视觉资源") {
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
    chapters: normalizeChapters(record.chapters),
    afterClassPractice: normalizeAfterClassPractice(record.afterClassPractice),
    updatedAt: record.updatedAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCounts(
  value: unknown,
  allowedTypes: readonly ExerciseType[],
): Record<string, number> {
  const empty = Object.fromEntries(allowedTypes.map((type) => [type, 0]));
  if (!isRecord(value)) return empty;
  const countsByType = value.countsByType;
  if (isRecord(countsByType)) {
    return Object.fromEntries(allowedTypes.map((type) => [type, typeof countsByType[type] === "number" ? countsByType[type] : 0]));
  }
  const legacyTypes = Array.isArray(value.types) ? value.types.filter((type): type is ExerciseType => typeof type === "string" && allowedTypes.includes(type as ExerciseType)) : [];
  const legacyCount = typeof value.count === "number" ? value.count : 0;
  if (!legacyTypes.length || legacyCount <= 0) return empty;
  const base = Math.floor(legacyCount / legacyTypes.length);
  const remainder = legacyCount % legacyTypes.length;
  return Object.fromEntries(allowedTypes.map((type) => {
    const index = legacyTypes.indexOf(type);
    return [type, index === -1 ? 0 : base + (index < remainder ? 1 : 0)];
  }));
}

function normalizeExerciseConfig(value: unknown): TeachingPlan["chapters"][number]["embeddedExercises"] {
  const record = isRecord(value) ? value : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    countsByType: normalizeCounts(record, ["choice", "blank", "vocab"]) as TeachingPlan["chapters"][number]["embeddedExercises"]["countsByType"],
  };
}

function normalizePracticeConfig(value: unknown): TeachingPlan["chapters"][number]["chapterPractice"] {
  const record = isRecord(value) ? value : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : false,
    countsByType: normalizeCounts(record, ["choice", "blank", "vocab", "matching"]) as TeachingPlan["chapters"][number]["chapterPractice"]["countsByType"],
  };
}

function normalizeChapters(value: unknown): TeachingPlan["chapters"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((chapter) => {
    const touched = isRecord(chapter.touched) ? chapter.touched : {};
    return {
      outlineChapterId: typeof chapter.outlineChapterId === "string" ? chapter.outlineChapterId : "",
      targetWordCount: typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : null,
      knowledgePointIds: Array.isArray(chapter.knowledgePointIds) ? chapter.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
      readingExerciseMode: chapter.readingExerciseMode === "embedded" ? "embedded" : "none",
      embeddedExercises: normalizeExerciseConfig(chapter.embeddedExercises),
      chapterPractice: normalizePracticeConfig(chapter.chapterPractice),
      touched: {
        targetWordCount: touched.targetWordCount === true,
        knowledgePointIds: touched.knowledgePointIds === true,
        readingExerciseMode: touched.readingExerciseMode === true,
        embeddedExercises: touched.embeddedExercises === true,
        chapterPractice: touched.chapterPractice === true,
      },
    };
  });
}

function normalizeAfterClassPractice(value: unknown): TeachingPlan["afterClassPractice"] {
  const record = isRecord(value) ? value : {};
  return {
    ...record,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    knowledgePointIds: Array.isArray(record.knowledgePointIds) ? record.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
    practice: normalizePracticeConfig(record.practice),
    touched: isRecord(record.touched) ? record.touched : { knowledgePointIds: false, practice: false },
  } as TeachingPlan["afterClassPractice"];
}

function planWriteData(plan: TeachingPlan) {
  return {
    englishLevel: plan.englishLevel,
    chapters: plan.chapters,
    afterClassPractice: plan.afterClassPractice,
  };
}

function toKnowledgePoint(preset: DbPreset): TeachingPlanKnowledgePoint {
  return {
    id: preset.id,
    label: preset.label,
    category: preset.category ?? undefined,
  };
}

async function getCourse(db: TeachingPlanDb, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } });
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

async function listKnowledgePoints(db: TeachingPlanDb) {
  const presets = await db.presetOption.findMany({
    where: { kind: "grammar", archivedAt: null },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });
  return presets.map(toKnowledgePoint);
}

async function ensureTeachingPlan(db: TeachingPlanDb, course: DbCourse, outline: DbOutline) {
  const existing = await db.courseTeachingPlan.findUnique({ where: { courseId: course.id } });
  if (existing) return toTeachingPlan(existing);
  if (!course.englishLevel) throw new CourseTeachingPlanPrerequisiteError("请先在第一步选择英语难度和知识点");
  const outlineState = toOutlineState(outline);
  const draft = buildTeachingPlanDraft({
    courseId: course.id,
    englishLevel: course.englishLevel,
    durationMinutes: course.durationMinutes as 30 | 45 | 60,
    chapters: outlineState.chapters.map((chapter) => ({ ...chapter, recommendedKnowledgePointIds: chapter.recommendedKnowledgePointIds ?? [], knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "" })),
    updatedAt: new Date().toISOString(),
  });
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

export async function getTeachingPlanState(db: TeachingPlanDb, courseId: string): Promise<TeachingPlanState> {
  const course = await getCourse(db, courseId);
  const outline = await getConfirmedOutline(db, course);
  const [savedPlan, knowledgePoints] = await Promise.all([
    ensureTeachingPlan(db, course, outline),
    listKnowledgePoints(db),
  ]);
  const plan = savedPlan.afterClassPractice.touched.knowledgePointIds
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
      englishLevel: course.englishLevel as EnglishLevel,
      knowledgePointIds: Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
    },
    outline: toOutlineState(outline),
    knowledgePoints,
    plan,
  };
}

export async function saveTeachingPlan(db: TeachingPlanDb, courseId: string, plan: TeachingPlan) {
  const course = await getCourse(db, courseId);
  const outline = await getConfirmedOutline(db, course);
  const outlineChapterIds = toOutlineState(outline).chapters.map((chapter) => chapter.id);
  if (plan.courseId !== courseId) throw new TeachingPlanValidationError();
  if (!course.englishLevel || plan.englishLevel !== course.englishLevel) throw new TeachingPlanValidationError("英语难度以第一步设置为准。");
  const allowedKnowledgePointIds = new Set((await listKnowledgePoints(db)).map((point) => point.id));
  if (plan.chapters.some((chapter) => chapter.knowledgePointIds.some((id) => !allowedKnowledgePointIds.has(id)))) {
    throw new TeachingPlanValidationError("章节知识点只能从当前语法库中选择。");
  }
  const parsedPlan = { ...plan, englishLevel: course.englishLevel, status: "draft" as const, confirmedAt: null };
  if (parsedPlan.chapters.map((chapter) => chapter.outlineChapterId).join("\n") !== outlineChapterIds.join("\n")) {
    throw new TeachingPlanValidationError("教学规划章节与故事大纲不一致。");
  }
  const saved = await db.courseTeachingPlan.upsert({
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
  return toTeachingPlan(saved);
}

export async function confirmTeachingPlan(db: TeachingPlanDb, courseId: string, resetDownstream: boolean) {
  const confirm = async (tx: TeachingPlanDb) => {
    const course = await getCourse(tx, courseId);
    const outline = await getConfirmedOutline(tx, course);
    const existing = await tx.courseTeachingPlan.findUnique({ where: { courseId } });
    if (!existing) throw new TeachingPlanValidationError("教学规划信息不完整");
    const plan = toTeachingPlan(existing);
    const outlineChapterIds = toOutlineState(outline).chapters.map((chapter) => chapter.id);
    validateTeachingPlanForConfirm(plan, outlineChapterIds);

    const hasDownstream = !["teaching_plan", "content"].includes(course.currentStage);
    if (hasDownstream && !resetDownstream) throw new CourseTeachingPlanConflictError();

    const confirmedAt = new Date();
    const [saved, updatedCourse] = await Promise.all([
      tx.courseTeachingPlan.update({
        where: { courseId },
        data: { status: "confirmed", confirmedAt },
      }),
      tx.course.update({ where: { id: courseId }, data: { currentStage: "content" } }),
    ]);
    return {
      plan: toTeachingPlan(saved),
      course: {
        id: updatedCourse.id,
        currentStage: updatedCourse.currentStage,
      },
    };
  };
  return db.$transaction ? db.$transaction(confirm) : confirm(db);
}

export const teachingPlanExerciseTypes = {
  embedded: ["choice", "blank", "vocab"] satisfies ExerciseType[],
  practice: ["choice", "blank", "vocab", "matching"] satisfies ExerciseType[],
};
