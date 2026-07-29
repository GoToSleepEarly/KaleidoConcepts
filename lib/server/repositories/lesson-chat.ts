import type {
  LessonChatMessage,
  LessonChatResponse,
  LlmModel,
  StoryOption,
} from "@/lib/contracts/api";

type CourseRecord = {
  id: string;
  llmModel: LlmModel;
  lessonDraft: { courseId: string } | null;
};

type LessonChatDraftRecord = {
  courseId: string;
  messages: unknown;
  draftText: string;
};

type AiGenerationLogCreateInput = {
  courseId: string;
  feature: "lesson_chat";
  intent: string;
  llmModel: LlmModel;
  input: unknown;
  outputText: string;
  status: "succeeded" | "failed";
  errorMessage?: string;
  latencyMs: number;
};

export type LessonChatDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      select: {
        id: true;
        llmModel: true;
        lessonDraft: { select: { courseId: true } };
      };
    }) => Promise<CourseRecord | null>;
    update?: (query: {
      where: { id: string };
      data: { llmModel: LlmModel };
    }) => Promise<unknown>;
  };
  lessonChatDraft: {
    findUnique?: (query: {
      where: { courseId: string };
    }) => Promise<LessonChatDraftRecord | null>;
    deleteMany?: (query: { where: { courseId: string } }) => Promise<unknown>;
    upsert?: (query: {
      where: { courseId: string };
      update: { messages: LessonChatMessage[]; draftText: string };
      create: {
        courseId: string;
        messages: LessonChatMessage[];
        draftText: string;
      };
    }) => Promise<LessonChatDraftRecord>;
  };
  courseStoryOption: {
    upsert?: (query: {
      where: { courseId_id: { courseId: string; id: string } };
      update: Omit<StoryOption, "id">;
      create: StoryOption & { courseId: string };
    }) => Promise<unknown>;
  };
  aiGenerationLog?: {
    create: (query: { data: AiGenerationLogCreateInput }) => Promise<unknown>;
  };
};

export class LessonChatNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "LessonChatNotFoundError";
  }
}

export class LessonChatValidationError extends Error {
  constructor(message = "教案共创内容不完整") {
    super(message);
    this.name = "LessonChatValidationError";
  }
}

function isChatMessage(value: unknown): value is LessonChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LessonChatMessage>;
  return (
    typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant") &&
    typeof item.content === "string" &&
    typeof item.createdAt === "string"
  );
}

function parseMessages(value: unknown): LessonChatMessage[] {
  return Array.isArray(value) ? value.filter(isChatMessage) : [];
}

export function createChatMessage(
  role: LessonChatMessage["role"],
  content: string,
  actions?: LessonChatMessage["actions"],
): LessonChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(actions?.length ? { actions } : {}),
  };
}

export async function getLessonChatDraft(
  db: LessonChatDb,
  courseId: string,
): Promise<LessonChatResponse> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      llmModel: true,
      lessonDraft: { select: { courseId: true } },
    },
  });

  if (!course) throw new LessonChatNotFoundError();

  const draft = await db.lessonChatDraft.findUnique?.({ where: { courseId } });
  const messages = parseMessages(draft?.messages);
  const draftText = draft?.draftText ?? "";
  const isEmptyStep2 = messages.length === 0 && !draftText.trim() && !course.lessonDraft;
  const llmModel = isEmptyStep2 ? "gpt_5_5" : course.llmModel;

  if (isEmptyStep2 && course.llmModel !== llmModel) {
    await db.course.update?.({ where: { id: courseId }, data: { llmModel } });
  }

  return {
    messages,
    draftText,
    llmModel,
    lessonDraftExists: Boolean(course.lessonDraft),
  };
}

export async function saveLessonChatDraft(
  db: LessonChatDb,
  courseId: string,
  messages: LessonChatMessage[],
  draftText: string,
) {
  if (!db.lessonChatDraft.upsert) throw new LessonChatValidationError();
  await db.lessonChatDraft.upsert({
    where: { courseId },
    update: { messages, draftText },
    create: { courseId, messages, draftText },
  });
}

export async function clearLessonChatDraft(db: LessonChatDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      llmModel: true,
      lessonDraft: { select: { courseId: true } },
    },
  });

  if (!course) throw new LessonChatNotFoundError();
  if (!db.lessonChatDraft.deleteMany) throw new LessonChatValidationError();

  await db.lessonChatDraft.deleteMany({ where: { courseId } });
}

export async function recordLessonChatAiGeneration(
  db: LessonChatDb,
  data: AiGenerationLogCreateInput,
) {
  if (!db.aiGenerationLog) return;

  try {
    await db.aiGenerationLog.create({ data });
  } catch (error) {
    console.error("Failed to record lesson chat AI generation log", error);
  }
}
