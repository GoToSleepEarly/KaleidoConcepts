import type {
  CourseCharacter,
  CourseAudiencePerson,
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

export type StoryOutlineGenerationDeps = {
  decideFreeInput: (input: { course: DbCourse; coursePeople: CourseAudiencePerson[]; message: string; references: CourseSourceReference[]; outline: CourseStoryOutline | null }) => Promise<{
    decision: "ask_clarification" | "request_reference_material" | "generate_outline";
    assistantMessage: string;
    referenceName?: string;
    referenceType?: CourseSourceReferenceType;
    teacherReference?: Omit<GeneratedReference, "sourceStatus">;
  }>;
  generateDirections: (input: { course: DbCourse; message: string }) => Promise<GeneratedDirection[]>;
  searchReference: (input: { course: DbCourse; objectName: string }) => Promise<GeneratedReference>;
  generateOutline: (input: { course: DbCourse; message: string; references: CourseSourceReference[]; chapterCount: number; writingProvider: StoryWritingProvider; coursePeople: CourseAudiencePerson[]; currentOutline: CourseStoryOutline | null }) => Promise<GeneratedOutline>;
};

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
  return (course.people ?? []).map((person) => ({
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
      storyGoal: chapter.storyGoal,
      keyEvents: chapter.keyEvents,
      characterIds: chapter.characterIds,
      setting: chapter.setting,
      endingHook: chapter.endingHook,
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

async function generateAndSaveOutline(db: StoryOutlineDb, course: DbCourse, message: string, deps: StoryOutlineGenerationDeps, setting?: { chapterCount: number; writingProvider: StoryWritingProvider }) {
  const started = Date.now();
  try {
    const references = (await db.courseSourceReference.findMany({ where: { courseId: course.id } })).map(toReference);
    const characters = (await db.courseCharacter.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } })).map(toCharacter);
    const existingOutline = await db.courseStoryOutline.findUnique({ where: { courseId: course.id }, include: { chapters: true } });
    const currentOutline = toOutline(existingOutline, references, characters);
    const resolved = setting ?? await currentSetting(db, course);
    const outline = await deps.generateOutline({
      course,
      message,
      references,
      chapterCount: resolved.chapterCount,
      writingProvider: resolved.writingProvider,
      coursePeople: toCoursePeople(course),
      currentOutline,
    });
    await writeOutline(db, course, outline, resolved.writingProvider, resolved.chapterCount);
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
      researchProvider: references.length ? "quickrouter_gpt" : "none",
      inputSnapshot: { message, references },
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
      inputSnapshot: { message },
      errorMessage: error instanceof Error ? error.message : "故事大纲生成失败",
      latencyMs: Date.now() - started,
    });
    throw error;
  }
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

  if (input.action === "request_reference_search" || input.action === "choose_reference_search") {
    await addMessage(db, courseId, "assistant", "正在联网整理参考资料...");
    const reference = await deps.searchReference({ course, objectName: input.targetId || input.message });
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
    await addMessage(db, courseId, "assistant", "资料已整理。你可以在右侧调整，确认后我再生成大纲。", [
      { id: "generate-from-reference", label: "用这些资料生成大纲", action: "generate_from_reference" },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "generate_from_reference") {
    await generateAndSaveOutline(db, course, input.message, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "choose_direction") {
    const direction = (await db.courseStoryDirection.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }))
      .map(toDirection)
      .find((item) => item.id === input.targetId);
    if (!direction) throw new CourseStoryOutlineValidationError("请选择一个故事方向");
    await db.courseStoryDirection.update({ where: { id: direction.id }, data: { selectedAt: new Date() } });
    await generateAndSaveOutline(db, course, direction.seedPrompt || `${direction.title}\n${direction.hook}`, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.action === "regenerate_outline") {
    await generateAndSaveOutline(db, course, input.message, deps, setting);
    return getStoryOutlineState(db, courseId);
  }

  if (input.mode === "random") {
    const directions = await deps.generateDirections({ course, message: input.message });
    await db.courseStoryDirection.deleteMany({ where: { courseId } });
    await db.courseStoryDirection.createMany({ data: directions.map((direction) => ({ courseId, ...direction })) });
    await addMessage(db, courseId, "assistant", "我生成了 3 个故事方向，你可以选一个继续。");
    return getStoryOutlineState(db, courseId);
  }

  const references = (await db.courseSourceReference.findMany({ where: { courseId } })).map(toReference);
  const existingOutline = await db.courseStoryOutline.findUnique({ where: { courseId }, include: { chapters: true } });
  const characters = (await db.courseCharacter.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } })).map(toCharacter);
  const currentOutline = toOutline(existingOutline, references, characters);
  const decision = await deps.decideFreeInput({
    course,
    coursePeople: toCoursePeople(course),
    message: input.message,
    references,
    outline: currentOutline,
  });

  if (decision.decision === "ask_clarification") {
    await addMessage(db, courseId, "assistant", decision.assistantMessage || "请补充一下具体要求。");
    return getStoryOutlineState(db, courseId);
  }

  if (decision.decision === "request_reference_material") {
    await addMessage(db, courseId, "assistant", decision.assistantMessage || "这个想法需要更多参考资料。", [
      { id: "supply-reference-material", label: "我来补充资料", action: "supply_reference_material", targetId: decision.referenceName },
      { id: "choose-reference-search", label: "联网整理资料", action: "choose_reference_search", targetId: decision.referenceName },
    ]);
    return getStoryOutlineState(db, courseId);
  }

  if (decision.teacherReference) {
    await db.courseSourceReference.create({
      data: {
        courseId,
        ...decision.teacherReference,
        sourceStatus: "teacher_supplied",
        usableFacts: decision.teacherReference.usableFacts,
        avoidTopics: decision.teacherReference.avoidTopics,
        researchProvider: "none",
        confirmedAt: new Date(),
      },
    });
  }

  await generateAndSaveOutline(db, course, input.message, deps, setting);
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
      storyGoal: chapter.storyGoal,
      keyEvents: chapter.keyEvents,
      characterIds: chapter.characterIds,
      setting: chapter.setting,
      endingHook: chapter.endingHook,
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
