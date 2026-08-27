import type {
  CourseCharacter,
  CourseAudiencePerson,
  CourseResearchPlan,
  CourseSourceReference,
  CourseSourceReferenceType,
  CourseSourceStatus,
  CourseStage,
  CourseStoryChatAction,
  CourseStoryChatMessage,
  CourseStoryDirection,
  CourseStoryMessageInput,
  CourseStoryOutline,
  CourseStoryOutlineChapter,
  CourseStoryOutlineState,
  StoryResearchProvider,
  StoryWritingProvider,
  EnglishLevel,
  TeachingPlanKnowledgePoint,
  StoryAlignmentQuestion,
  StoryAlignmentState,
  StoryMainlineCard,
  StoryRequirementBrief,
} from "@/lib/contracts/api";
import { furthestCourseStage, staleStageAfterConfirming } from "@/lib/domain/course-stage";
import { resolveGrammarKnowledgePoints, type GrammarContextDb } from "@/lib/server/repositories/grammar-context";

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  currentStage: CourseStage;
  staleFromStage?: CourseStage | null;
  people?: DbCoursePerson[];
  englishLevel?: EnglishLevel | null;
  knowledgePointIds?: unknown;
};

type DbCoursePerson = {
  personId: string;
  role: "teacher" | "student";
  chineseNameSnapshot: string;
  englishNameSnapshot: string;
  ageSnapshot: number;
  genderSnapshot: "male" | "female";
  visualAssetIdSnapshot?: string | null;
};

type DbMessage = {
  id: string;
  courseId: string;
  role: "teacher" | "assistant" | "system";
  content: string;
  actions?: unknown;
  createdAt: Date;
};

type DbDirection = {
  id: string;
  courseId: string;
  title: string;
  hook: string;
  whyFits: string;
  mainCharacters: unknown;
  storyHighlight?: string;
  growthCore?: string;
  classroomValue: string;
  seedPrompt: string;
  selectedAt: Date | null;
  createdAt: Date;
};

