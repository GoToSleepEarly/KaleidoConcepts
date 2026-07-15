import type {
  LessonContentChapter,
  LessonDraft,
  LessonDraftGenStatus,
  LessonDraftGeneration,
  LessonExercise,
  LlmModel,
  StoryOption,
} from "@/lib/contracts/api";
import {
  deriveClosingVocabularyTerms,
  hintLetterCount,
  hintPattern,
  normalizeAnswer,
} from "@/lib/server/ai/lesson-content-compiler";

export const lessonDraftGenTimeoutMs = Number(
  process.env.LESSON_DRAFT_GEN_TIMEOUT_MS ?? 900_000,
);

type CourseGenerationState = {
  id: string;
  selectedStoryOptionId: string | null;
  llmModel: LlmModel;
  lessonDraftGenStatus: LessonDraftGenStatus;
  lessonDraftGenStartedAt: Date | null;
  lessonDraftGenError: string | null;
};

type DraftRecord = {
  courseId: string;
  sourceStoryOptionId: string;
  content: LessonDraft;
};

export type LessonDraftsDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      select: {
        id: true;
        selectedStoryOptionId: true;
        lessonDraftGenStatus: true;
        lessonDraftGenStartedAt: true;
        lessonDraftGenError: true;
      };
    }) => Promise<CourseGenerationState | null>;
    updateMany?: (query: {
      where: {
        id: string;
        lessonDraftGenStatus: "running" | { in: LessonDraftGenStatus[] };
      };
      data: {
        lessonDraftGenStatus: LessonDraftGenStatus;
        lessonDraftGenStartedAt?: Date | null;
        lessonDraftGenError: string | null;
      };
    }) => Promise<{ count: number }>;
    update?: (query: {
      where: { id: string };
      data: {
        lessonDraftGenStatus: LessonDraftGenStatus;
        lessonDraftGenError: string | null;
      };
    }) => Promise<unknown>;
  };
  courseStoryOption: {
    findFirst: (query: {
      where: { courseId: string; id: string };
    }) => Promise<(StoryOption & { courseId: string }) | null>;
  };
  courseLessonDraft: {
    findUnique?: (query: {
      where: { courseId: string };
    }) => Promise<DraftRecord | null>;
    upsert?: (query: {
      where: { courseId: string };
      update: { sourceStoryOptionId: string; content: LessonDraft };
      create: {
        courseId: string;
        sourceStoryOptionId: string;
        content: LessonDraft;
      };
    }) => Promise<DraftRecord>;
  };
};

export class LessonDraftValidationError extends Error {
  constructor(message = "课文草稿信息不完整") {
    super(message);
    this.name = "LessonDraftValidationError";
  }
}

export class LessonDraftNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "LessonDraftNotFoundError";
  }
}

export class LessonDraftPrerequisiteError extends Error {
  constructor(message = "请先选择故事方案") {
    super(message);
    this.name = "LessonDraftPrerequisiteError";
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function chapterLabel(index: number) {
  return `第 ${index + 1} 章`;
}

function validateExercise(
  exercise: LessonExercise,
  chapter: LessonContentChapter,
  chapterIndex: number,
) {
  if (
    !isNonEmptyText(exercise.id) ||
    !Number.isInteger(exercise.order) ||
    !isNonEmptyText(exercise.sentenceId) ||
    !isNonEmptyText(exercise.answer)
  ) {
    throw new LessonDraftValidationError();
  }

  if (exercise.type === "given_word_blank") {
    if (!isNonEmptyText(exercise.prompt)) {
      throw new LessonDraftValidationError();
    }
  } else if (exercise.type === "choice_blank") {
    if (
      !Array.isArray(exercise.choices) ||
      exercise.choices.length < 2 ||
      !exercise.choices.includes(exercise.answer)
    ) {
      throw new LessonDraftValidationError();
    }
  } else if (
    !isNonEmptyText(exercise.hint) ||
    !isNonEmptyText(exercise.pattern) ||
    !isNonEmptyText(String(exercise.letterCount))
  ) {
    throw new LessonDraftValidationError();
  }

  const sentence = chapter.paragraphs
    .flatMap((paragraph) => paragraph.sentences)
    .find((item) => item.id === exercise.sentenceId);
  if (!sentence) {
    throw new LessonDraftValidationError(
      `${chapterLabel(chapterIndex)}练习引用不存在的句子：${exercise.sentenceId}`,
    );
  }

  const embeddedCount = chapter.paragraphs
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentenceItem) => sentenceItem.segments)
    .filter(
      (segment) =>
        segment.type === "exercise" && segment.exerciseId === exercise.id,
    ).length;

