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
} from "@/lib/contracts/api";
import { recommendedChapterWordCount } from "@/lib/domain/teaching-plan-policy";

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  currentStage: CourseStage;
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
  courseStorySetting: Required<Pick<Delegate<DbSetting>, "findUnique" | "upsert" | "deleteMany">>;
  courseStoryOutlineChapter: Required<Pick<Delegate<DbChapter>, "deleteMany" | "createMany" | "update">>;
  courseCharacter: Required<Pick<Delegate<DbCharacter>, "findMany" | "deleteMany" | "createMany">>;
  aiGenerationLog: Required<Pick<Delegate<Record<string, unknown>>, "create">>;
  presetOption?: { findMany: (query: Record<string, unknown>) => Promise<Array<{ id: string; label: string; labelZh?: string | null; category: string | null }>> };
  $transaction?: <T>(callback: (tx: StoryOutlineDb) => Promise<T>) => Promise<T>;
};

export type GeneratedDirection = Omit<CourseStoryDirection, "id" | "courseId" | "selectedAt" | "createdAt">;
export type GeneratedReference = Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">;
export type GeneratedOutline = Pick<CourseStoryOutline, "title" | "summary"> & {
  narrativeType?: string;
  storyHook?: string;
  characters: Array<Omit<CourseCharacter, "id" | "courseId" | "createdAt" | "updatedAt"> & { key?: string }>;
  chapters: Array<Omit<CourseStoryOutlineChapter, "id" | "recommendedWordCount"> & { characterKeys?: string[] }>;
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
};