type DbReference = {
  id: string;
  courseId: string;
  name: string;
  type: CourseSourceReferenceType;
  sourceStatus: CourseSourceStatus;
  summary: string;
  usableFacts: unknown;
  avoidTopics: unknown;
  adaptationBoundary: string;
  researchProvider: StoryResearchProvider;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbOutline = {
  id: string;
  courseId: string;
  chapterCount: number;
  title: string;
  summary: string;
  writingProvider: StoryWritingProvider;
  createdAt: Date;
  updatedAt: Date;
  chapters?: DbChapter[];
};

type DbSetting = {
  id: string;
  courseId: string;
  chapterCount: number;
  writingProvider: StoryWritingProvider;
  alignmentStatus?: StoryAlignmentState["status"];
  planningMode?: StoryAlignmentState["planningMode"];
  alignmentSummary?: string | null;
  alignmentDetails?: unknown;
  alignmentConfirmedAt?: Date | null;
  stateRevision?: number;
  operationRequestId?: string | null;
  operationAction?: string | null;
  operationPhase?: string | null;
  operationStatus?: "running" | "succeeded" | "failed" | "result_unknown" | "superseded" | null;
  operationError?: string | null;
  operationInput?: unknown;
  operationStartedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbChapter = {
  id: string;
  order: number;
  title: string;
  storyGoal: string;
  keyEvents: unknown;
  characterIds: unknown;
  setting: string;
  endingHook: string;
  recommendedKnowledgePointIds?: unknown;
  knowledgePointRecommendationSummary?: string;
};

type DbCharacter = {
  id: string;
  courseId: string;
  displayName: string;
  englishName: string;
  sourceType: "person" | "referenced" | "original";
  sourcePersonId?: string | null;
  sourceReferenceId?: string | null;
  roleInStory: string;
  shortDescription: string;
  visualDescription?: string | null;
  shouldAppearInImages: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Delegate<T> = {
  findMany?: (query: Record<string, unknown>) => Promise<T[]>;
  findUnique?: (query: Record<string, unknown>) => Promise<T | null>;
  create?: (query: { data: Record<string, unknown> }) => Promise<T>;
  createMany?: (query: { data: Record<string, unknown>[] }) => Promise<{ count: number }>;
  update?: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<T | null>;
  updateMany?: (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  upsert?: (query: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<T>;
  deleteMany?: (query: Record<string, unknown>) => Promise<{ count: number }>;
};

export type StoryOutlineDb = {
  course: {
    findUnique: (query: Record<string, unknown>) => Promise<DbCourse | null>;
    update: (query: { where: { id: string }; data: Record<string, unknown> }) => Promise<DbCourse>;
  };
  courseStoryChatMessage: Required<Pick<Delegate<DbMessage>, "findMany" | "create" | "deleteMany">>;
  courseStoryDirection: Required<Pick<Delegate<DbDirection>, "findMany" | "deleteMany" | "createMany" | "update">>;
  courseSourceReference: Required<Pick<Delegate<DbReference>, "findMany" | "create" | "update" | "deleteMany">>;
  courseStoryOutline: Required<Pick<Delegate<DbOutline>, "findUnique" | "upsert" | "deleteMany">>;
  courseStorySetting: Required<Pick<Delegate<DbSetting>, "findUnique" | "upsert" | "updateMany" | "deleteMany">>;
  courseStoryOutlineChapter: Required<Pick<Delegate<DbChapter>, "deleteMany" | "createMany" | "update">>;
  courseCharacter: Required<Pick<Delegate<DbCharacter>, "findMany" | "deleteMany" | "createMany">>;
  aiGenerationLog: Required<Pick<Delegate<Record<string, unknown>>, "create">>;
  presetOption?: { findMany: (query: Record<string, unknown>) => Promise<Array<{ id: string; label: string; labelZh?: string | null; category: string | null }>> };
  knowledgePoint?: GrammarContextDb["knowledgePoint"];
  $transaction?: <T>(callback: (tx: StoryOutlineDb) => Promise<T>) => Promise<T>;
};

export type GeneratedDirection = Omit<CourseStoryDirection, "id" | "courseId" | "selectedAt" | "createdAt">;
export type GeneratedReference = Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">;
export type GeneratedMainlineCard = Omit<StoryMainlineCard, "status" | "confirmedAt">;
export type GeneratedOutline = Pick<CourseStoryOutline, "title" | "summary"> & {
  storyHook?: string;
  characters: Array<Omit<CourseCharacter, "id" | "courseId" | "createdAt" | "updatedAt"> & { key?: string }>;
  chapters: Array<Omit<CourseStoryOutlineChapter, "id"> & { characterKeys?: string[] }>;
};

type StoryOutlinePromptMessage = Pick<CourseStoryChatMessage, "role" | "content">;

type StoryOutlineAiContext = {
  chapterCount: number;
  coursePeople: CourseAudiencePerson[];
  conversationHistory: StoryOutlinePromptMessage[];
  references: CourseSourceReference[];
  selectedDirection: CourseStoryDirection | null;
  currentDirections: CourseStoryDirection[];
  currentOutline: CourseStoryOutline | null;
  englishLevel?: EnglishLevel;
  durationMinutes?: 30 | 45 | 60;
  selectedKnowledgePoints?: TeachingPlanKnowledgePoint[];
  confirmedRequirement?: string;
  requirementBrief?: StoryRequirementBrief;
  storyMode?: "faithful" | "new_story";
  classroomPresence?: "observer" | "participant" | "absent";
  requiredNamedCharacters?: string[];
  mainlineCard?: StoryMainlineCard;
};

export type StoryOutlineGenerationDeps = {
  alignRequirements: (input: StoryOutlineAiContext & {
    task: string;
    replyContext?: "initial" | "requirement_change";
    needsBackgroundRefresh?: boolean;
    requiredQuestionIds?: string[];
    onFormatRepair?: () => Promise<void>;
  }) => Promise<{
    status: "needs_clarification" | "ready_for_confirmation";
    planningMode: "explore_options" | "follow_defined_plot";
    storyMode: "faithful" | "new_story";
    classroomPresence: "observer" | "participant" | "absent";
    requiredNamedCharacters?: string[];
    provisionalBriefKind?: StoryRequirementBrief["kind"];
    brief?: StoryRequirementBrief;
    assistantMessage: string;
    resolvedUnderstanding: string[];
    unresolvedIssues: string[];
    questions: StoryAlignmentQuestion[];
    summary?: string;
  }>;
  prepareBackgroundKnowledge: (input: StoryOutlineAiContext & { task: string; confirmedRequirement: string }) => Promise<
    | { status: "not_needed"; reason: string }
    | { status: "ready"; references: GeneratedReference[] }
    | { status: "external_required"; reason: string; researchPlan: CourseResearchPlan }
  >;
  generateMainlineCard: (input: StoryOutlineAiContext & { task: string; requirementBrief: StoryRequirementBrief }) => Promise<GeneratedMainlineCard>;
  checkChangeBoundary: (input: StoryOutlineAiContext & { task: string; targetScope: "direction" | "outline" | "chapter" }) => Promise<
    | { scope: "within_target"; needsBackgroundRefresh: false }
    | { scope: "outline_revision"; reason: string; needsBackgroundRefresh: false }
    | { scope: "new_requirement"; reason: string; needsBackgroundRefresh: boolean }
  >;
  generateDirections: (input: StoryOutlineAiContext & { task: string }) => Promise<GeneratedDirection[]>;
  reviseDirection: (input: StoryOutlineAiContext & { task: string; direction: CourseStoryDirection }) => Promise<GeneratedDirection>;
  reviseChapter: (input: StoryOutlineAiContext & { task: string; chapterOrder: number }) => Promise<
    | { status: "requires_outline_revision"; reason: string }
    | { status: "ready"; chapter: Pick<CourseStoryOutlineChapter, "order" | "title" | "whatHappens" | "characterIds" | "recommendedKnowledgePointIds" | "knowledgePointRecommendationSummary"> }
  >;
  searchReference: (input: StoryOutlineAiContext & { task: string; researchPlan: CourseResearchPlan }) => Promise<GeneratedReference[]>;
  generateOutline: (input: StoryOutlineAiContext & { task: string; writingProvider: StoryWritingProvider }) => Promise<GeneratedOutline>;
};

function safeReferenceForWrite(
  reference: Partial<GeneratedReference> | null | undefined,
  fallbackName: string,
  fallbackSummary: string,
  sourceStatus?: CourseSourceStatus,
): GeneratedReference {
  const referenceTypes: CourseSourceReferenceType[] = ["real_person", "historical_person", "public_figure", "ip", "game_character", "fictional_character", "other"];
  const sourceStatuses: CourseSourceStatus[] = ["confirmed", "insufficient", "teacher_supplied"];
  const name = typeof reference?.name === "string" && reference.name.trim()
    ? reference.name.trim()
    : fallbackName || "老师补充资料";
  return {
    name,
    type: referenceTypes.includes(reference?.type as CourseSourceReferenceType) ? reference!.type! : "other",
    sourceStatus: sourceStatuses.includes((sourceStatus || reference?.sourceStatus) as CourseSourceStatus)
      ? (sourceStatus || reference?.sourceStatus) as CourseSourceStatus
      : "confirmed",
    summary: typeof reference?.summary === "string" && reference.summary.trim()
      ? reference.summary.trim()
      : fallbackSummary || `关于${name}的参考资料。`,
    usableFacts: Array.isArray(reference?.usableFacts) ? reference.usableFacts.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [],
    avoidTopics: Array.isArray(reference?.avoidTopics) ? reference.avoidTopics.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [],
    adaptationBoundary: typeof reference?.adaptationBoundary === "string" && reference.adaptationBoundary.trim()
      ? reference.adaptationBoundary.trim()
      : "仅使用已确认资料进行适合课堂的改编。",
  };
}

async function persistPreparedReferences(db: StoryOutlineDb, courseId: string, references: GeneratedReference[], replaceExisting: boolean, researchProvider: "none" | "quickrouter_gpt" = "none") {
  const persist = async (target: StoryOutlineDb) => {
    if (replaceExisting) await target.courseSourceReference.deleteMany({ where: { courseId } });
    for (const generated of references) {
      const reference = safeReferenceForWrite(generated, generated.name, generated.summary);
      await target.courseSourceReference.create({
        data: { courseId, ...reference, researchProvider, confirmedAt: null },
      });
    }
    if (replaceExisting) await updateAlignmentDetails(target, courseId, { needsBackgroundRefresh: false });
  };
  if (db.$transaction) await db.$transaction(persist);
  else await persist(db);
}

async function updateAlignmentDetails(db: StoryOutlineDb, courseId: string, changes: Record<string, unknown>) {
  const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
  const current = typeof stored?.alignmentDetails === "object" && stored.alignmentDetails !== null
    ? stored.alignmentDetails as Record<string, unknown>
    : {};
  const next = current.schemaVersion === 2
    ? {
        ...current,
        workflow: {
          ...(current.workflow && typeof current.workflow === "object" && !Array.isArray(current.workflow) ? current.workflow as Record<string, unknown> : {}),
          ...changes,
        },
      }
    : { ...current, ...changes };
  await db.courseStorySetting.updateMany({
    where: { courseId },
    data: { alignmentDetails: next },
  });
}

type AlignmentDetailsV2 = {
  schemaVersion: 2;
  requirement:
    | { kind: "clarification"; provisionalBriefKind?: StoryRequirementBrief["kind"]; resolvedRequirements: string[]; questions: StoryAlignmentQuestion[] }
    | { kind: "resolved"; storyMode: "faithful" | "new_story"; classroomPresence: "observer" | "participant" | "absent"; brief: StoryRequirementBrief };
  workflow?: {
    needsBackgroundRefresh?: boolean;
    artifactsOutdated?: boolean;
    pendingChange?: StoryAlignmentState["pendingChange"] | null;
    mainlineCard?: StoryMainlineCard;
  };
};

function isAlignmentDetailsV2(value: unknown): value is AlignmentDetailsV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.schemaVersion === 2 && Boolean(source.requirement && typeof source.requirement === "object" && !Array.isArray(source.requirement));
}

function alignmentWorkflowDetails(value: unknown) {
  if (isAlignmentDetailsV2(value)) return value.workflow ?? {};
  return value && typeof value === "object" && !Array.isArray(value) ? value as Partial<StoryAlignmentState> : {};
}

function alignmentQuestionsFromDetails(value: unknown) {
  if (isAlignmentDetailsV2(value) && value.requirement.kind === "clarification") return value.requirement.questions;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const questions = (value as Partial<StoryAlignmentState>).questions;
  return Array.isArray(questions) ? questions : [];
}

function renderStructuredAlignmentAnswers(
  questions: StoryAlignmentQuestion[],
  answers: Array<{ questionId: string; selectedOptionIds: string[]; customText?: string }>,
) {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answeredIds = new Set<string>();
  const lines = ["我的回答："];
  for (const answer of answers) {
    if (answeredIds.has(answer.questionId)) throw new CourseStoryOutlineValidationError("回答中包含重复的问题，请刷新后重试");
    answeredIds.add(answer.questionId);
    const question = questionMap.get(answer.questionId);
    if (!question) throw new CourseStoryOutlineValidationError("问题已经更新，请使用最新问题卡回答");
    const optionMap = new Map((question.options ?? []).map((option) => [option.id, option.label]));
    if (new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length) throw new CourseStoryOutlineValidationError("同一选项不能重复提交");
    const optionLabels = answer.selectedOptionIds.map((id) => {
      const label = optionMap.get(id);
      if (!label) throw new CourseStoryOutlineValidationError("选项已经更新，请使用最新问题卡回答");
      return label;
    });
    if (answer.customText && !question.allowCustom && question.answerMode !== "text") throw new CourseStoryOutlineValidationError("当前问题不接受自定义回答");
    const values = [...optionLabels, ...(answer.customText ? [answer.customText] : [])];
    if (!values.length) throw new CourseStoryOutlineValidationError("请填写或选择至少一项回答");
    if (question.answerMode === "single_choice" && answer.selectedOptionIds.length > 1) throw new CourseStoryOutlineValidationError("该问题只能选择一个答案");
    lines.push(`${question.label}：${values.join("；")}`);
  }
  return lines.join("\n");
}

function briefNamedCharacters(brief: StoryRequirementBrief | undefined) {
  return brief && (brief.kind === "narrative" || brief.kind === "concept") ? brief.requiredNamedCharacters : [];
}

function renderRequirementConfirmation(
  brief: StoryRequirementBrief,
  planningMode: "explore_options" | "follow_defined_plot",
  storyMode: "faithful" | "new_story",
  classroomPresence: "observer" | "participant" | "absent",
  replyContext: "initial" | "requirement_change" = "initial",
  needsBackgroundRefresh = true,
) {
  const sources = brief.sourceRequirements.map((item) => `${item.name}：${item.useInCourse}`).join("；") || "无指定来源";
  const constraints = [
    brief.additionalConstraints.required.length ? `必须保留：${brief.additionalConstraints.required.join("；")}` : "",
    brief.additionalConstraints.preferred.length ? `偏好：${brief.additionalConstraints.preferred.join("；")}` : "",
    brief.additionalConstraints.excluded.length ? `排除：${brief.additionalConstraints.excluded.join("；")}` : "",
  ].filter(Boolean);
  const lines = [replyContext === "requirement_change" ? "请确认调整后的创作需求：" : "请确认创作需求："];
  if (brief.kind === "narrative") {
    lines.push(`故事目标：${brief.objective}`, `来源使用：${sources}`);
    if (brief.requiredNamedCharacters.length) lines.push(`必须出场：${brief.requiredNamedCharacters.join("、")}`);
    lines.push(brief.fixedPlot ? `固定主线：${brief.fixedPlot}` : "故事范围：核心方向可继续探索");
  } else if (brief.kind === "concept") {
    lines.push(`教学目的：${brief.objective}`, `学习目标：${brief.learningTargets.map((item) => `${item.concept}—${item.expectedUnderstanding}`).join("；")}`);
    if (brief.assumedPriorKnowledge.length) lines.push(`已假定基础：${brief.assumedPriorKnowledge.join("；")}`);
    lines.push(`来源使用：${sources}`);
    if (brief.fixedPlot) lines.push(`固定主线：${brief.fixedPlot}`);
  } else {
    lines.push(`真实对象：${brief.subjects.map((item) => item.name).join("、")}`, `事实范围：${brief.factualFocus}`, `来源要求：${sources}`);
  }
  lines.push(...constraints);
  const modeText = storyMode === "faithful" ? "忠实讲述" : "创作新故事";
  const presenceText = classroomPresence === "observer" ? "课堂人物旁观见证" : classroomPresence === "participant" ? "课堂人物参与推动" : "课堂人物不进入";
  lines.push(`讲述方式：${modeText}；${presenceText}`);
  const nextStep = replyContext === "requirement_change"
    ? needsBackgroundRefresh ? "下一步：确认后按新需求继续，必要时重新整理背景资料。" : "下一步：确认后按新需求继续，并沿用现有背景资料。"
    : planningMode === "explore_options" ? "下一步：确认后准备 3 个不同的故事方向；必要时先整理背景资料。" : "下一步：确认后准备主线理解卡；必要时先整理背景资料。";
  lines.push(nextStep);
  return lines.join("\n");
}

function fallbackResearchPlan(objectName: string): CourseResearchPlan {
  return {
    researchGoal: `补足“${objectName}”在当前故事中真正需要使用的知识`,
    packets: [{
      title: objectName,
      subjects: [{ name: objectName }],
      researchQuestions: ["为了准确创作当前故事，需要查清哪些设定、经历、关系、规则或因果？"],
      storyUseGoals: ["把查证结果转化为角色行动、故事冲突、场景限制和因果主线"],
    }],
  };
}

type StoryOutlineSaveInput = {
  title: string;
  summary: string;
  chapterCount: number;
  writingProvider: StoryWritingProvider;
  chapters: Array<Omit<CourseStoryOutlineChapter, "id"> & { id?: string }>;
  characters: Array<Omit<CourseCharacter, "id" | "courseId" | "createdAt" | "updatedAt"> & { id?: string; courseId?: string; createdAt?: string; updatedAt?: string }>;
  sourceReferences: unknown[];
};

export class CourseStoryOutlineNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CourseStoryOutlineNotFoundError";
  }
}

export class CourseStoryOutlineConflictError extends Error {
  constructor(message = "修改故事大纲会使后续内容保留为旧版本") {
    super(message);
    this.name = "CourseStoryOutlineConflictError";
  }
}

export class CourseStoryOutlineValidationError extends Error {
  constructor(message = "请先生成完整故事大纲") {
    super(message);
    this.name = "CourseStoryOutlineValidationError";
  }
}

function defaultChapterCount(duration: number) {
  if (duration <= 30) return 3;
  if (duration >= 60) return 5;
  return 4;
}

function array(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function proseText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  const parts = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return parts.length === value.length ? parts.join(" ") : "";
}

function normalizedPersonName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s._'’·-]+/gu, "");
}

function storedDirectionName(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const source = value as Record<string, unknown>;
  for (const key of ["englishName", "displayName", "chineseName", "name", "label"]) {
    if (typeof source[key] === "string" && source[key].trim()) return source[key].trim();
  }
  return "";
}

function canonicalizeStoredClassroomText(value: string, people: CourseAudiencePerson[]) {
  return people
    .flatMap((person) => [person.chineseName, person.englishName]
      .filter((name) => name && name !== person.englishName)
      .map((name) => ({ name, replacement: person.englishName })))
    .sort((left, right) => right.name.length - left.name.length)
    .reduce((text, entry) => text.split(entry.name).join(entry.replacement), value);
}

function storedDirectionCharacters(value: unknown, people: CourseAudiencePerson[]) {
  if (!Array.isArray(value)) return [];
  const names = value.map(storedDirectionName).filter(Boolean).map((name) => {
    const normalized = normalizedPersonName(name);
    const matches = people.filter((person) => [person.chineseName, person.englishName]
      .some((candidate) => normalizedPersonName(candidate) === normalized));
    return matches.length === 1 ? matches[0].englishName : name;
  });
  const hasClassroomPerson = names.some((name) => people.some((person) => normalizedPersonName(person.englishName) === normalizedPersonName(name)));
  return [...new Map(names
    .filter((name) => !(hasClassroomPerson && (/^(?:学生|师生|课堂|超级英雄).*(?:队|团队|战队|小组)$/u.test(name)
      || /^(?:the\s+)?(?:class|classroom|student|teacher.?student|hero|superhero).*(?:team|group|squad)$/iu.test(name))))
    .map((name) => [normalizedPersonName(name), name])).values()];
}

function isInternalStoryOutlineDiagnostic(message: string) {
  return /(?:prisma|invalid\s+`?\w+\.|invocation|expected\s+\w+,\s*provided|unexpected token|json\.parse|\n\s*at\s+)/iu.test(message);
}

function toMessage(message: DbMessage): CourseStoryChatMessage {
  const content = message.role === "assistant" && isInternalStoryOutlineDiagnostic(message.content)
    ? "故事大纲生成失败，请重试本步。你可以重试本步，或修改要求后重新提交。"
    : message.content;
  return {
    id: message.id,
    courseId: message.courseId,
    role: message.role,
    content,
    actions: Array.isArray(message.actions) ? message.actions as CourseStoryChatAction[] : [],
    createdAt: message.createdAt.toISOString(),
  };
}

function toDirection(direction: DbDirection, people: CourseAudiencePerson[]): CourseStoryDirection {
  return {
    id: direction.id,
    courseId: direction.courseId,
    title: canonicalizeStoredClassroomText(direction.title, people),
    hook: canonicalizeStoredClassroomText(direction.hook, people),
    whyFits: canonicalizeStoredClassroomText(direction.whyFits, people),
    mainCharacters: storedDirectionCharacters(direction.mainCharacters, people),
    storyHighlight: canonicalizeStoredClassroomText(direction.storyHighlight ?? "", people),
    growthCore: canonicalizeStoredClassroomText(direction.growthCore ?? "", people),
    classroomValue: direction.classroomValue,
    seedPrompt: direction.seedPrompt,
    selectedAt: direction.selectedAt?.toISOString() ?? null,
    createdAt: direction.createdAt.toISOString(),
  };
}

function toReference(reference: DbReference): CourseSourceReference {
  return {
    id: reference.id,
    courseId: reference.courseId,
    name: reference.name,
    type: reference.type,
    sourceStatus: reference.sourceStatus,
    summary: reference.summary,
    usableFacts: array(reference.usableFacts),
    avoidTopics: array(reference.avoidTopics),
    adaptationBoundary: reference.adaptationBoundary,
    researchProvider: reference.researchProvider,
    confirmedAt: reference.confirmedAt?.toISOString() ?? null,
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
}

function toCharacter(character: DbCharacter): CourseCharacter {
  return {
    id: character.id,
    courseId: character.courseId,
    displayName: character.displayName,
    englishName: character.englishName,
    sourceType: character.sourceType,
    sourcePersonId: character.sourcePersonId ?? null,
    sourceReferenceId: character.sourceReferenceId ?? null,
    roleInStory: character.roleInStory,
    shortDescription: character.shortDescription,
    visualDescription: character.visualDescription ?? null,
    shouldAppearInImages: character.shouldAppearInImages,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
  };
}

function toOutline(outline: DbOutline | null, references: CourseSourceReference[], characters: CourseCharacter[]): CourseStoryOutline | null {
  if (!outline) return null;
  return {
    id: outline.id,
    courseId: outline.courseId,
    chapterCount: outline.chapterCount,
    title: outline.title,
    summary: outline.summary,
    writingProvider: outline.writingProvider,
    sourceReferences: references,
    characters,
    chapters: (outline.chapters ?? []).map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      storyGoal: chapter.storyGoal,
      keyEvents: array(chapter.keyEvents),
      whatHappens: chapter.storyGoal,
      characterActions: array(chapter.keyEvents)[0] ?? "",
      mainlineProgress: array(chapter.keyEvents)[1] ?? "",
      characterIds: array(chapter.characterIds),
      setting: chapter.setting,
      endingHook: chapter.endingHook,
      recommendedKnowledgePointIds: array(chapter.recommendedKnowledgePointIds),
      knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "",
    })),
    createdAt: outline.createdAt.toISOString(),
    updatedAt: outline.updatedAt.toISOString(),
  };
}

async function getCourse(db: StoryOutlineDb, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, include: { people: true } });
  if (!course) throw new CourseStoryOutlineNotFoundError();
  return course;
}

function toCoursePeople(course: DbCourse): CourseAudiencePerson[] {
  return [...(course.people ?? [])]
    .sort((left, right) => {
      if (left.role !== right.role) return left.role === "teacher" ? -1 : 1;
      return left.personId.localeCompare(right.personId);
    })
    .map((person) => ({
    personId: person.personId,
    role: person.role,
    chineseName: person.chineseNameSnapshot,
    englishName: person.englishNameSnapshot,
    age: person.ageSnapshot,
    gender: person.genderSnapshot,
    visualAssetId: person.visualAssetIdSnapshot ?? null,
    visualUrl: null,
    profileChanged: false,
    }));
}

export class CourseStoryOutlineOperationConflictError extends Error {
  constructor(message = "当前步骤仍在处理中，请等待完成后再试") {
    super(message);
    this.name = "CourseStoryOutlineOperationConflictError";
  }
}

export function publicStoryOutlineErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "故事大纲生成失败，请重试本步";
  const message = error.message.trim();
  if (!message || message.length > 300 || isInternalStoryOutlineDiagnostic(message)) return "故事大纲生成失败，请重试本步";
  return message;
}

async function stateFromCourse(db: StoryOutlineDb, course: DbCourse): Promise<CourseStoryOutlineState> {
  const [messages, directions, references, characters, outline, setting] = await Promise.all([
    db.courseStoryChatMessage.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryDirection.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseSourceReference.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseCharacter.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryOutline.findUnique({ where: { courseId: course.id }, include: { chapters: true } }),
    db.courseStorySetting.findUnique({ where: { courseId: course.id } }),
  ]);
  const mappedReferences = references.map(toReference);
  const mappedCharacters = characters.map(toCharacter);
  const selectedIds = Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const selectedKnowledgePoints = await resolveGrammarKnowledgePoints(db, selectedIds);
  const mappedOutline = toOutline(outline, mappedReferences, mappedCharacters);
  const coursePeople = toCoursePeople(course);
  const rawAlignmentDetails = setting?.alignmentDetails;
  const alignmentDetails = typeof rawAlignmentDetails === "object" && rawAlignmentDetails !== null
    ? rawAlignmentDetails as Partial<StoryAlignmentState>
    : {};
  const alignmentV2 = isAlignmentDetailsV2(rawAlignmentDetails) ? rawAlignmentDetails : null;
  const resolvedV2 = alignmentV2?.requirement.kind === "resolved" ? alignmentV2.requirement : null;
  const clarificationV2 = alignmentV2?.requirement.kind === "clarification" ? alignmentV2.requirement : null;
  const workflowV2 = alignmentV2?.workflow ?? {};
  const recommendedIds = new Set(mappedOutline?.chapters.flatMap((chapter) => chapter.recommendedKnowledgePointIds) ?? []);
  return {
    stateRevision: setting?.stateRevision ?? 0,
    course: {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes as 30 | 45 | 60,
      currentStage: course.currentStage,
      staleFromStage: course.staleFromStage ?? null,
      englishLevel: course.englishLevel as EnglishLevel,
      knowledgePointIds: selectedIds,
    },
    selectedKnowledgePoints,
    unrecommendedKnowledgePoints: selectedKnowledgePoints.filter((item) => !recommendedIds.has(item.id)),
    chatMessages: messages.filter((message) => message.role !== "system").map(toMessage),
    settings: {
      chapterCount: mappedOutline?.chapterCount ?? setting?.chapterCount ?? defaultChapterCount(course.durationMinutes),
      writingProvider: mappedOutline?.writingProvider ?? setting?.writingProvider ?? "quickrouter_gpt",
    },
    alignment: {
      status: setting?.alignmentStatus ?? "idle",
      planningMode: setting?.planningMode ?? "explore_options",
      resolvedUnderstanding: clarificationV2?.resolvedRequirements ?? (Array.isArray(alignmentDetails.resolvedUnderstanding) ? alignmentDetails.resolvedUnderstanding : []),
      unresolvedIssues: clarificationV2?.questions.map((question) => question.label) ?? (Array.isArray(alignmentDetails.unresolvedIssues) ? alignmentDetails.unresolvedIssues : []),
      questions: clarificationV2?.questions ?? (Array.isArray(alignmentDetails.questions) ? alignmentDetails.questions : []),
      ...(resolvedV2 ? { schemaVersion: 2 as const, brief: resolvedV2.brief, storyMode: resolvedV2.storyMode, classroomPresence: resolvedV2.classroomPresence, requiredNamedCharacters: briefNamedCharacters(resolvedV2.brief) } : {}),
      ...(clarificationV2 ? { schemaVersion: 2 as const, provisionalBriefKind: clarificationV2.provisionalBriefKind } : {}),
      ...(!alignmentV2 && (alignmentDetails.storyMode === "faithful" || alignmentDetails.storyMode === "new_story") ? { storyMode: alignmentDetails.storyMode } : {}),
      ...(!alignmentV2 && (alignmentDetails.classroomPresence === "observer" || alignmentDetails.classroomPresence === "participant" || alignmentDetails.classroomPresence === "absent") ? { classroomPresence: alignmentDetails.classroomPresence } : {}),
      ...(!alignmentV2 && Array.isArray(alignmentDetails.requiredNamedCharacters) ? { requiredNamedCharacters: alignmentDetails.requiredNamedCharacters.filter((value): value is string => typeof value === "string") } : {}),
      ...(typeof workflowV2.needsBackgroundRefresh === "boolean" ? { needsBackgroundRefresh: workflowV2.needsBackgroundRefresh } : typeof alignmentDetails.needsBackgroundRefresh === "boolean" ? { needsBackgroundRefresh: alignmentDetails.needsBackgroundRefresh } : {}),
      ...(typeof workflowV2.artifactsOutdated === "boolean" ? { artifactsOutdated: workflowV2.artifactsOutdated } : typeof alignmentDetails.artifactsOutdated === "boolean" ? { artifactsOutdated: alignmentDetails.artifactsOutdated } : {}),
      ...(workflowV2.pendingChange && typeof workflowV2.pendingChange === "object" ? { pendingChange: workflowV2.pendingChange } : alignmentDetails.pendingChange && typeof alignmentDetails.pendingChange === "object" ? { pendingChange: alignmentDetails.pendingChange } : {}),
      ...(workflowV2.mainlineCard ? { mainlineCard: workflowV2.mainlineCard } : {}),
      ...(setting?.alignmentSummary ? { summary: setting.alignmentSummary } : {}),
    },
    operation: setting?.operationRequestId && (setting.operationStatus === "running" || setting.operationStatus === "failed" || setting.operationStatus === "result_unknown") && setting.operationPhase && setting.operationStartedAt ? {
      requestId: setting.operationRequestId,
      action: setting.operationAction ?? "story_operation",
      phase: setting.operationPhase as NonNullable<CourseStoryOutlineState["operation"]>["phase"],
      status: setting.operationStatus,
      errorMessage: setting.operationError ? publicStoryOutlineErrorMessage(new Error(setting.operationError)) : null,
      startedAt: setting.operationStartedAt.toISOString(),
      updatedAt: setting.updatedAt.toISOString(),
    } : null,
    directions: directions.map((direction) => toDirection(direction, coursePeople)),
    referenceMaterials: mappedReferences,
    outline: mappedOutline,
    coursePeople,
  };
}

export async function getStoryOutlineState(db: StoryOutlineDb, courseId: string) {
  return stateFromCourse(db, await getCourse(db, courseId));
}

async function addMessage(db: StoryOutlineDb, courseId: string, role: CourseStoryChatMessage["role"], content: string, actions: CourseStoryChatAction[] = []) {
  return db.courseStoryChatMessage.create({
    data: { courseId, role, content, actions },
  });
}

async function logGeneration(db: StoryOutlineDb, data: Record<string, unknown>) {
  await db.aiGenerationLog.create({ data }).catch(() => undefined);
}

async function writeOutline(db: StoryOutlineDb, course: DbCourse, outline: GeneratedOutline, writingProvider: StoryWritingProvider, chapterCount = defaultChapterCount(course.durationMinutes)) {
  const personIds = new Set((course.people ?? []).map((person) => person.personId));
  const referencedIds = outline.characters.flatMap((character) => character.sourceType === "referenced" && character.sourceReferenceId ? [character.sourceReferenceId] : []);
  for (const character of outline.characters) {
    if (character.sourceType === "person" && (!character.sourcePersonId || !personIds.has(character.sourcePersonId))) {
      throw new CourseStoryOutlineValidationError(`人物档案角色 ${character.displayName} 缺少有效人物关联`);
    }
    if (character.sourceType === "referenced" && !character.sourceReferenceId) {
      throw new CourseStoryOutlineValidationError(`引用角色 ${character.displayName} 缺少有效参考资料关联`);
    }
    if (character.sourceType === "original" && (character.sourcePersonId || character.sourceReferenceId)) {
      throw new CourseStoryOutlineValidationError(`原创角色 ${character.displayName} 不能关联人物档案或外部资料`);
    }
  }
  if (referencedIds.length) {
    const references = await db.courseSourceReference.findMany({ where: { courseId: course.id, id: { in: [...new Set(referencedIds)] } } });
    const validReferenceIds = new Set(references.map((reference) => reference.id));
    const invalid = outline.characters.find((character) => character.sourceType === "referenced" && !validReferenceIds.has(character.sourceReferenceId ?? ""));
    if (invalid) throw new CourseStoryOutlineValidationError(`引用角色 ${invalid.displayName} 的参考资料不属于当前课程`);
  }
  const saved = await db.courseStoryOutline.upsert({
    where: { courseId: course.id },
    create: {
      courseId: course.id,
      chapterCount,
      title: outline.title,
      summary: outline.summary,
      writingProvider,
    },
    update: {
      title: outline.title,
      summary: outline.summary,
      writingProvider,
    },
  });
  const characterIdsByKey = new Map<string, string>();
  const characterRows = outline.characters.map((character, index) => {
    const id = crypto.randomUUID();
    characterIdsByKey.set(character.key || `C${index + 1}`, id);
    return {
      id,
      courseId: course.id,
      displayName: character.displayName,
      englishName: character.englishName,
      sourceType: character.sourceType,
      sourcePersonId: character.sourcePersonId ?? null,
      sourceReferenceId: character.sourceReferenceId ?? null,
      roleInStory: character.roleInStory,
      shortDescription: character.shortDescription,
      visualDescription: null,
      shouldAppearInImages: true,
    };
  });
  await db.courseCharacter.deleteMany({ where: { courseId: course.id } });
  await db.courseCharacter.createMany({ data: characterRows });
  await db.courseStoryOutlineChapter.deleteMany({ where: { outlineId: saved.id } });
  await db.courseStoryOutlineChapter.createMany({
    data: outline.chapters.map((chapter) => ({
      outlineId: saved.id,
      order: chapter.order,
      title: chapter.title,
      storyGoal: proseText(chapter.whatHappens) || proseText(chapter.storyGoal),
      keyEvents: [
        chapter.characterActions,
        chapter.mainlineProgress,
        ...(chapter.keyEvents ?? []),
      ].filter((item): item is string => Boolean(item)),
      characterIds: chapter.characterKeys?.length
        ? chapter.characterKeys.map((key) => characterIdsByKey.get(key)).filter((id): id is string => Boolean(id))
        : chapter.characterIds,
      setting: chapter.setting || "",
      endingHook: chapter.endingHook || "",
      recommendedKnowledgePointIds: chapter.recommendedKnowledgePointIds ?? [],
      knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "",
    })),
  });
}

async function currentSetting(db: StoryOutlineDb, course: DbCourse, input?: Pick<CourseStoryMessageInput, "chapterCount" | "writingProvider">) {
  if (input?.chapterCount || input?.writingProvider) {
    const chapterCount = input.chapterCount ?? defaultChapterCount(course.durationMinutes);
    const writingProvider = input.writingProvider ?? "quickrouter_gpt";
    await db.courseStorySetting.upsert({
      where: { courseId: course.id },
      create: { courseId: course.id, chapterCount, writingProvider },
      update: { chapterCount, writingProvider },
    });
    return { chapterCount, writingProvider };
  }
  const setting = await db.courseStorySetting.findUnique({ where: { courseId: course.id } });
  if (!setting) {
    const chapterCount = defaultChapterCount(course.durationMinutes);
    const writingProvider: StoryWritingProvider = "quickrouter_gpt";
    await db.courseStorySetting.upsert({
      where: { courseId: course.id },
      create: { courseId: course.id, chapterCount, writingProvider },
      update: {},
    });
    return { chapterCount, writingProvider };
  }
  return {
    chapterCount: setting?.chapterCount ?? defaultChapterCount(course.durationMinutes),
    writingProvider: setting?.writingProvider ?? "quickrouter_gpt",
  };
}

async function storyAiContext(
  db: StoryOutlineDb,
  course: DbCourse,
  chapterCount: number,
  selectedDirectionOverride?: CourseStoryDirection | null,
): Promise<StoryOutlineAiContext> {
  const [messages, directions, references, characters, existingOutline, storySetting] = await Promise.all([
    db.courseStoryChatMessage.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryDirection.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseSourceReference.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseCharacter.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryOutline.findUnique({ where: { courseId: course.id }, include: { chapters: true } }),
    db.courseStorySetting.findUnique({ where: { courseId: course.id } }),
  ]);
  const mappedReferences = references.map(toReference);
  const mappedCharacters = characters.map(toCharacter);
  const coursePeople = toCoursePeople(course);
  const selectedIds = Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const selectedKnowledgePoints = await resolveGrammarKnowledgePoints(db, selectedIds);
  const alignmentDetails = typeof storySetting?.alignmentDetails === "object" && storySetting.alignmentDetails !== null
    ? storySetting.alignmentDetails as Partial<StoryAlignmentState>
    : {};
  const alignmentV2 = isAlignmentDetailsV2(storySetting?.alignmentDetails) ? storySetting.alignmentDetails : null;
  const resolvedV2 = alignmentV2?.requirement.kind === "resolved" ? alignmentV2.requirement : null;
  return {
    chapterCount,
    coursePeople,
    conversationHistory: messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content })),
    references: mappedReferences.filter((reference) => Boolean(reference.confirmedAt)),
    currentDirections: directions.map((direction) => toDirection(direction, coursePeople)).filter((direction) => !direction.selectedAt),
    selectedDirection: selectedDirectionOverride === undefined
      ? directions.map((direction) => toDirection(direction, coursePeople)).find((direction) => direction.selectedAt) ?? null
      : selectedDirectionOverride,
    currentOutline: toOutline(existingOutline, mappedReferences, mappedCharacters),
    englishLevel: course.englishLevel ?? undefined,
    durationMinutes: course.durationMinutes as 30 | 45 | 60,
    selectedKnowledgePoints,
    confirmedRequirement: resolvedV2 ? JSON.stringify(resolvedV2.brief) : storySetting?.alignmentSummary ?? undefined,
    requirementBrief: resolvedV2?.brief,
    storyMode: resolvedV2?.storyMode ?? alignmentDetails.storyMode,
    classroomPresence: resolvedV2?.classroomPresence ?? alignmentDetails.classroomPresence,
    requiredNamedCharacters: resolvedV2 ? briefNamedCharacters(resolvedV2.brief) : Array.isArray(alignmentDetails.requiredNamedCharacters)
      ? alignmentDetails.requiredNamedCharacters.filter((value): value is string => typeof value === "string")
      : [],
    mainlineCard: alignmentV2?.workflow?.mainlineCard,
  };
}

type OperationGuard = (db?: StoryOutlineDb) => Promise<void>;

async function generateAndSaveOutline(db: StoryOutlineDb, course: DbCourse, task: string, deps: StoryOutlineGenerationDeps, setting?: { chapterCount: number; writingProvider: StoryWritingProvider }, selectedDirection?: CourseStoryDirection | null, guard?: OperationGuard) {
  const started = Date.now();
  try {
    const resolved = setting ?? await currentSetting(db, course);
    const context = await storyAiContext(db, course, resolved.chapterCount, selectedDirection);
    const isUpdate = Boolean(context.currentOutline);
    const generationContext: StoryOutlineAiContext = selectedDirection
      ? {
          ...context,
          conversationHistory: [],
          currentDirections: [],
          currentOutline: null,
          selectedDirection,
        }
      : context;
    const outline = await deps.generateOutline({
      ...generationContext,
      task,
      writingProvider: resolved.writingProvider,
    });
    const allowedIds = new Set(context.selectedKnowledgePoints?.map((item) => item.id) ?? []);
    if (allowedIds.size && outline.chapters.some((chapter) => chapter.recommendedKnowledgePointIds?.some((id) => !allowedIds.has(id)) || (chapter.recommendedKnowledgePointIds?.length && !chapter.knowledgePointRecommendationSummary?.trim()))) {
      throw new CourseStoryOutlineValidationError("章节知识点推荐没有完整生成，请重试本次大纲。");
    }
    const persistOutline = async (tx: StoryOutlineDb) => {
      await guard?.(tx);
      await writeOutline(tx, course, outline, resolved.writingProvider, resolved.chapterCount);
      await updateAlignmentDetails(tx, course.id, { artifactsOutdated: false });
      await addMessage(tx, course.id, "assistant", isUpdate
        ? "故事大纲已更新，右侧显示的是最新版本。"
        : "故事大纲已生成，右侧显示的是最新版本。");
    };
    if (db.$transaction) await db.$transaction(persistOutline);
    else await persistOutline(db);
    await logGeneration(db, {
      courseId: course.id,
      stage: "story_outline",
      operation: "generate_outline",
      status: "succeeded",
      writingProvider: resolved.writingProvider,
      researchProvider: context.references.length ? "quickrouter_gpt" : "none",
      inputSnapshot: { task, conversationHistory: generationContext.conversationHistory, references: generationContext.references },
      outputSnapshot: outline,
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    await logGeneration(db, {
      courseId: course.id,
      stage: "story_outline",
      operation: "generate_outline",
      status: "failed",
      writingProvider: setting?.writingProvider ?? "quickrouter_gpt",
      researchProvider: "none",
      inputSnapshot: { task },
      errorMessage: error instanceof Error ? error.message : "故事大纲生成失败",
      latencyMs: Date.now() - started,
    });
    throw error;
  }
}

async function generateAndSaveDirections(
  db: StoryOutlineDb,
  course: DbCourse,
  deps: StoryOutlineGenerationDeps,
  chapterCount: number,
  assistantMessage = "我生成了 3 个故事方向，你可以选一个继续。",
  guard?: OperationGuard,
) {
  const context = await storyAiContext(db, course, chapterCount);
  const directions = await deps.generateDirections({
    ...context,
    task: "根据老师当前要求和已确认资料生成 3 个故事方向。",
  });
  const replaceDirections = async (tx: StoryOutlineDb) => {
    await guard?.(tx);
    await tx.courseStoryDirection.deleteMany({ where: { courseId: course.id } });
    await tx.courseStoryDirection.createMany({ data: directions.map((direction) => ({
      courseId: course.id,
      ...direction,
      storyHighlight: direction.storyHighlight ?? "",
      growthCore: direction.growthCore ?? "",
      classroomValue: direction.classroomValue ?? "",
    })) });
    await tx.courseStoryOutline.deleteMany({ where: { courseId: course.id } });
    await tx.courseCharacter.deleteMany({ where: { courseId: course.id } });
    await updateAlignmentDetails(tx, course.id, { artifactsOutdated: false });
  };
  if (db.$transaction) await db.$transaction(replaceDirections);
  else await replaceDirections(db);
  await addMessage(db, course.id, "assistant", assistantMessage);
}

async function saveAlignment(
  db: StoryOutlineDb,
  course: DbCourse,
  setting: { chapterCount: number; writingProvider: StoryWritingProvider },
  alignment: {
    status: "needs_clarification" | "ready_for_confirmation" | "confirmed";
    planningMode: "explore_options" | "follow_defined_plot";
    storyMode?: "faithful" | "new_story";
    classroomPresence?: "observer" | "participant" | "absent";
    requiredNamedCharacters?: string[];
    provisionalBriefKind?: StoryRequirementBrief["kind"];
    brief?: StoryRequirementBrief;
    resolvedUnderstanding: string[];
    unresolvedIssues: string[];
    questions: StoryAlignmentQuestion[];
    summary?: string;
    needsBackgroundRefresh?: boolean;
    artifactsOutdated?: boolean;
    replyContext?: "initial" | "requirement_change";
  },
) {
  const stored = await db.courseStorySetting.findUnique({ where: { courseId: course.id } });
  const previousDetails = typeof stored?.alignmentDetails === "object" && stored.alignmentDetails !== null
    ? stored.alignmentDetails as Record<string, unknown>
    : {};
  const previousWorkflow: NonNullable<AlignmentDetailsV2["workflow"]> = isAlignmentDetailsV2(previousDetails) ? previousDetails.workflow ?? {} : {
    ...(typeof previousDetails.needsBackgroundRefresh === "boolean" ? { needsBackgroundRefresh: previousDetails.needsBackgroundRefresh } : {}),
    ...(typeof previousDetails.artifactsOutdated === "boolean" ? { artifactsOutdated: previousDetails.artifactsOutdated } : {}),
    ...(previousDetails.pendingChange && typeof previousDetails.pendingChange === "object" ? { pendingChange: previousDetails.pendingChange as StoryAlignmentState["pendingChange"] } : {}),
  };
  const workflowWithoutMainline: NonNullable<AlignmentDetailsV2["workflow"]> = {
    ...(typeof previousWorkflow.needsBackgroundRefresh === "boolean" ? { needsBackgroundRefresh: previousWorkflow.needsBackgroundRefresh } : {}),
    ...(typeof previousWorkflow.artifactsOutdated === "boolean" ? { artifactsOutdated: previousWorkflow.artifactsOutdated } : {}),
    ...(previousWorkflow.pendingChange !== undefined ? { pendingChange: previousWorkflow.pendingChange } : {}),
  };
  const workflow = {
    ...workflowWithoutMainline,
    ...(typeof alignment.needsBackgroundRefresh === "boolean" ? { needsBackgroundRefresh: alignment.needsBackgroundRefresh } : {}),
    ...(typeof alignment.artifactsOutdated === "boolean" ? { artifactsOutdated: alignment.artifactsOutdated } : {}),
  };
  const alignmentDetails: AlignmentDetailsV2 = alignment.status === "needs_clarification"
    ? {
        schemaVersion: 2,
        requirement: {
          kind: "clarification",
          ...(alignment.provisionalBriefKind ? { provisionalBriefKind: alignment.provisionalBriefKind } : {}),
          resolvedRequirements: alignment.resolvedUnderstanding,
          questions: alignment.questions,
        },
        workflow,
      }
    : {
        schemaVersion: 2,
        requirement: {
          kind: "resolved",
          storyMode: alignment.storyMode ?? "new_story",
          classroomPresence: alignment.classroomPresence ?? "participant",
          brief: alignment.brief ?? {
            kind: "narrative",
            objective: alignment.summary ?? (alignment.resolvedUnderstanding.join("；") || "按老师已确认的要求创作课程故事"),
            sourceRequirements: [],
            requiredNamedCharacters: alignment.requiredNamedCharacters ?? [],
            fixedPlot: alignment.planningMode === "follow_defined_plot" ? alignment.summary ?? null : null,
            additionalConstraints: { required: [], preferred: [], excluded: [] },
          },
        },
        workflow,
      };
  const resolvedRequirement = alignmentDetails.requirement.kind === "resolved" ? alignmentDetails.requirement : null;
  const summary = resolvedRequirement
    ? renderRequirementConfirmation(
        resolvedRequirement.brief,
        alignment.planningMode,
        resolvedRequirement.storyMode,
        resolvedRequirement.classroomPresence,
        alignment.replyContext ?? "initial",
        workflow.needsBackgroundRefresh !== false,
      )
    : null;
  await db.courseStorySetting.upsert({
    where: { courseId: course.id },
    create: {
      courseId: course.id,
      chapterCount: setting.chapterCount,
      writingProvider: setting.writingProvider,
      alignmentStatus: alignment.status,
      planningMode: alignment.planningMode,
      alignmentSummary: summary,
      alignmentDetails,
      alignmentConfirmedAt: alignment.status === "confirmed" ? new Date() : null,
    },
    update: {
      alignmentStatus: alignment.status,
      planningMode: alignment.planningMode,
      alignmentSummary: summary,
      alignmentDetails,
      alignmentConfirmedAt: alignment.status === "confirmed" ? new Date() : null,
    },
  });
}

async function continueAfterBackground(
  db: StoryOutlineDb,
  course: DbCourse,
  deps: StoryOutlineGenerationDeps,
  setting: { chapterCount: number; writingProvider: StoryWritingProvider },
  guard?: OperationGuard,
) {
  const stored = await db.courseStorySetting.findUnique({ where: { courseId: course.id } });
  if (stored?.planningMode === "follow_defined_plot") {
    const detailsV2 = isAlignmentDetailsV2(stored.alignmentDetails) ? stored.alignmentDetails : null;
    if (detailsV2?.requirement.kind === "resolved") {
      if (detailsV2.workflow?.mainlineCard?.status === "pending_confirmation") return;
      const context = await storyAiContext(db, course, setting.chapterCount);
      const generated = await deps.generateMainlineCard({
        ...context,
        requirementBrief: detailsV2.requirement.brief,
        task: "根据已确认需求整理主线理解卡，供老师确认后再生成章节大纲。",
      });
      await guard?.();
      const mainlineCard: StoryMainlineCard = { ...generated, status: "pending_confirmation" };
      await updateAlignmentDetails(db, course.id, { mainlineCard });
      await addMessage(db, course.id, "assistant", renderMainlineCard(mainlineCard, context.coursePeople), [
        { id: `confirm-mainline-${Date.now()}`, label: "确认主线并生成大纲", action: "confirm_mainline" },
        { id: `revise-mainline-${Date.now()}`, label: "修改主线理解", action: "revise_mainline" },
      ]);
      return;
    }
    await addMessage(db, course.id, "system", "创作需求已确认，正在生成章节大纲。");
    await generateAndSaveOutline(db, course, "根据已确认的具体剧情生成完整故事大纲。", deps, setting, undefined, guard);
    return;
  }
  await addMessage(db, course.id, "system", "创作需求已确认，正在创作 3 个不同的故事方向。");
  await generateAndSaveDirections(db, course, deps, setting.chapterCount, undefined, guard);
}

function renderMainlineCard(card: StoryMainlineCard, coursePeople: CourseAudiencePerson[] = []) {
  const peopleNames = new Map(coursePeople.map((person) => [person.personId, person.chineseName || person.englishName]));
  return [
    "请确认故事主线：",
    `主角结构：${card.protagonistStructure}`,
    ...(card.classroomRoles.length ? [`课堂人物作用：${card.classroomRoles.map((item) => `${peopleNames.get(item.personId) ?? item.personId}—${item.roleInStory}`).join("；")}`] : []),
    `触发事件：${card.incitingEvent}`,
    `共同目标：${card.goal}`,
    `主要阻力：${card.mainObstacle}`,
    `推进方式：${card.progression}`,
    `结局方向：${card.endingDirection}`,
    ...(card.mustKeep.length ? [`必须保留：${card.mustKeep.join("；")}`] : []),
    ...(card.mayExpand.length ? [`允许补充：${card.mayExpand.join("；")}`] : []),
  ].join("\n");
}

type InternalStoryMessageInput = CourseStoryMessageInput & { isRetry?: boolean; operationRevision?: number };

async function assertCurrentOperation(db: StoryOutlineDb, courseId: string, input: InternalStoryMessageInput) {
  if (!input.requestId || input.operationRevision === undefined) return;
  const setting = await db.courseStorySetting.findUnique({ where: { courseId } });
  if (setting?.operationRequestId !== input.requestId || setting.operationStatus !== "running" || (setting.stateRevision ?? 0) !== input.operationRevision) {
    throw new CourseStoryOutlineOperationConflictError("当前结果已被更新的操作取代");
  }
}

function operationPhase(input: CourseStoryMessageInput): NonNullable<CourseStoryOutlineState["operation"]>["phase"] {
  if (input.action === "choose_reference_search" || input.action === "request_reference_search") return "searching_reference";
  if (input.action === "confirm_requirements") return "preparing_reference";
  if (input.action === "generate_directions") return "generating_directions";
  if (input.action === "confirm_direction" || input.action === "confirm_mainline" || input.action === "generate_from_reference" || input.action === "regenerate_outline") return "generating_outline";
  if (input.action === "revise_direction" || input.action === "revise_mainline" || input.action === "revise_outline" || input.action === "revise_chapter" || input.action === "confirm_story_change") return "revising";
  return "aligning";
}

async function executeStoryOutlineMessage(
  db: StoryOutlineDb,
  courseId: string,
  input: InternalStoryMessageInput,
  deps: StoryOutlineGenerationDeps,
) {
  const course = await getCourse(db, courseId);
  const setting = await currentSetting(db, course, input);
  let requiredQuestionIds: string[] = [];
  if (input.action === "submit_alignment_answers" && Array.isArray(input.alignmentAnswers)) {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const questions = alignmentQuestionsFromDetails(stored?.alignmentDetails);
    if (!questions.length) throw new CourseStoryOutlineValidationError("当前没有等待回答的问题");
    const answeredIds = new Set(input.alignmentAnswers.map((answer) => answer.questionId));
    requiredQuestionIds = questions.filter((question) => !answeredIds.has(question.id)).map((question) => question.id);
    input.message = renderStructuredAlignmentAnswers(questions, input.alignmentAnswers);
  }
  const guard: OperationGuard = (targetDb = db) => assertCurrentOperation(targetDb, courseId, input);
  const markAlignmentFormatRepair = async () => {
    await guard();
    await db.courseStorySetting.updateMany({
      where: { courseId, operationRequestId: input.requestId, operationStatus: "running" },
      data: { operationPhase: "repairing_alignment_format" },
    });
  };
  if (input.message.trim() && !input.isRetry && input.action !== "confirm_requirements") {
    await addMessage(db, courseId, "teacher", input.message.trim());
  }
  const rerouteRequirementChange = async (targetScope: "direction" | "outline" | "chapter") => {
    if (!input.message.trim()) return null;
    const context = await storyAiContext(db, course, setting.chapterCount);
    const boundary = await deps.checkChangeBoundary({ ...context, task: input.message.trim(), targetScope });
    await guard();
    if (boundary.scope === "within_target") return null;
    const kind = boundary.scope === "outline_revision" ? "outline_revision" : "requirement_change";
    const pendingChangeId = crypto.randomUUID();
    await updateAlignmentDetails(db, courseId, {
      pendingChange: {
        id: pendingChangeId,
        kind,
        request: input.message.trim(),
        reason: boundary.reason,
        targetScope,
        needsBackgroundRefresh: boundary.needsBackgroundRefresh,
      },
    });
    const impactCopy = kind === "requirement_change"
      ? `${boundary.reason}。这会调整当前创作需求，但会保留课程信息、人物档案、教学要求和聊天记录；确认新的创作理解前，不会替换现有成果。是否继续？`
      : `${boundary.reason}。这会基于当前要求调整完整大纲，现有内容会保留到新版大纲生成成功。是否继续？`;
    await addMessage(db, courseId, "assistant", impactCopy, [
      {
        id: `confirm-story-change-${Date.now()}`,
        label: kind === "requirement_change" ? "调整创作需求并继续" : "调整整体大纲并继续",
        action: "confirm_story_change",
        targetId: pendingChangeId,
      },
      { id: `cancel-story-change-${Date.now()}`, label: "保留当前内容", action: "cancel_story_change", targetId: pendingChangeId },
    ]);
    return getStoryOutlineState(db, courseId);
  };
  if (input.action === "confirm_reference_materials" && !input.message.trim()) {
    await addMessage(db, courseId, "teacher", "我确认这些参考资料，请继续。");
  }
  if (input.action === "choose_story_usage" && !input.message.trim()) {
    if (input.targetId !== "follow_original" && input.targetId !== "create_new" && input.targetId !== "faithful" && input.targetId !== "new_story") {
      throw new CourseStoryOutlineValidationError("请选择一种故事讲述方式");
    }
    const usageMessage = input.targetId === "follow_original" || input.targetId === "faithful"
      ? "我选择忠实讲述，保留原作或史实的关键事件、因果和结局；老师和学生默认进入场景旁观，但不推动原事件。"
      : "我选择创作新故事，老师和学生作为参与者，通过具体行动推动新的故事事件。";
    await addMessage(db, courseId, "teacher", usageMessage);
  }

  if (input.action === "cancel_story_change") {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const details = alignmentWorkflowDetails(stored?.alignmentDetails);
    if (!details.pendingChange) throw new CourseStoryOutlineValidationError("当前没有等待确认的故事修改");
    if (input.targetId && input.targetId !== details.pendingChange.id) throw new CourseStoryOutlineValidationError("这项修改确认已经失效，请使用最新提示");
    await updateAlignmentDetails(db, courseId, { pendingChange: null });
    await addMessage(db, courseId, "assistant", "已保留当前内容，本次修改没有应用。你可以继续查看或提出其他调整。");
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_story_change") {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const details = alignmentWorkflowDetails(stored?.alignmentDetails);
    const pendingChange = details.pendingChange;
    if (!pendingChange) throw new CourseStoryOutlineValidationError("当前没有等待确认的故事修改");
    if (input.targetId && input.targetId !== pendingChange.id) throw new CourseStoryOutlineValidationError("这项修改确认已经失效，请使用最新提示");
    if (!input.isRetry) {
      await addMessage(db, courseId, "teacher", pendingChange.kind === "requirement_change" ? "我确认调整创作需求并继续。" : "我确认调整整体大纲并继续。");
    }
    if (pendingChange.kind === "outline_revision") {
      await addMessage(db, courseId, "system", "正在基于当前要求调整完整大纲。");
      await generateAndSaveOutline(db, course, `修改当前完整大纲：${pendingChange.request}`, deps, setting, undefined, guard);
      await updateAlignmentDetails(db, courseId, { pendingChange: null });
      return getStoryOutlineState(db, courseId);
    }
    const context = await storyAiContext(db, course, setting.chapterCount);
    const alignment = await deps.alignRequirements({
      ...context,
      replyContext: "requirement_change",
      needsBackgroundRefresh: pendingChange.needsBackgroundRefresh,
      onFormatRepair: markAlignmentFormatRepair,
      task: `老师已确认调整当前创作需求。请保留没有受到影响的既有要求，只把最新修改整理进新的创作理解，不执行故事生成。\n调整原因：${pendingChange.reason}\n老师要求：${pendingChange.request}`,
    });
    await guard();
    await saveAlignment(db, course, setting, {
      ...alignment,
      needsBackgroundRefresh: pendingChange.needsBackgroundRefresh,
      artifactsOutdated: true,
      replyContext: "requirement_change",
    });
    await updateAlignmentDetails(db, courseId, { pendingChange: null });
    if (alignment.status === "needs_clarification") {
      await addMessage(db, courseId, "assistant", alignment.assistantMessage, [{
        id: `alignment-${Date.now()}`,
        label: "提交回答",
        action: "submit_alignment_answers",
        questions: alignment.questions,
      }]);
    } else {
      const confirmation = alignment.brief
        ? renderRequirementConfirmation(alignment.brief, alignment.planningMode, alignment.storyMode, alignment.classroomPresence, "requirement_change", pendingChange.needsBackgroundRefresh)
        : alignment.summary || alignment.assistantMessage;
      await addMessage(db, courseId, "assistant", confirmation, [
        { id: "confirm-requirements", label: "确认修改需求", action: "confirm_requirements" },
        { id: "modify-requirements", label: "调整我的意思", action: "modify_requirements" },
      ]);
    }
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_requirements") {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    if (!stored?.alignmentSummary || (stored.alignmentStatus !== "ready_for_confirmation" && !(input.isRetry && stored.alignmentStatus === "confirmed"))) {
      throw new CourseStoryOutlineValidationError("请先完成并确认创作理解");
    }
    const details = typeof stored.alignmentDetails === "object" && stored.alignmentDetails !== null
      ? stored.alignmentDetails as Partial<StoryAlignmentState>
      : {};
    const detailsV2 = isAlignmentDetailsV2(stored.alignmentDetails) ? stored.alignmentDetails : null;
    const resolvedV2 = detailsV2?.requirement.kind === "resolved" ? detailsV2.requirement : null;
    const workflowV2 = detailsV2?.workflow ?? {};
    if (stored.alignmentStatus !== "confirmed") {
      if (resolvedV2) {
        await saveAlignment(db, course, setting, {
          status: "confirmed",
          planningMode: stored.planningMode ?? "explore_options",
          storyMode: resolvedV2.storyMode,
          classroomPresence: resolvedV2.classroomPresence,
          requiredNamedCharacters: briefNamedCharacters(resolvedV2.brief),
          brief: resolvedV2.brief,
          resolvedUnderstanding: [],
          unresolvedIssues: [],
          questions: [],
          summary: stored.alignmentSummary,
          needsBackgroundRefresh: workflowV2.needsBackgroundRefresh,
          artifactsOutdated: workflowV2.artifactsOutdated,
        });
      } else {
        await db.courseStorySetting.updateMany({
          where: { courseId },
          data: { alignmentStatus: "confirmed", alignmentConfirmedAt: new Date() },
        });
      }
      await addMessage(db, courseId, "teacher", "我确认这份创作理解。");
    }
    const shouldRefreshBackground = (workflowV2.needsBackgroundRefresh ?? details.needsBackgroundRefresh) !== false;
    if (!shouldRefreshBackground) {
      await addMessage(db, courseId, "system", "创作需求已确认，将沿用现有背景资料继续创作。");
      await continueAfterBackground(db, course, deps, setting, guard);
      return getStoryOutlineState(db, courseId);
    }
    await addMessage(db, courseId, "system", "创作需求已确认，正在准备故事所需的背景知识。");
    const context = await storyAiContext(db, course, setting.chapterCount);
    const background = await deps.prepareBackgroundKnowledge({
      ...context,
      task: "根据老师确认的创作理解，为后续故事生成准备一次必要背景知识。",
      confirmedRequirement: resolvedV2 ? JSON.stringify(resolvedV2.brief) : stored.alignmentSummary,
    });
    await guard();
    if (background.status === "not_needed") {
      if ((workflowV2.needsBackgroundRefresh ?? details.needsBackgroundRefresh) === true) {
        await db.courseSourceReference.deleteMany({ where: { courseId } });
        await updateAlignmentDetails(db, courseId, { needsBackgroundRefresh: false });
      }
      await continueAfterBackground(db, course, deps, setting, guard);
      return getStoryOutlineState(db, courseId);
    }
    if (background.status === "external_required") {
      await addMessage(db, courseId, "assistant", background.reason, [
        { id: "supply-reference-material", label: "我来补充资料", action: "supply_reference_material", researchPlan: background.researchPlan },
        { id: "choose-reference-search", label: "联网整理资料", action: "choose_reference_search", researchPlan: background.researchPlan },
      ]);
      return getStoryOutlineState(db, courseId);
    }
    await persistPreparedReferences(db, courseId, background.references, (workflowV2.needsBackgroundRefresh ?? details.needsBackgroundRefresh) === true);
    await addMessage(db, courseId, "assistant", "背景资料已整理，请确认后继续。", [
      { id: "confirm-background-materials", label: "确认资料并继续", action: "confirm_reference_materials" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_mainline") {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const detailsV2 = isAlignmentDetailsV2(stored?.alignmentDetails) ? stored.alignmentDetails : null;
    const mainlineCard = detailsV2?.workflow?.mainlineCard;
    if (!detailsV2 || detailsV2.requirement.kind !== "resolved" || !mainlineCard) throw new CourseStoryOutlineValidationError("当前没有等待确认的主线理解卡");
    if (mainlineCard.status !== "pending_confirmation" && !(input.isRetry && mainlineCard.status === "confirmed")) throw new CourseStoryOutlineValidationError("主线理解卡已经更新，请使用最新内容");
    if (mainlineCard.status !== "confirmed") {
      await updateAlignmentDetails(db, courseId, { mainlineCard: { ...mainlineCard, status: "confirmed", confirmedAt: new Date().toISOString() } });
      await addMessage(db, courseId, "teacher", "我确认这份故事主线，请生成故事大纲。");
    }
    await addMessage(db, courseId, "system", "故事主线已确认，正在生成章节大纲。");
    await generateAndSaveOutline(db, course, "根据已确认的需求和主线理解卡生成完整故事大纲。", deps, setting, undefined, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_mainline") {
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样调整故事主线");
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const detailsV2 = isAlignmentDetailsV2(stored?.alignmentDetails) ? stored.alignmentDetails : null;
    const currentMainline = detailsV2?.workflow?.mainlineCard;
    if (!detailsV2 || detailsV2.requirement.kind !== "resolved" || !currentMainline) throw new CourseStoryOutlineValidationError("当前没有可以修改的主线理解卡");
    const context = await storyAiContext(db, course, setting.chapterCount);
    const generated = await deps.generateMainlineCard({
      ...context,
      requirementBrief: detailsV2.requirement.brief,
      task: `只调整当前主线理解卡，不改变已确认需求。\n当前主线：${JSON.stringify(currentMainline)}\n老师修改：${input.message.trim()}`,
    });
    await guard();
    const nextMainline: StoryMainlineCard = { ...generated, status: "pending_confirmation" };
    await updateAlignmentDetails(db, courseId, { mainlineCard: nextMainline });
    await addMessage(db, courseId, "assistant", renderMainlineCard(nextMainline, context.coursePeople), [
      { id: `confirm-mainline-${Date.now()}`, label: "确认主线并生成大纲", action: "confirm_mainline" },
      { id: `revise-mainline-${Date.now()}`, label: "继续修改主线", action: "revise_mainline" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_direction") {
    const rerouted = await rerouteRequirementChange("direction");
    if (rerouted) return rerouted;
    const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
      .map((direction) => toDirection(direction, toCoursePeople(course)))
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择要调整的故事方向");
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样调整这个方向");
    const context = await storyAiContext(db, course, setting.chapterCount, direction);
    const revised = await deps.reviseDirection({ ...context, direction, task: input.message.trim() });
    await guard();
    await db.courseStoryDirection.update({
      where: { id: direction.id },
      data: { ...revised },
    });
    await addMessage(db, courseId, "assistant", `已调整故事方向“${revised.title}”，其他方向保持不变。`);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_direction") {
    const storedDirections = await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } });
    const direction = storedDirections.map((item) => toDirection(item, toCoursePeople(course))).find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
    const selectedAt = direction.selectedAt ? new Date(direction.selectedAt) : new Date();
    for (const storedDirection of storedDirections) {
      if (storedDirection.id !== direction.id && storedDirection.selectedAt) {
        await db.courseStoryDirection.update({ where: { id: storedDirection.id }, data: { selectedAt: null } });
      }
    }
    if (!direction.selectedAt) {
      await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt } });
      await addMessage(db, courseId, "teacher", `我选择并生成故事大纲：${direction.title}`);
    }
    await addMessage(db, courseId, "system", "故事方向已确认，正在生成章节大纲和教学知识点建议。");
    const task = `请基于已确认方向生成大纲：${direction.title}`;
    await generateAndSaveOutline(db, course, task, deps, setting, { ...direction, selectedAt: selectedAt.toISOString() }, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_outline") {
    const rerouted = await rerouteRequirementChange("outline");
    if (rerouted) return rerouted;
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样修改整体大纲");
    await addMessage(db, courseId, "system", "正在按你的要求调整整体大纲。");
    await generateAndSaveOutline(db, course, `修改当前完整大纲：${input.message.trim()}`, deps, setting, undefined, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_chapter") {
    const rerouted = await rerouteRequirementChange("chapter");
    if (rerouted) return rerouted;
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样修改这一章");
    if (!input.targetChapterOrder) throw new CourseStoryOutlineValidationError("请选择要修改的章节");
    const current = await getStoryOutlineState(db, courseId);
    const target = current.outline?.chapters.find((chapter) => chapter.order === input.targetChapterOrder);
    if (!target) throw new CourseStoryOutlineValidationError("没有找到要修改的章节");
    const context = await storyAiContext(db, course, setting.chapterCount);
    const result = await deps.reviseChapter({ ...context, task: input.message.trim(), chapterOrder: input.targetChapterOrder });
    await guard();
    if (result.status === "requires_outline_revision") {
      await addMessage(db, courseId, "assistant", `${result.reason} 你可以使用“修改整体大纲”。`);
      return getStoryOutlineState(db, courseId);
    }
    const validCharacterIds = new Set(current.outline?.characters.map((character) => character.id) ?? []);
    await db.courseStoryOutlineChapter.update({
      where: { id: target.id },
      data: {
        title: result.chapter.title || target.title,
        storyGoal: result.chapter.whatHappens || target.whatHappens || target.storyGoal,
        keyEvents: [],
        characterIds: result.chapter.characterIds.filter((id) => validCharacterIds.has(id)),
        recommendedKnowledgePointIds: result.chapter.recommendedKnowledgePointIds ?? [],
        knowledgePointRecommendationSummary: result.chapter.knowledgePointRecommendationSummary ?? "",
      },
    });
    await addMessage(db, courseId, "assistant", `第 ${target.order} 章已调整，其他章节和角色保持不变。`);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_reference_materials") {
    const references = await db.courseSourceReference.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } });
    for (const reference of references) {
      if (!reference.confirmedAt) await db.courseSourceReference.update({ where: { id: reference.id }, data: { confirmedAt: new Date() } });
    }
    await continueAfterBackground(db, course, deps, setting, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "request_reference_search" || input.action === "choose_reference_search") {
    if (!input.message.trim()) {
      await addMessage(db, courseId, "teacher", `请联网整理参考资料：${input.targetId || "当前引用对象"}`);
    }
    await addMessage(db, courseId, "assistant", "正在联网整理参考资料...");
    const objectName = input.targetId || input.message || "当前引用对象";
    const researchPlan = input.researchPlan ?? fallbackResearchPlan(objectName);
    const context = await storyAiContext(db, course, setting.chapterCount);
    const generatedReferences = await deps.searchReference({
      ...context,
      task: "按照研究计划联网整理可直接用于当前故事的参考资料。",
      researchPlan,
    });
    await guard();
    const incompletePackets = researchPlan.packets.filter((_, index) => {
      const reference = generatedReferences[index];
      return !reference
        || reference.sourceStatus === "insufficient"
        || !reference.summary?.trim()
        || !reference.usableFacts?.length;
    });
    if (generatedReferences.length !== researchPlan.packets.length || incompletePackets.length) {
      const missingNames = incompletePackets.map((packet) => packet.title).join("、") || objectName;
      await addMessage(db, courseId, "assistant", `联网搜索没有整理出足够完整、可用于创作的“${missingNames}”资料。请手动补充原文梗概、主要角色和关键剧情。`, [
        { id: "supply-missing-reference-material", label: "我来补充资料", action: "supply_reference_material", targetId: missingNames, researchPlan },
      ]);
      return getStoryOutlineState(db, courseId);
    }
    const referencesToPersist = generatedReferences.map((generatedReference, index) => {
      const packet = researchPlan.packets[index];
      return safeReferenceForWrite(
        generatedReference,
        packet?.title || objectName,
        `关于${packet?.title || objectName}的联网参考资料。`,
      );
    });
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    const details = alignmentWorkflowDetails(stored?.alignmentDetails);
    await persistPreparedReferences(db, courseId, referencesToPersist, details.needsBackgroundRefresh === true, "quickrouter_gpt");
    await addMessage(db, courseId, "assistant", "资料已整理，请确认后继续。", [
      { id: "confirm-reference-materials", label: "确认参考资料并继续", action: "confirm_reference_materials" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_directions") {
    const task = input.message.trim() || "我确认参考资料，请生成 3 个故事方向。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "已收到你的要求，正在创作 3 个不同的故事方向。");
    await generateAndSaveDirections(db, course, deps, setting.chapterCount, undefined, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_from_reference") {
    const task = input.message.trim() || "请用已确认的参考资料生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "参考资料和故事要求已确认，正在生成章节大纲。");
    await generateAndSaveOutline(db, course, task, deps, setting, undefined, guard);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "choose_direction") {
    const storedDirections = await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } });
    const direction = storedDirections.map((item) => toDirection(item, toCoursePeople(course)))
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
    for (const storedDirection of storedDirections) {
      if (storedDirection.id !== direction.id && storedDirection.selectedAt) {
        await db.courseStoryDirection.update({ where: { id: storedDirection.id }, data: { selectedAt: null } });
      }
    }
    await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt: new Date() } });
    const selectionMessage = `我选择故事方向：${direction.title}`;
    await addMessage(db, courseId, "teacher", selectionMessage);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "regenerate_outline") {
    const task = input.message.trim() || "请基于当前全部要求重新生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "已收到修改要求，正在重新生成章节大纲。");
    await generateAndSaveOutline(db, course, task, deps, setting, undefined, guard);
    return getStoryOutlineState(db, courseId);
  }

  const context = await storyAiContext(db, course, setting.chapterCount);
  const alignment = await deps.alignRequirements({
    ...context,
    onFormatRepair: markAlignmentFormatRepair,
    ...(requiredQuestionIds.length ? { requiredQuestionIds } : {}),
    task: input.message.trim() || "根据老师最新回答继续对齐大体创作需求。",
  });
  await guard();
  await saveAlignment(db, course, setting, alignment);
  if (alignment.status === "needs_clarification") {
    await addMessage(db, courseId, "assistant", alignment.assistantMessage, [
      {
        id: `alignment-${Date.now()}`,
        label: "提交回答",
        action: "submit_alignment_answers",
        questions: alignment.questions,
      },
    ]);
    return getStoryOutlineState(db, courseId);
  }
  const confirmation = alignment.brief
    ? renderRequirementConfirmation(alignment.brief, alignment.planningMode, alignment.storyMode, alignment.classroomPresence)
    : alignment.summary || alignment.assistantMessage;
  await addMessage(db, courseId, "assistant", confirmation, [
    { id: "confirm-requirements", label: "确认需求", action: "confirm_requirements" },
    { id: "modify-requirements", label: "修改需求", action: "modify_requirements" },
  ]);
  return getStoryOutlineState(db, courseId);
}

export async function handleStoryOutlineMessage(
  db: StoryOutlineDb,
  courseId: string,
  originalInput: CourseStoryMessageInput,
  deps: StoryOutlineGenerationDeps,
) {
  const course = await getCourse(db, courseId);
  await currentSetting(db, course, originalInput);
  const before = await db.courseStorySetting.findUnique({ where: { courseId } });
  const requestId = originalInput.requestId ?? crypto.randomUUID();
  if (before?.operationRequestId === requestId) return getStoryOutlineState(db, courseId);
  if (originalInput.action !== "retry_operation" && originalInput.expectedStateRevision !== undefined && originalInput.expectedStateRevision !== (before?.stateRevision ?? 0)) {
    throw new CourseStoryOutlineOperationConflictError("问题或确认卡已经更新，请使用最新内容继续");
  }
  if (before?.operationStatus === "running") throw new CourseStoryOutlineOperationConflictError();

  let input: InternalStoryMessageInput = { ...originalInput, requestId };
  if (originalInput.action === "retry_operation") {
    if (before?.operationStatus !== "failed" || typeof before.operationInput !== "object" || before.operationInput === null) {
      throw new CourseStoryOutlineValidationError("当前没有可以重试的失败步骤");
    }
    if (originalInput.targetId && originalInput.targetId !== before.operationRequestId) {
      throw new CourseStoryOutlineValidationError("该失败步骤已被更新，请使用最新的重试操作");
    }
    input = { ...(before.operationInput as CourseStoryMessageInput), requestId, isRetry: true };
  }
  const startedAt = new Date();
  const previousRevision = before?.stateRevision ?? 0;
  const operationRevision = previousRevision + 1;
  input.operationRevision = operationRevision;
  const persistedInput = JSON.parse(JSON.stringify({ ...input, requestId: undefined, isRetry: undefined, operationRevision: undefined })) as CourseStoryMessageInput;
  const claimed = await db.courseStorySetting.updateMany({
    where: { courseId, stateRevision: previousRevision },
    data: {
      stateRevision: operationRevision,
      operationRequestId: requestId,
      operationAction: input.action ?? input.mode,
      operationPhase: operationPhase(input),
      operationStatus: "running",
      operationError: null,
      operationInput: persistedInput,
      operationStartedAt: startedAt,
    },
  });
  if (!claimed.count) {
    const current = await db.courseStorySetting.findUnique({ where: { courseId } });
    if (current?.operationRequestId === requestId) return getStoryOutlineState(db, courseId);
    throw new CourseStoryOutlineOperationConflictError("页面状态已经更新，请刷新后重试");
  }
  try {
    await executeStoryOutlineMessage(db, courseId, input, deps);
    await db.courseStorySetting.updateMany({
      where: { courseId, operationRequestId: requestId, operationStatus: "running" },
      data: { operationStatus: "succeeded", operationError: null },
    });
    return getStoryOutlineState(db, courseId);
  } catch (error) {
    const message = publicStoryOutlineErrorMessage(error);
    const updated = await db.courseStorySetting.updateMany({
      where: { courseId, operationRequestId: requestId, operationStatus: "running" },
      data: { operationStatus: "failed", operationError: message },
    });
    const recoveryMessage = `${message}${/[。！？]$/u.test(message) ? "" : "。"}你可以重试本步，或修改要求后重新提交。`;
    if (updated.count) await addMessage(db, courseId, "assistant", recoveryMessage, [{
      id: `retry-${requestId}`,
      label: "重试本步",
      action: "retry_operation",
      targetId: requestId,
    }]);
    throw error;
  }
}

export async function resetStoryOutline(db: StoryOutlineDb, courseId: string) {
  const course = await getCourse(db, courseId);
  const reset = async (tx: StoryOutlineDb) => {
    const setting = await tx.courseStorySetting.findUnique({ where: { courseId } });
    await tx.courseStoryChatMessage.deleteMany({ where: { courseId } });
    await tx.courseStoryDirection.deleteMany({ where: { courseId } });
    await tx.courseSourceReference.deleteMany({ where: { courseId } });
    await tx.courseCharacter.deleteMany({ where: { courseId } });
    await tx.courseStoryOutline.deleteMany({ where: { courseId } });
    await tx.courseStorySetting.upsert({
      where: { courseId },
      create: {
        courseId,
        chapterCount: defaultChapterCount(course.durationMinutes),
        writingProvider: "quickrouter_gpt",
        stateRevision: 1,
      },
      update: {
        alignmentStatus: "idle",
        planningMode: "explore_options",
        alignmentSummary: null,
        alignmentDetails: {},
        alignmentConfirmedAt: null,
        stateRevision: (setting?.stateRevision ?? 0) + 1,
        operationStatus: setting?.operationStatus === "running" ? "superseded" : null,
        operationRequestId: null,
        operationAction: null,
        operationPhase: null,
        operationError: null,
        operationInput: null,
        operationStartedAt: null,
      },
    });
    return getStoryOutlineState(tx, courseId);
  };
  return db.$transaction ? db.$transaction(reset) : reset(db);
}

export async function saveStoryOutline(
  db: StoryOutlineDb,
  courseId: string,
  outline: StoryOutlineSaveInput,
  preserveDownstream: boolean,
) {
  const course = await getCourse(db, courseId);
  if (!["audience", "story_outline", "teaching_plan"].includes(course.currentStage) && !preserveDownstream) {
    throw new CourseStoryOutlineConflictError();
  }
  await writeOutline(db, course, {
    title: outline.title,
    summary: outline.summary,
    chapters: outline.chapters.map((chapter) => ({
      order: chapter.order,
      title: chapter.title,
      storyGoal: proseText(chapter.whatHappens) || proseText(chapter.storyGoal),
      keyEvents: [
        chapter.characterActions,
        chapter.mainlineProgress,
      ].filter((item): item is string => Boolean(item)),
      characterIds: chapter.characterIds,
      setting: chapter.whatHappens || chapter.characterActions || chapter.mainlineProgress ? "" : chapter.setting || "",
      endingHook: chapter.whatHappens || chapter.characterActions || chapter.mainlineProgress ? "" : chapter.endingHook || "",
      recommendedKnowledgePointIds: chapter.recommendedKnowledgePointIds ?? [],
      knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "",
    })),
    characters: outline.characters.map((character) => ({
      displayName: character.displayName,
      englishName: character.englishName,
      sourceType: character.sourceType,
      sourcePersonId: character.sourcePersonId,
      sourceReferenceId: character.sourceReferenceId,
      roleInStory: character.roleInStory,
      shortDescription: character.shortDescription,
      visualDescription: character.visualDescription,
      shouldAppearInImages: character.shouldAppearInImages,
    })),
  }, outline.writingProvider, outline.chapterCount);
  return getStoryOutlineState(db, courseId);
}

export async function confirmStoryOutline(db: StoryOutlineDb, courseId: string) {
  const state = await getStoryOutlineState(db, courseId);
  if (!state.outline || !state.outline.title || !state.outline.summary || !state.outline.chapters.length) {
    throw new CourseStoryOutlineValidationError();
  }
  const allowedIds = new Set(state.course.knowledgePointIds ?? []);
  if (allowedIds.size && state.outline.chapters.some((chapter) => chapter.recommendedKnowledgePointIds?.some((id) => !allowedIds.has(id)))) {
    throw new CourseStoryOutlineValidationError("章节知识点推荐不完整，请重新生成大纲。");
  }
  return db.course.update({
    where: { id: courseId },
    data: {
      currentStage: furthestCourseStage(state.course.currentStage, "teaching_plan"),
      staleFromStage: staleStageAfterConfirming(state.course.staleFromStage, "story_outline", state.course.currentStage),
    },
  });
}

export async function updateStoryOutlineSettings(
  db: StoryOutlineDb,
  courseId: string,
  input: { chapterCount: number; writingProvider: StoryWritingProvider },
) {
  const course = await getCourse(db, courseId);
  const existing = await db.courseStoryOutline.findUnique({ where: { courseId } });
  if (existing && existing.chapterCount !== input.chapterCount) {
    throw new CourseStoryOutlineConflictError("故事大纲已生成，章节数需要重新生成大纲后才能修改");
  }
  await db.courseStorySetting.upsert({
    where: { courseId },
    create: { courseId, chapterCount: input.chapterCount, writingProvider: input.writingProvider },
    update: { chapterCount: input.chapterCount, writingProvider: input.writingProvider },
  });
  return getStoryOutlineState(db, course.id);
}

export async function updateReferenceMaterial(
  db: StoryOutlineDb,
  courseId: string,
  referenceId: string,
  input: Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">,
) {
  await getCourse(db, courseId);
  await db.courseSourceReference.update({
    where: { id: referenceId },
    data: {
      ...input,
      researchProvider: "quickrouter_gpt",
      confirmedAt: new Date(),
    },
  });
  return getStoryOutlineState(db, courseId);
}