  if (embeddedCount !== 1) {
    throw new LessonDraftValidationError(
      `${chapterLabel(chapterIndex)}练习未嵌入正文：${exercise.id}`,
    );
  }
}

function validateChapter(chapter: LessonContentChapter, chapterIndex: number) {
  if (
    !isNonEmptyText(chapter.id) ||
    !isNonEmptyText(chapter.title) ||
    chapter.sourceOutlineChapterIndex !== chapterIndex + 1
  ) {
    throw new LessonDraftValidationError();
  }

  if (
    !Array.isArray(chapter.paragraphs) ||
    chapter.paragraphs.length !== 2 ||
    !Array.isArray(chapter.exercises) ||
    chapter.exercises.length < 1
  ) {
    throw new LessonDraftValidationError();
  }

  const exerciseIds = new Set(chapter.exercises.map((exercise) => exercise.id));
  if (exerciseIds.size !== chapter.exercises.length) {
    throw new LessonDraftValidationError(
      `${chapterLabel(chapterIndex)}存在重复的练习 id`,
    );
  }

  chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (
      !isNonEmptyText(paragraph.id) ||
      paragraph.order !== paragraphIndex + 1 ||
      !Array.isArray(paragraph.sentences) ||
      paragraph.sentences.length < 1
    ) {
      throw new LessonDraftValidationError();
    }

    const sentenceIds = new Set(
      paragraph.sentences.map((sentence) => sentence.id),
    );
    if (sentenceIds.size !== paragraph.sentences.length) {
      throw new LessonDraftValidationError(
        `${chapterLabel(chapterIndex)}存在重复的句子 id`,
      );
    }

    for (const sentence of paragraph.sentences) {
      if (
        !isNonEmptyText(sentence.id) ||
        !isNonEmptyText(sentence.text) ||
        !Array.isArray(sentence.segments) ||
        sentence.segments.length < 1
      ) {
        throw new LessonDraftValidationError();
      }

      for (const segment of sentence.segments) {
        if (segment.type === "text") {
          if (segment.text.length < 1) {
            throw new LessonDraftValidationError();
          }
        } else if (!exerciseIds.has(segment.exerciseId)) {
          throw new LessonDraftValidationError(
            `${chapterLabel(chapterIndex)}正文引用不存在的练习：${segment.exerciseId}`,
          );
        }
      }
    }
  });

  const sortedOrders = chapter.exercises
    .map((exercise) => exercise.order)
    .sort((a, b) => a - b);
  if (!sortedOrders.every((order, index) => order === index + 1)) {
    throw new LessonDraftValidationError();
  }

  for (const exercise of chapter.exercises) {
    validateExercise(exercise, chapter, chapterIndex);
  }
}

export function validateLessonDraft(
  draft: LessonDraft,
  sourceStoryOption: StoryOption,
) {
  if (
    draft.schemaVersion !== "lesson_content_v1" ||
    draft.generationMode !== "ai" ||
    draft.language !== "en" ||
    draft.sourceStoryOptionId !== sourceStoryOption.id ||
    !isNonEmptyText(draft.title) ||
    !draft.closingReading ||
    !isNonEmptyText(draft.closingReading.title) ||
    !Array.isArray(draft.closingReading.sentences) ||
    draft.closingReading.sentences.length < 1 ||
    !draft.closingReading.sentences.every(isNonEmptyText) ||
    !Array.isArray(draft.closingReading.vocabularyTerms) ||
    !draft.closingReading.vocabularyTerms.every(isNonEmptyText) ||
    draft.chapters.length !== sourceStoryOption.chapters.length
  ) {
    throw new LessonDraftValidationError();
  }

  draft.chapters.forEach(validateChapter);

  return draft;
}