export type StoryOutlineGenerationDeps = {
  alignRequirements: (input: StoryOutlineAiContext & { task: string }) => Promise<{
    status: "needs_clarification" | "ready_for_confirmation";
    planningMode: "explore_options" | "follow_defined_plot";
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
  decideFreeInput: (input: StoryOutlineAiContext & { task: string }) => Promise<{
    decision: "ask_clarification" | "ask_story_usage" | "prepare_reference_material" | "request_reference_material" | "generate_directions" | "generate_outline";
    assistantMessage: string;
    referenceName?: string;
    referenceType?: CourseSourceReferenceType;
    researchPlan?: CourseResearchPlan;
    teacherReference?: Omit<GeneratedReference, "sourceStatus">;
    teacherReferences?: Array<Omit<GeneratedReference, "sourceStatus">>;
  }>;
  generateDirections: (input: StoryOutlineAiContext & { task: string }) => Promise<GeneratedDirection[]>;
  reviseDirection: (input: StoryOutlineAiContext & { task: string; direction: CourseStoryDirection }) => Promise<GeneratedDirection>;
  reviseChapter: (input: StoryOutlineAiContext & { task: string; chapterOrder: number }) => Promise<
    | { status: "requires_outline_revision"; reason: string }
    | { status: "ready"; chapter: Pick<CourseStoryOutlineChapter, "order" | "title" | "whatHappens" | "characterIds" | "recommendedKnowledgePointIds" | "knowledgePointRecommendationSummary"> }
  >;
  generateReferenceFromKnowledge: (input: StoryOutlineAiContext & { task: string; researchPlan: CourseResearchPlan }) => Promise<GeneratedReference[]>;
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
  constructor(message = "修改故事大纲会重置后续内容") {
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

function toMessage(message: DbMessage): CourseStoryChatMessage {
  return {
    id: message.id,
    courseId: message.courseId,
    role: message.role,
    content: message.content,
    actions: Array.isArray(message.actions) ? message.actions as CourseStoryChatAction[] : [],
    createdAt: message.createdAt.toISOString(),
  };
}

function toDirection(direction: DbDirection): CourseStoryDirection {
  return {
    id: direction.id,
    courseId: direction.courseId,
    title: direction.title,
    hook: direction.hook,
    whyFits: direction.whyFits,
    mainCharacters: array(direction.mainCharacters),
    storyHighlight: direction.storyHighlight ?? "",
    growthCore: direction.growthCore ?? "",
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

function toOutline(outline: DbOutline | null, references: CourseSourceReference[], characters: CourseCharacter[], course?: DbCourse): CourseStoryOutline | null {
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
      recommendedWordCount: course?.englishLevel ? recommendedChapterWordCount(course.englishLevel, course.durationMinutes as 30 | 45 | 60, outline.chapterCount) : 0,
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
  const presets = db.presetOption ? await db.presetOption.findMany({ where: { id: { in: selectedIds }, kind: "grammar", archivedAt: null } }) : [];
  const selectedKnowledgePoints = presets.map((item) => ({ id: item.id, label: item.label, labelZh: item.labelZh ?? undefined, category: item.category ?? undefined }));
  const mappedOutline = toOutline(outline, mappedReferences, mappedCharacters, course);
  const alignmentDetails = typeof setting?.alignmentDetails === "object" && setting.alignmentDetails !== null
    ? setting.alignmentDetails as Partial<StoryAlignmentState>
    : {};
  const recommendedIds = new Set(mappedOutline?.chapters.flatMap((chapter) => chapter.recommendedKnowledgePointIds) ?? []);
  return {
    course: {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes as 30 | 45 | 60,
      currentStage: course.currentStage,
      englishLevel: course.englishLevel as EnglishLevel,
      knowledgePointIds: selectedIds,
    },
    selectedKnowledgePoints,
    unrecommendedKnowledgePoints: selectedKnowledgePoints.filter((item) => !recommendedIds.has(item.id)),
    chatMessages: messages.map(toMessage),
    settings: {
      chapterCount: mappedOutline?.chapterCount ?? setting?.chapterCount ?? defaultChapterCount(course.durationMinutes),
      writingProvider: mappedOutline?.writingProvider ?? setting?.writingProvider ?? "quickrouter_gpt",
    },
    alignment: {
      status: setting?.alignmentStatus ?? "idle",
      planningMode: setting?.planningMode ?? "explore_options",
      resolvedUnderstanding: Array.isArray(alignmentDetails.resolvedUnderstanding) ? alignmentDetails.resolvedUnderstanding : [],
      unresolvedIssues: Array.isArray(alignmentDetails.unresolvedIssues) ? alignmentDetails.unresolvedIssues : [],
      questions: Array.isArray(alignmentDetails.questions) ? alignmentDetails.questions : [],
      ...(setting?.alignmentSummary ? { summary: setting.alignmentSummary } : {}),
    },
    directions: directions.map(toDirection),
    referenceMaterials: mappedReferences,
    outline: mappedOutline,
    coursePeople: toCoursePeople(course),
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
      storyGoal: chapter.whatHappens || chapter.storyGoal,
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
  const selectedIds = Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const presets = db.presetOption ? await db.presetOption.findMany({ where: { id: { in: selectedIds }, kind: "grammar", archivedAt: null } }) : [];
  return {
    chapterCount,
    coursePeople: toCoursePeople(course),
    conversationHistory: messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content })),
    references: mappedReferences.filter((reference) => Boolean(reference.confirmedAt)),
    currentDirections: directions.map(toDirection).filter((direction) => !direction.selectedAt),
    selectedDirection: selectedDirectionOverride === undefined
      ? directions.map(toDirection).find((direction) => direction.selectedAt) ?? null
      : selectedDirectionOverride,
    currentOutline: toOutline(existingOutline, mappedReferences, mappedCharacters, course),
    englishLevel: course.englishLevel ?? undefined,
    durationMinutes: course.durationMinutes as 30 | 45 | 60,
    selectedKnowledgePoints: presets.map((item) => ({ id: item.id, label: item.label, labelZh: item.labelZh ?? undefined, category: item.category ?? undefined })),
    confirmedRequirement: storySetting?.alignmentSummary ?? undefined,
  };
}

async function generateAndSaveOutline(db: StoryOutlineDb, course: DbCourse, task: string, deps: StoryOutlineGenerationDeps, setting?: { chapterCount: number; writingProvider: StoryWritingProvider }, selectedDirection?: CourseStoryDirection | null) {
  const started = Date.now();
  try {
    const resolved = setting ?? await currentSetting(db, course);
    const context = await storyAiContext(db, course, resolved.chapterCount, selectedDirection);
    const outline = await deps.generateOutline({
      ...context,
      task,
      writingProvider: resolved.writingProvider,
    });
    const allowedIds = new Set(context.selectedKnowledgePoints?.map((item) => item.id) ?? []);
    if (allowedIds.size && outline.chapters.some((chapter) => !chapter.recommendedKnowledgePointIds?.length || chapter.recommendedKnowledgePointIds.some((id) => !allowedIds.has(id)) || !chapter.knowledgePointRecommendationSummary?.trim())) {
      throw new CourseStoryOutlineValidationError("章节知识点推荐没有完整生成，请重试本次大纲。");
    }
    const persistOutline = async (tx: StoryOutlineDb) => {
      await writeOutline(tx, course, outline, resolved.writingProvider, resolved.chapterCount);
      await tx.courseStoryDirection.deleteMany({ where: { courseId: course.id, selectedAt: null } });
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
      inputSnapshot: { task, conversationHistory: context.conversationHistory, references: context.references },
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
) {
  const context = await storyAiContext(db, course, chapterCount);
  const directions = await deps.generateDirections({
    ...context,
    task: "根据老师当前要求和已确认资料生成 3 个故事方向。",
  });
  const replaceDirections = async (tx: StoryOutlineDb) => {
    await tx.courseStoryDirection.deleteMany({ where: { courseId: course.id } });
    await tx.courseStoryDirection.createMany({ data: directions.map((direction) => ({
      courseId: course.id,
      ...direction,
      storyHighlight: direction.storyHighlight ?? "",
      growthCore: direction.growthCore ?? "",
      classroomValue: direction.classroomValue ?? "",
    })) });
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
    resolvedUnderstanding: string[];
    unresolvedIssues: string[];
    questions: StoryAlignmentQuestion[];
    summary?: string;
  },
) {
  await db.courseStorySetting.upsert({
    where: { courseId: course.id },
    create: {
      courseId: course.id,
      chapterCount: setting.chapterCount,
      writingProvider: setting.writingProvider,
      alignmentStatus: alignment.status,
      planningMode: alignment.planningMode,
      alignmentSummary: alignment.summary ?? null,
      alignmentDetails: {
        resolvedUnderstanding: alignment.resolvedUnderstanding,
        unresolvedIssues: alignment.unresolvedIssues,
        questions: alignment.questions,
      },
      alignmentConfirmedAt: alignment.status === "confirmed" ? new Date() : null,
    },
    update: {
      alignmentStatus: alignment.status,
      planningMode: alignment.planningMode,
      alignmentSummary: alignment.summary ?? null,
      alignmentDetails: {
        resolvedUnderstanding: alignment.resolvedUnderstanding,
        unresolvedIssues: alignment.unresolvedIssues,
        questions: alignment.questions,
      },
      alignmentConfirmedAt: alignment.status === "confirmed" ? new Date() : null,
    },
  });
}

async function continueAfterBackground(
  db: StoryOutlineDb,
  course: DbCourse,
  deps: StoryOutlineGenerationDeps,
  setting: { chapterCount: number; writingProvider: StoryWritingProvider },
) {
  const stored = await db.courseStorySetting.findUnique({ where: { courseId: course.id } });
  if (stored?.planningMode === "follow_defined_plot") {
    await addMessage(db, course.id, "system", "故事需求和背景资料已确认，正在生成章节大纲。");
    await generateAndSaveOutline(db, course, "根据已确认的具体剧情生成完整故事大纲。", deps, setting);
    return;
  }
  await addMessage(db, course.id, "system", "故事需求和背景资料已确认，正在创作 3 个不同的故事方向。");
  await generateAndSaveDirections(db, course, deps, setting.chapterCount);
}

export async function handleStoryOutlineMessage(
  db: StoryOutlineDb,
  courseId: string,
  input: CourseStoryMessageInput,
  deps: StoryOutlineGenerationDeps,
) {
  const course = await getCourse(db, courseId);
  const setting = await currentSetting(db, course, input);
  if (input.message.trim()) await addMessage(db, courseId, "teacher", input.message.trim());
  if (input.action === "confirm_reference_materials" && !input.message.trim()) {
    await addMessage(db, courseId, "teacher", "我确认参考资料，请继续判断故事生成方式。");
  }
  if (input.action === "choose_story_usage" && !input.message.trim()) {
    if (input.targetId !== "follow_original" && input.targetId !== "create_new") {
      throw new CourseStoryOutlineValidationError("请选择一种故事讲述方式");
    }
    const usageMessage = input.targetId === "follow_original"
      ? "我选择按原剧情讲，保留原作主线、关键转折和结局。"
      : "我选择创作新剧情，使用原作人物、世界观或主题重新创作。";
    await addMessage(db, courseId, "teacher", usageMessage);
  }

  if (input.action === "confirm_requirements") {
    const stored = await db.courseStorySetting.findUnique({ where: { courseId } });
    if (!stored?.alignmentSummary || stored.alignmentStatus !== "ready_for_confirmation") {
      throw new CourseStoryOutlineValidationError("请先完成并确认创作理解");
    }
    const details = typeof stored.alignmentDetails === "object" && stored.alignmentDetails !== null
      ? stored.alignmentDetails as Partial<StoryAlignmentState>
      : {};
    await saveAlignment(db, course, setting, {
      status: "confirmed",
      planningMode: stored.planningMode ?? "explore_options",
      resolvedUnderstanding: details.resolvedUnderstanding ?? [],
      unresolvedIssues: [],
      questions: [],
      summary: stored.alignmentSummary,
    });
    await addMessage(db, courseId, "teacher", "我确认这份创作理解。");
    await addMessage(db, courseId, "system", "创作需求已确认，正在准备故事所需的背景知识。");
    const context = await storyAiContext(db, course, setting.chapterCount);
    const background = await deps.prepareBackgroundKnowledge({
      ...context,
      task: "根据老师确认的创作理解，为后续故事生成准备一次必要背景知识。",
      confirmedRequirement: stored.alignmentSummary,
    });
    if (background.status === "not_needed") {
      await continueAfterBackground(db, course, deps, setting);
      return getStoryOutlineState(db, courseId);
    }
    if (background.status === "external_required") {
      await addMessage(db, courseId, "assistant", background.reason, [
        { id: "supply-reference-material", label: "我来补充资料", action: "supply_reference_material", researchPlan: background.researchPlan },
        { id: "choose-reference-search", label: "联网整理资料", action: "choose_reference_search", researchPlan: background.researchPlan },
      ]);
      return getStoryOutlineState(db, courseId);
    }
    for (const reference of background.references) {
      await db.courseSourceReference.create({
        data: {
          courseId,
          ...safeReferenceForWrite(reference, reference.name, reference.summary),
          researchProvider: "none",
          confirmedAt: null,
        },
      });
    }
    await addMessage(db, courseId, "assistant", "背景资料已整理，请确认后继续。", [
      { id: "confirm-background-materials", label: "确认资料并继续", action: "confirm_reference_materials" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_direction") {
    const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
      .map(toDirection)
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择要调整的故事方向");
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样调整这个方向");
    const context = await storyAiContext(db, course, setting.chapterCount, direction);
    const revised = await deps.reviseDirection({ ...context, direction, task: input.message.trim() });
    await db.courseStoryDirection.update({
      where: { id: direction.id },
      data: { ...revised },
    });
    await addMessage(db, courseId, "assistant", `已调整故事方向“${revised.title}”，其他方向保持不变。`);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "confirm_direction") {
    const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
      .map(toDirection)
      .find((item) => item.id === input.targetId && item.selectedAt);
    if (!direction) throw new CourseStoryOutlineValidationError("请先选择一个故事方向");
    await addMessage(db, courseId, "teacher", `我确认使用故事方向：${direction.title}`);
    await addMessage(db, courseId, "system", "故事方向已确认，正在生成章节大纲和教学知识点建议。");
    const task = `请基于已确认方向生成大纲：${direction.title}\n${direction.seedPrompt || direction.hook}`;
    await generateAndSaveOutline(db, course, task, deps, setting, direction);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_outline") {
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样修改整体大纲");
    await addMessage(db, courseId, "system", "正在按你的要求调整整体大纲。");
    await generateAndSaveOutline(db, course, `修改当前完整大纲：${input.message.trim()}`, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "revise_chapter") {
    if (!input.message.trim()) throw new CourseStoryOutlineValidationError("请说明希望怎样修改这一章");
    if (!input.targetChapterOrder) throw new CourseStoryOutlineValidationError("请选择要修改的章节");
    const current = await getStoryOutlineState(db, courseId);
    const target = current.outline?.chapters.find((chapter) => chapter.order === input.targetChapterOrder);
    if (!target) throw new CourseStoryOutlineValidationError("没有找到要修改的章节");
    const context = await storyAiContext(db, course, setting.chapterCount);
    const result = await deps.reviseChapter({ ...context, task: input.message.trim(), chapterOrder: input.targetChapterOrder });
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
    await continueAfterBackground(db, course, deps, setting);
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
    const incompletePackets = researchPlan.packets.filter((_, index) => {
      const reference = generatedReferences[index];
      return !reference
        || reference.sourceStatus === "insufficient"
        || !reference.summary?.trim()
        || !reference.usableFacts?.length;
    });
    if (generatedReferences.length !== researchPlan.packets.length || incompletePackets.length) {
      const missingNames = incompletePackets.map((packet) => packet.title).join("、") || objectName;
      await addMessage(db, courseId, "assistant", `联网搜索没有找到足够可靠的“${missingNames}”资料。请手动补充原文梗概、主要角色和关键剧情。`, [
        { id: "supply-missing-reference-material", label: "我来补充资料", action: "supply_reference_material", targetId: missingNames, researchPlan },
      ]);
      return getStoryOutlineState(db, courseId);
    }
    for (const [index, generatedReference] of generatedReferences.entries()) {
      const packet = researchPlan.packets[index];
      const reference = safeReferenceForWrite(
        generatedReference,
        packet?.title || objectName,
        `关于${packet?.title || objectName}的联网参考资料。`,
      );
      await db.courseSourceReference.create({
        data: {
          courseId,
          ...reference,
          usableFacts: reference.usableFacts,
          avoidTopics: reference.avoidTopics,
          researchProvider: "quickrouter_gpt",
          confirmedAt: null,
        },
      });
    }
    await addMessage(db, courseId, "assistant", "资料已整理，请确认后继续。", [
      { id: "confirm-reference-materials", label: "确认参考资料并继续", action: "confirm_reference_materials" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_directions") {
    const task = input.message.trim() || "我确认参考资料，请生成 3 个故事方向。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "已收到你的要求，正在创作 3 个不同的故事方向。");
    await generateAndSaveDirections(db, course, deps, setting.chapterCount);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_from_reference") {
    const task = input.message.trim() || "请用已确认的参考资料生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "参考资料和故事要求已确认，正在生成章节大纲。");
    await generateAndSaveOutline(db, course, task, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "choose_direction") {
    const storedDirections = await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } });
    const direction = storedDirections.map(toDirection)
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
    for (const storedDirection of storedDirections) {
      if (storedDirection.id !== direction.id && storedDirection.selectedAt) {
        await db.courseStoryDirection.update({ where: { id: storedDirection.id }, data: { selectedAt: null } });
      }
    }
    await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt: new Date() } });
    const selectionMessage = `我选择故事方向：${direction.title}\n${direction.hook}`;
    await addMessage(db, courseId, "teacher", selectionMessage);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "regenerate_outline") {
    const task = input.message.trim() || "请基于当前全部要求重新生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await addMessage(db, courseId, "system", "已收到修改要求，正在重新生成章节大纲。");
    await generateAndSaveOutline(db, course, task, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.mode === "random") {
    await addMessage(db, courseId, "system", "已收到灵感设置，正在创作 3 个不同的故事方向。");
    await generateAndSaveDirections(db, course, deps, setting.chapterCount);
    return getStoryOutlineState(db, courseId);
  }

  const context = await storyAiContext(db, course, setting.chapterCount);
  const alignment = await deps.alignRequirements({
    ...context,
    task: input.message.trim() || "根据老师最新回答继续对齐大体创作需求。",
  });
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
  await addMessage(db, courseId, "assistant", alignment.summary || alignment.assistantMessage, [
    { id: "confirm-requirements", label: "确认需求", action: "confirm_requirements" },
    { id: "modify-requirements", label: "修改需求", action: "modify_requirements" },
  ]);
  return getStoryOutlineState(db, courseId);
}

export async function resetStoryOutline(db: StoryOutlineDb, courseId: string) {
  await getCourse(db, courseId);
  const reset = async (tx: StoryOutlineDb) => {
    await tx.courseStoryChatMessage.deleteMany({ where: { courseId } });
    await tx.courseStoryDirection.deleteMany({ where: { courseId } });
    await tx.courseSourceReference.deleteMany({ where: { courseId } });
    await tx.courseCharacter.deleteMany({ where: { courseId } });
    await tx.courseStoryOutline.deleteMany({ where: { courseId } });
    await tx.courseStorySetting.deleteMany({ where: { courseId } });
    return getStoryOutlineState(tx, courseId);
  };
  return db.$transaction ? db.$transaction(reset) : reset(db);
}

export async function saveStoryOutline(
  db: StoryOutlineDb,
  courseId: string,
  outline: StoryOutlineSaveInput,
  resetDownstream: boolean,
) {
  const course = await getCourse(db, courseId);
  if (!["audience", "story_outline", "teaching_plan"].includes(course.currentStage) && !resetDownstream) {
    throw new CourseStoryOutlineConflictError();
  }
  await writeOutline(db, course, {
    title: outline.title,
    summary: outline.summary,
    chapters: outline.chapters.map((chapter) => ({
      order: chapter.order,
      title: chapter.title,
      storyGoal: chapter.whatHappens || chapter.storyGoal,
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
      sourceType: character.sourceType,
      sourcePersonId: character.sourcePersonId,
      sourceReferenceId: character.sourceReferenceId,
      roleInStory: character.roleInStory,
      shortDescription: character.shortDescription,
      visualDescription: character.visualDescription,
      shouldAppearInImages: character.shouldAppearInImages,
    })),
  }, outline.writingProvider, outline.chapterCount);
  if (resetDownstream) await db.course.update({ where: { id: courseId }, data: { currentStage: "story_outline" } });
  return getStoryOutlineState(db, courseId);
}

export async function confirmStoryOutline(db: StoryOutlineDb, courseId: string) {
  const state = await getStoryOutlineState(db, courseId);
  if (!state.outline || !state.outline.title || !state.outline.summary || !state.outline.chapters.length) {
    throw new CourseStoryOutlineValidationError();
  }
  const allowedIds = new Set(state.course.knowledgePointIds ?? []);
  if (allowedIds.size && state.outline.chapters.some((chapter) => !chapter.recommendedKnowledgePointIds?.length || chapter.recommendedKnowledgePointIds.some((id) => !allowedIds.has(id)))) {
    throw new CourseStoryOutlineValidationError("章节知识点推荐不完整，请重新生成大纲。");
  }
  return db.course.update({ where: { id: courseId }, data: { currentStage: "teaching_plan" } });
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
