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
} from "@/lib/contracts/api";

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  currentStage: CourseStage;
  people?: DbCoursePerson[];
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
  courseStoryOutlineChapter: Required<Pick<Delegate<DbChapter>, "deleteMany" | "createMany">>;
  courseCharacter: Required<Pick<Delegate<DbCharacter>, "findMany" | "deleteMany" | "createMany">>;
  aiGenerationLog: Required<Pick<Delegate<Record<string, unknown>>, "create">>;
  $transaction?: <T>(callback: (tx: StoryOutlineDb) => Promise<T>) => Promise<T>;
};

export type GeneratedDirection = Omit<CourseStoryDirection, "id" | "courseId" | "selectedAt" | "createdAt">;
export type GeneratedReference = Pick<CourseSourceReference, "name" | "type" | "sourceStatus" | "summary" | "usableFacts" | "avoidTopics" | "adaptationBoundary">;
export type GeneratedOutline = Pick<CourseStoryOutline, "title" | "summary"> & {
  narrativeType?: string;
  storyHook?: string;
  characters: Array<Omit<CourseCharacter, "id" | "courseId" | "createdAt" | "updatedAt">>;
  chapters: Array<Omit<CourseStoryOutlineChapter, "id">>;
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
};

export type StoryOutlineGenerationDeps = {
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
  const mappedOutline = toOutline(outline, mappedReferences, mappedCharacters);
  return {
    course: {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes as 30 | 45 | 60,
      currentStage: course.currentStage,
    },
    chatMessages: messages.map(toMessage),
    settings: {
      chapterCount: mappedOutline?.chapterCount ?? setting?.chapterCount ?? defaultChapterCount(course.durationMinutes),
      writingProvider: mappedOutline?.writingProvider ?? setting?.writingProvider ?? "quickrouter_gpt",
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
      characterIds: chapter.characterIds,
      setting: chapter.setting || "",
      endingHook: chapter.endingHook || "",
    })),
  });
  await db.courseCharacter.deleteMany({ where: { courseId: course.id } });
  await db.courseCharacter.createMany({
    data: outline.characters.map((character) => ({
      courseId: course.id,
      displayName: character.displayName,
      sourceType: character.sourceType,
      sourcePersonId: character.sourcePersonId ?? null,
      sourceReferenceId: character.sourceReferenceId ?? null,
      roleInStory: character.roleInStory,
      shortDescription: character.shortDescription,
      visualDescription: character.visualDescription ?? null,
      shouldAppearInImages: character.shouldAppearInImages,
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
  const [messages, directions, references, characters, existingOutline] = await Promise.all([
    db.courseStoryChatMessage.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryDirection.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseSourceReference.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseCharacter.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    db.courseStoryOutline.findUnique({ where: { courseId: course.id }, include: { chapters: true } }),
  ]);
  const mappedReferences = references.map(toReference);
  const mappedCharacters = characters.map(toCharacter);
  return {
    chapterCount,
    coursePeople: toCoursePeople(course),
    conversationHistory: messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content })),
    references: mappedReferences,
    currentDirections: directions.map(toDirection).filter((direction) => !direction.selectedAt),
    selectedDirection: selectedDirectionOverride === undefined
      ? directions.map(toDirection).find((direction) => direction.selectedAt) ?? null
      : selectedDirectionOverride,
    currentOutline: toOutline(existingOutline, mappedReferences, mappedCharacters),
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
    const persistOutline = async (tx: StoryOutlineDb) => {
      await writeOutline(tx, course, outline, resolved.writingProvider, resolved.chapterCount);
      await tx.courseStoryDirection.deleteMany({ where: { courseId: course.id, selectedAt: null } });
    };
    if (db.$transaction) await db.$transaction(persistOutline);
    else await persistOutline(db);
    await addMessage(db, course.id, "assistant", "故事大纲已生成。", [
      { id: "regenerate-outline", label: "重新生成", action: "regenerate_outline" },
      { id: "continue-modify", label: "继续修改", action: "confirm_reference_object" },
    ]);
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
    await tx.courseStoryDirection.createMany({ data: directions.map((direction) => ({ courseId: course.id, ...direction })) });
  };
  if (db.$transaction) await db.$transaction(replaceDirections);
  else await replaceDirections(db);
  await addMessage(db, course.id, "assistant", assistantMessage);
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
          confirmedAt: new Date(),
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
    await generateAndSaveDirections(db, course, deps, setting.chapterCount);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_from_reference") {
    const task = input.message.trim() || "请用已确认的参考资料生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await generateAndSaveOutline(db, course, task, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "choose_direction") {
    const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
      .map(toDirection)
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
    await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt: new Date() } });
    const selectionMessage = `我选择故事方向：${direction.title}\n${direction.hook}`;
    await addMessage(db, courseId, "teacher", selectionMessage);
    const task = `请基于已选择的故事方向生成大纲：${direction.title}\n${direction.seedPrompt || direction.hook}`;
    await generateAndSaveOutline(db, course, task, deps, setting, { ...direction, selectedAt: new Date().toISOString() });
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "regenerate_outline") {
    const task = input.message.trim() || "请基于当前全部要求重新生成故事大纲。";
    if (!input.message.trim()) await addMessage(db, courseId, "teacher", task);
    await generateAndSaveOutline(db, course, task, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.mode === "random") {
    await generateAndSaveDirections(db, course, deps, setting.chapterCount);
    return getStoryOutlineState(db, courseId);
  }

  const context = await storyAiContext(db, course, setting.chapterCount);
  const decision = await deps.decideFreeInput({
    ...context,
    task: input.action === "confirm_reference_materials"
      ? "参考资料已由老师确认。请根据实际资料判断是否存在完整原剧情、是否需要询问使用方式，以及主线是否完整。"
      : input.action === "choose_story_usage"
        ? "老师已经选择如何使用原剧情。请根据该选择和主线完整度判断下一步。"
        : "判断老师最新输入后，Step 2 下一步应该执行什么。",
  });
  const teacherReferences = decision.teacherReferences?.length
    ? decision.teacherReferences
    : decision.teacherReference
      ? [decision.teacherReference]
      : [];
  const shouldSaveTeacherReferences = decision.decision === "ask_story_usage"
    || decision.decision === "generate_directions"
    || decision.decision === "generate_outline";
  if (shouldSaveTeacherReferences) {
    for (const [index, rawTeacherReference] of teacherReferences.entries()) {
      const teacherReference = safeReferenceForWrite(
        rawTeacherReference,
        decision.referenceName || `老师补充资料${teacherReferences.length > 1 ? ` ${index + 1}` : ""}`,
        input.message,
        "teacher_supplied",
      );
      await db.courseSourceReference.create({
        data: {
          courseId,
          ...teacherReference,
          researchProvider: "none",
          confirmedAt: new Date(),
        },
      });
    }
  }

  if (decision.decision === "ask_clarification") {
    await addMessage(db, courseId, "assistant", decision.assistantMessage || "请补充一下具体要求。");
    return getStoryOutlineState(db, courseId);
  }

  if (decision.decision === "request_reference_material") {
    await addMessage(db, courseId, "assistant", decision.assistantMessage || "这个想法需要更多参考资料。", [
      { id: "supply-reference-material", label: "我来补充资料", action: "supply_reference_material", targetId: decision.referenceName, researchPlan: decision.researchPlan },
      { id: "choose-reference-search", label: "联网整理资料", action: "choose_reference_search", targetId: decision.referenceName, researchPlan: decision.researchPlan },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (decision.decision === "ask_story_usage") {
    await addMessage(db, courseId, "assistant", decision.assistantMessage || "资料中包含完整原剧情。你希望怎么讲这个故事？", [
      { id: "follow-original-story", label: "按原剧情讲", action: "choose_story_usage", targetId: "follow_original" },
      { id: "create-new-story", label: "创作新剧情", action: "choose_story_usage", targetId: "create_new" },
      { id: "describe-story-usage", label: "我有具体想法", action: "describe_story_usage" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (decision.decision === "prepare_reference_material") {
    const objectName = decision.referenceName || input.message || "当前故事背景";
    const researchPlan = decision.researchPlan ?? fallbackResearchPlan(objectName);
    const generatedReferences = await deps.generateReferenceFromKnowledge({
      ...context,
      task: "按照研究计划，用模型已有的可靠知识整理可直接用于当前故事的参考资料。",
      researchPlan,
    });
    for (const [index, generatedReference] of generatedReferences.entries()) {
      const packet = researchPlan.packets[index];
      const reference = safeReferenceForWrite(
        generatedReference,
        packet?.title || objectName,
        `关于${packet?.title || objectName}的背景参考资料。`,
      );
      await db.courseSourceReference.create({
        data: {
          courseId,
          ...reference,
          usableFacts: reference.usableFacts,
          avoidTopics: reference.avoidTopics,
          researchProvider: "none",
          confirmedAt: new Date(),
        },
      });
    }
    await addMessage(db, courseId, "assistant", "参考资料已整理，请确认后继续。", [
      { id: "confirm-known-reference-materials", label: "确认参考资料并继续", action: "confirm_reference_materials" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (decision.decision === "generate_directions") {
    await generateAndSaveDirections(db, course, deps, setting.chapterCount);
    return getStoryOutlineState(db, courseId);
  }

  const outlineTask = input.message.trim()
    || (input.action === "confirm_reference_materials"
      ? "根据老师已确认的参考资料和完整历史生成故事大纲。"
      : input.action === "choose_story_usage"
        ? "根据老师选择的原剧情使用方式生成故事大纲。"
        : "根据老师当前完整要求生成故事大纲。");
  await generateAndSaveOutline(db, course, outlineTask, deps, setting);
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