const courseGenerationSelect = {
  id: true,
  selectedStoryOptionId: true,
  llmModel: true,
  lessonDraftGenStatus: true,
  lessonDraftGenStartedAt: true,
  lessonDraftGenError: true,
} as const;

function toGeneration(course: CourseGenerationState): LessonDraftGeneration {
  return {
    status: course.lessonDraftGenStatus,
    startedAt: course.lessonDraftGenStartedAt?.toISOString() ?? null,
    error: course.lessonDraftGenError,
  };
}

async function getCourseAndOption(db: LessonDraftsDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: courseGenerationSelect,
  });

  if (!course) {
    throw new LessonDraftNotFoundError();
  }

  if (!course.selectedStoryOptionId) {
    throw new LessonDraftPrerequisiteError();
  }

  const option = await db.courseStoryOption.findFirst({
    where: { courseId, id: course.selectedStoryOptionId },
  });

  if (!option) {
    throw new LessonDraftPrerequisiteError();
  }

  return { course, option };
}

export async function getLessonDraft(db: LessonDraftsDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: courseGenerationSelect,
  });

  if (!course) {
    throw new LessonDraftNotFoundError();
  }

  let generation = toGeneration(course);

  // Read-time timeout release: a "running" generation older than the timeout is treated as stuck
  // (e.g. the process was killed mid-generation) and released to "failed" so the UI can offer a retry.
  // No paid work is lost because a stuck run never produced a draft.
  if (
    generation.status === "running" &&
    course.lessonDraftGenStartedAt &&
    Date.now() - course.lessonDraftGenStartedAt.getTime() > lessonDraftGenTimeoutMs
  ) {
    const timeoutError = "生成超时未完成，请重新生成";
    const released = await db.course.updateMany?.({
      where: { id: courseId, lessonDraftGenStatus: "running" },
      data: { lessonDraftGenStatus: "failed", lessonDraftGenError: timeoutError },
    });

    if ((released?.count ?? 0) > 0) {
      generation = { status: "failed", startedAt: null, error: timeoutError };
    }
  }

  const draft = await db.courseLessonDraft.findUnique?.({
    where: { courseId },
  });

  return { draft: draft?.content ?? null, generation, llmModel: course.llmModel };
}

export async function claimLessonDraftGeneration(
  db: Pick<LessonDraftsDb, "course">,
  courseId: string,
): Promise<{ claimed: boolean; generation: LessonDraftGeneration }> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: courseGenerationSelect,
  });

  if (!course) {
    throw new LessonDraftNotFoundError();
  }

  const startedAt = new Date();
  const claimed = await db.course.updateMany?.({
    where: { id: courseId, lessonDraftGenStatus: { in: ["idle", "failed"] } },
    data: {
      lessonDraftGenStatus: "running",
      lessonDraftGenStartedAt: startedAt,
      lessonDraftGenError: null,
    },
  });

  if ((claimed?.count ?? 0) > 0) {
    return {
      claimed: true,
      generation: { status: "running", startedAt: startedAt.toISOString(), error: null },
    };
  }

  return { claimed: false, generation: toGeneration(course) };
}

type LessonDraftGenerationUpdateDb = {
  course: Pick<LessonDraftsDb["course"], "update">;
};

export async function markLessonDraftGenerationSucceeded(
  db: LessonDraftGenerationUpdateDb,
  courseId: string,
) {
  await db.course.update?.({
    where: { id: courseId },
    data: { lessonDraftGenStatus: "succeeded", lessonDraftGenError: null },
  });
}

export async function markLessonDraftGenerationFailed(
  db: LessonDraftGenerationUpdateDb,
  courseId: string,
  reason: string,
) {
  await db.course.update?.({
    where: { id: courseId },
    data: { lessonDraftGenStatus: "failed", lessonDraftGenError: reason },
  });
}

