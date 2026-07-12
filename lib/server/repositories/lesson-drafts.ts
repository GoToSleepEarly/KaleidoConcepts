import type {
  LessonContentChapter,
  LessonDraft,
  LessonExercise,
  StoryOption,
} from "@/lib/contracts/api";

type CourseForDraft = {
  id: string;
  selectedStoryOptionId: string | null;
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
      select: { id: true; selectedStoryOptionId: true };
    }) => Promise<CourseForDraft | null>;
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

async function getCourseAndOption(db: LessonDraftsDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, selectedStoryOptionId: true },
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
    select: { id: true, selectedStoryOptionId: true },
  });

  if (!course) {
    throw new LessonDraftNotFoundError();
  }

  const draft = await db.courseLessonDraft.findUnique?.({
    where: { courseId },
  });

  return { draft: draft?.content ?? null };
}

export async function getLessonDraftPrerequisites(
  db: LessonDraftsDb,
  courseId: string,
) {
  return getCourseAndOption(db, courseId);
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
  const validDraft = validateLessonDraft(draft, option);
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
