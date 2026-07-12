import type { StoryOption, StoryOptionsListResponse, StoryChapter } from "@/lib/contracts/api";

type CourseRecord = {
  id: string;
  durationMinutes: number;
  selectedStoryOptionId: string | null;
};

type DbStoryOption = StoryOption & {
  courseId: string;
};

export type StoryOptionsDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      select: { id: true; durationMinutes: true; selectedStoryOptionId: true };
    }) => Promise<CourseRecord | null>;
    update?: (query: { where: { id: string }; data: { selectedStoryOptionId: string } }) => Promise<{ selectedStoryOptionId: string | null }>;
  };
  courseStoryOption: {
    findMany?: (query: { where: { courseId: string }; orderBy: { createdAt: "asc" } }) => Promise<DbStoryOption[]>;
    findFirst?: (query: { where: { id: string; courseId: string } }) => Promise<{ id: string } | null>;
    deleteMany?: (query: { where: { courseId: string } }) => Promise<unknown>;
    createMany?: (query: { data: Array<StoryOption & { courseId: string }> }) => Promise<unknown>;
  };
};

export class StoryOptionsValidationError extends Error {
  constructor(message = "故事方案信息不完整") {
    super(message);
    this.name = "StoryOptionsValidationError";
  }
}

export class StoryOptionsLockedError extends Error {
  constructor(message = "故事方案已选择，不能继续编辑") {
    super(message);
    this.name = "StoryOptionsLockedError";
  }
}

export class StoryOptionsNotFoundError extends Error {
  constructor(message = "课程或故事方案不存在") {
    super(message);
    this.name = "StoryOptionsNotFoundError";
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateChapter(value: StoryChapter) {
  return isNonEmptyText(value.title) && isNonEmptyText(value.summary);
}

function getExpectedChapterCount(durationMinutes: number) {
  if (durationMinutes === 30) {
    return 3;
  }

  if (durationMinutes === 60) {
    return 5;
  }

  return 4;
}

const storyOptionVariants = new Set(["faithful", "enhanced", "creative"]);

export function validateStoryOptions(options: StoryOption[], expectedChapterCount?: number) {
  if (!Array.isArray(options) || options.length !== 3) {
    throw new StoryOptionsValidationError();
  }

  for (const option of options) {
    if (
      !isNonEmptyText(option.id) ||
      !storyOptionVariants.has(option.variant) ||
      !isNonEmptyText(option.title) ||
      !isNonEmptyText(option.storyline)
    ) {
      throw new StoryOptionsValidationError();
    }

    if (!Array.isArray(option.chapters) || (expectedChapterCount && option.chapters.length !== expectedChapterCount)) {
      throw new StoryOptionsValidationError();
    }

    if (!option.chapters.every(validateChapter)) {
      throw new StoryOptionsValidationError();
    }
  }

  return options;
}

function toStoryOption(record: DbStoryOption): StoryOption {
  return {
    id: record.id,
    variant: record.variant,
    title: record.title,
    storyline: record.storyline,
    chapters: record.chapters,
  };
}

async function getCourseOrThrow(db: StoryOptionsDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, durationMinutes: true, selectedStoryOptionId: true },
  });

  if (!course) {
    throw new StoryOptionsNotFoundError("课程不存在");
  }

  return course;
}

async function readOptions(db: StoryOptionsDb, courseId: string, selectedOptionId: string | null): Promise<StoryOptionsListResponse> {
  const records = await db.courseStoryOption.findMany?.({
    where: { courseId },
    orderBy: { createdAt: "asc" },
  });

  return {
    options: records?.map(toStoryOption) ?? [],
    selectedOptionId,
  };
}

export async function listStoryOptions(db: StoryOptionsDb, courseId: string) {
  const course = await getCourseOrThrow(db, courseId);
  return readOptions(db, courseId, course.selectedStoryOptionId);
}

async function replaceStoryOptions(db: StoryOptionsDb, courseId: string, options: StoryOption[]) {
  if (!db.courseStoryOption.deleteMany || !db.courseStoryOption.createMany) {
    throw new StoryOptionsValidationError();
  }

  await db.courseStoryOption.deleteMany({ where: { courseId } });
  await db.courseStoryOption.createMany({
    data: options.map((option) => ({ ...option, courseId })),
  });
}

export async function saveGeneratedStoryOptions(db: StoryOptionsDb, courseId: string, options: StoryOption[], expectedChapterCount?: number) {
  const course = await getCourseOrThrow(db, courseId);

  if (course.selectedStoryOptionId) {
    throw new StoryOptionsLockedError("故事方案已选择，不能重新生成");
  }

  validateStoryOptions(options, expectedChapterCount ?? getExpectedChapterCount(course.durationMinutes));
  await replaceStoryOptions(db, courseId, options);
  return readOptions(db, courseId, null);
}

export async function updateStoryOptions(db: StoryOptionsDb, courseId: string, options: StoryOption[], expectedChapterCount?: number) {
  const course = await getCourseOrThrow(db, courseId);

  if (course.selectedStoryOptionId) {
    throw new StoryOptionsLockedError();
  }

  validateStoryOptions(options, expectedChapterCount ?? getExpectedChapterCount(course.durationMinutes));
  await replaceStoryOptions(db, courseId, options);
  return readOptions(db, courseId, null);
}

export async function selectStoryOption(db: StoryOptionsDb, courseId: string, optionId: string) {
  if (!db.course.update || !db.courseStoryOption.findFirst) {
    throw new StoryOptionsValidationError();
  }

  const course = await getCourseOrThrow(db, courseId);

  if (course.selectedStoryOptionId) {
    throw new StoryOptionsLockedError("故事方案已选择");
  }

  const option = await db.courseStoryOption.findFirst({
    where: { id: optionId, courseId },
  });

  if (!option) {
    throw new StoryOptionsNotFoundError();
  }

  const updated = await db.course.update({
    where: { id: courseId },
    data: { selectedStoryOptionId: optionId },
  });

  return { selectedOptionId: updated.selectedStoryOptionId };
}