export async function getLessonDraftPrerequisites(
  db: LessonDraftsDb,
  courseId: string,
) {
  return getCourseAndOption(db, courseId);
}

function recomputeExercise(exercise: LessonExercise): LessonExercise {
  if (exercise.type === "vocab_hint") {
    return {
      ...exercise,
      pattern: hintPattern(exercise.answer),
      letterCount: Number(hintLetterCount(exercise.answer)),
    };
  }
  if (exercise.type === "phrase_hint") {
    return {
      ...exercise,
      pattern: hintPattern(exercise.answer),
      letterCount: String(hintLetterCount(exercise.answer)),
    };
  }
  return exercise;
}

function countAnswerOccurrences(sentenceText: string, answer: string) {
  const needle = normalizeAnswer(answer);
  if (!needle) {
    return 0;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryStart = /^\w/.test(needle) ? "\\b" : "";
  const boundaryEnd = /\w$/.test(needle) ? "\\b" : "";
  const pattern = new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, "g");
  return (normalizeAnswer(sentenceText).match(pattern) ?? []).length;
}

// Bug4 edits change source text/answers only; every field derived from them (sentence.text,
// hint pattern/letterCount, closing vocabulary) must be recomputed on the server so the stored draft
// is never trusted to carry consistent derived values from the client.
function recomputeDraftForSave(draft: LessonDraft): LessonDraft {
  const chapters = draft.chapters.map(
    (chapter, chapterIndex): LessonContentChapter => {
      const exercises = chapter.exercises.map(recomputeExercise);
      const exerciseById = new Map(
        exercises.map((exercise) => [exercise.id, exercise]),
      );

      const normalizedAnswers = new Set<string>();
      for (const exercise of exercises) {
        const normalized = normalizeAnswer(exercise.answer);
        if (normalizedAnswers.has(normalized)) {
          throw new LessonDraftValidationError(
            `${chapterLabel(chapterIndex)}存在重复答案：${exercise.answer}`,
          );
        }
        normalizedAnswers.add(normalized);
      }

      const paragraphs = chapter.paragraphs.map((paragraph) => ({
        ...paragraph,
        sentences: paragraph.sentences.map((sentence) => ({
          ...sentence,
          text: sentence.segments
            .map((segment) =>
              segment.type === "text"
                ? segment.text
                : (exerciseById.get(segment.exerciseId)?.answer ?? ""),
            )
            .join(""),
        })),
      }));

      const sentenceById = new Map(
        paragraphs
          .flatMap((paragraph) => paragraph.sentences)
          .map((sentence) => [sentence.id, sentence]),
      );

      for (const exercise of exercises) {
        const sentence = sentenceById.get(exercise.sentenceId);
        if (sentence && countAnswerOccurrences(sentence.text, exercise.answer) !== 1) {
          throw new LessonDraftValidationError(
            `${chapterLabel(chapterIndex)}答案“${exercise.answer}”需在所在句子中恰好出现一次`,
          );
        }
      }

      return { ...chapter, paragraphs, exercises };
    },
  );

  return {
    ...draft,
    chapters,
    closingReading: {
      ...draft.closingReading,
      vocabularyTerms: deriveClosingVocabularyTerms(chapters),
    },
  };
}

export async function saveLessonDraft(
  db: LessonDraftsDb,
  courseId: string,
  draft: LessonDraft,
) {
  if (!db.courseLessonDraft.upsert) {
    throw new LessonDraftValidationError();
  }

  const { option } = await getCourseAndOption(db, courseId);
  const recomputed = recomputeDraftForSave(draft);
  const validDraft = validateLessonDraft(recomputed, option);
  const saved = await db.courseLessonDraft.upsert({
    where: { courseId },
    update: {
      sourceStoryOptionId: validDraft.sourceStoryOptionId,
      content: validDraft,
    },
    create: {
      courseId,
      sourceStoryOptionId: validDraft.sourceStoryOptionId,
      content: validDraft,
    },
  });

  return { draft: saved.content };
}
