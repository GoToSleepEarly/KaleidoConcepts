import type { LessonBlock, LessonDraft, LessonExercise, LessonShot, StoryOption } from "@/lib/contracts/api";

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
    findUnique: (query: { where: { id: string }; select: { id: true; selectedStoryOptionId: true } }) => Promise<CourseForDraft | null>;
  };
  courseStoryOption: {
    findFirst: (query: { where: { courseId: string; id: string } }) => Promise<(StoryOption & { courseId: string }) | null>;
  };
  courseLessonDraft: {
    findUnique?: (query: { where: { courseId: string } }) => Promise<DraftRecord | null>;
    upsert?: (query: {
      where: { courseId: string };
      update: { sourceStoryOptionId: string; content: LessonDraft };
      create: { courseId: string; sourceStoryOptionId: string; content: LessonDraft };
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

const minExercisesPerChapter = 7;
const maxExercisesPerChapter = 10;
const minChapterWords = 60;
const maxChapterWords = 190;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function countWords(blocks: LessonBlock[]) {
  return blocks
    .map((block) => (block.type === "text" ? block.text : "blank"))
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countTextWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function validateExerciseDisplay(block: Extract<LessonBlock, { type: "exercise" }>, exercise: LessonExercise) {
  if (block.display.placeholder !== "________" || block.display.kind !== exercise.type) {
    throw new LessonDraftValidationError();
  }

  if (exercise.type === "verb_blank") {
    if (block.display.kind !== "verb_blank" || !isNonEmptyText(block.display.prompt) || block.display.prompt !== exercise.baseVerb) {
      throw new LessonDraftValidationError();
    }
    return;
  }

  if (
    block.display.kind !== "vocabulary_hint" ||
    !isNonEmptyText(block.display.pattern) ||
    block.display.pattern !== exercise.pattern ||
    block.display.letterCount !== exercise.letterCount
  ) {
    throw new LessonDraftValidationError();
  }
}

function validateShots(shots: LessonShot[], blockIds: Set<string>, characterIds: Set<string>) {
  if (shots.length !== 2) {
    throw new LessonDraftValidationError();
  }

  const covered = new Set<string>();

  for (const shot of shots) {
    if (
      (shot.order !== 1 && shot.order !== 2) ||
      !isNonEmptyText(shot.id) ||
      !isNonEmptyText(shot.imageSlotId) ||
      !isNonEmptyText(shot.location) ||
      !isNonEmptyText(shot.action) ||
      !isNonEmptyText(shot.mood) ||
      !isNonEmptyText(shot.scenePrompt) ||
      !isNonEmptyText(shot.composition) ||
      !isNonEmptyText(shot.continuityNotes) ||
      shot.coveredBlockIds.length < 1 ||
      shot.characterIds.length < 1
    ) {
      throw new LessonDraftValidationError();
    }

    for (const characterId of shot.characterIds) {
      if (!characterIds.has(characterId)) {
        throw new LessonDraftValidationError();
      }
    }

    for (const blockId of shot.coveredBlockIds) {
      if (!blockIds.has(blockId) || covered.has(blockId)) {
        throw new LessonDraftValidationError();
      }
      covered.add(blockId);
    }
  }

  for (const blockId of blockIds) {
    if (!covered.has(blockId)) {
      throw new LessonDraftValidationError();
    }
  }
}

function hasValidWordTarget(draft: LessonDraft["chapters"][number]) {
  return draft.wordTarget.min >= 100 && draft.wordTarget.min <= 120 && draft.wordTarget.max >= 120 && draft.wordTarget.max <= 150;
}

function chapterLabel(index: number) {
  return `第 ${index + 1} 章`;
}

export function validateLessonDraft(draft: LessonDraft, sourceStoryOption: StoryOption) {
  if (
    draft.schemaVersion !== "lesson_draft_v1" ||
    draft.generationMode !== "ai" ||
    draft.language !== "en" ||
    draft.visualStyle.aspectRatio !== "4:3" ||
    draft.sourceStoryOptionId !== sourceStoryOption.id ||
    !isNonEmptyText(draft.title) ||
    !draft.closingReading ||
    !isNonEmptyText(draft.closingReading.title) ||
    !isNonEmptyText(draft.closingReading.text) ||
    !Array.isArray(draft.closingReading.vocabularyTerms) ||
    draft.closingReading.vocabularyTerms.length < 1 ||
    !draft.closingReading.vocabularyTerms.every(isNonEmptyText) ||
    countTextWords(draft.closingReading.text) < 60 ||
    countTextWords(draft.closingReading.text) > 150 ||
    draft.chapters.length !== sourceStoryOption.chapters.length
  ) {
    throw new LessonDraftValidationError();
  }

  const characterIds = new Set(draft.characters.map((character) => character.id));

  if (
    draft.characters.length < 2 ||
    draft.characters.filter((character) => character.role === "teacher").length !== 1 ||
    !draft.characters.every(
      (character) =>
        isNonEmptyText(character.id) &&
        isNonEmptyText(character.name) &&
        isNonEmptyText(character.appearance) &&
        isNonEmptyText(character.outfit) &&
        isNonEmptyText(character.consistencyPrompt),
    )
  ) {
    throw new LessonDraftValidationError();
  }

  draft.chapters.forEach((chapter, index) => {
    if (
      !isNonEmptyText(chapter.id) ||
      !isNonEmptyText(chapter.title) ||
      chapter.sourceOutlineChapterIndex !== index + 1 ||
      !hasValidWordTarget(chapter) ||
      chapter.exerciseTarget.verbBlankCount !== 7 ||
      chapter.exerciseTarget.vocabularyHintCount !== 3
    ) {
      throw new LessonDraftValidationError();
    }

    const blockIds = new Set(chapter.blocks.map((block) => block.id));
    const exerciseIds = new Set(chapter.exercises.map((exercise) => exercise.id));
    const exerciseBlocks = chapter.blocks.filter((block): block is Extract<LessonBlock, { type: "exercise" }> => block.type === "exercise");
    if (blockIds.size !== chapter.blocks.length || exerciseIds.size !== chapter.exercises.length) {
      throw new LessonDraftValidationError(`课文草稿章节结构不完整：${chapterLabel(index)}存在重复的 block 或 exercise id`);
    }

    if (exerciseBlocks.length !== chapter.exercises.length) {
      throw new LessonDraftValidationError(
        `课文草稿章节结构不完整：${chapterLabel(index)}练习 block 数量 ${exerciseBlocks.length} 与 exercises 数量 ${chapter.exercises.length} 不一致`,
      );
    }

    if (exerciseBlocks.length < minExercisesPerChapter) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}练习数量不足：需要 7-10 个，当前 ${exerciseBlocks.length} 个`);
    }

    if (exerciseBlocks.length > maxExercisesPerChapter) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}练习数量过多：需要 7-10 个，当前 ${exerciseBlocks.length} 个`);
    }

    const wordCount = countWords(chapter.blocks);
    if (wordCount < minChapterWords || wordCount > maxChapterWords) {
      throw new LessonDraftValidationError(`${chapterLabel(index)}正文词数异常：需要 60-190 词，当前 ${wordCount} 词`);
    }

    const sortedOrders = chapter.blocks.map((block) => block.order).sort((a, b) => a - b);
    if (!sortedOrders.every((order, orderIndex) => order === orderIndex + 1)) {
      throw new LessonDraftValidationError();
    }

    const referencedExercises = new Set<string>();
    for (const block of exerciseBlocks) {
      const exercise = chapter.exercises.find((item) => item.id === block.exerciseId);
      if (!exercise || referencedExercises.has(block.exerciseId)) {
        throw new LessonDraftValidationError();
      }

      validateExerciseDisplay(block, exercise);
      referencedExercises.add(block.exerciseId);
    }

    for (const exercise of chapter.exercises) {
      if (!referencedExercises.has(exercise.id) || !isNonEmptyText(exercise.answer)) {
        throw new LessonDraftValidationError();
      }
    }

    validateShots(chapter.shots, blockIds, characterIds);
  });

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

export async function getLessonDraftPrerequisites(db: LessonDraftsDb, courseId: string) {
  return getCourseAndOption(db, courseId);
}

export async function saveLessonDraft(db: LessonDraftsDb, courseId: string, draft: LessonDraft) {
  if (!db.courseLessonDraft.upsert) {
    throw new LessonDraftValidationError();
  }

  const { option } = await getCourseAndOption(db, courseId);
  const validDraft = validateLessonDraft(draft, option);
  const saved = await db.courseLessonDraft.upsert({
    where: { courseId },
    update: { sourceStoryOptionId: validDraft.sourceStoryOptionId, content: validDraft },
    create: { courseId, sourceStoryOptionId: validDraft.sourceStoryOptionId, content: validDraft },
  });

  return { draft: saved.content };
}
