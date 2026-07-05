import type {
  CourseBasicDetail,
  CourseBasicInput,
  CourseCreateStep,
  CourseListItem,
  CourseStatus,
  EnglishLevel,
  PersonProfile,
  PersonRole,
  StoryIdeaMode,
} from "@/lib/contracts/api";

type DbCourse = {
  id: string;
  title: string;
  englishLevel: EnglishLevel;
  theme: string;
  status: CourseStatus;
  selectedStoryOptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lessonDraft?: {
    courseId: string;
  } | null;
  people: Array<{
    person: {
      role: "student" | "teacher";
      englishName: string | null;
      chineseName: string | null;
      name: string;
    };
  }>;
  _count?: {
    storyOptions: number;
  };
};

type DbCourseBasic = {
  id: string;
  title: string;
  englishLevel: EnglishLevel;
  durationMinutes: 30 | 45 | 60;
  theme: string;
  grammar: string[];
  storyIdeaMode: StoryIdeaMode;
  storyIdea: string | null;
  status: CourseStatus;
  people: Array<{
    personId: string;
    person: {
      role: PersonRole;
      id?: string;
      name?: string;
      chineseName?: string | null;
      englishName?: string | null;
      age?: number | null;
      gender?: "male" | "female" | null;
      appearance?: string | null;
      interests?: string[];
      learningGoal?: string | null;
      notes?: string | null;
      avatarUrl?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    };
  }>;
};

type CourseBasicWriteData = {
  title: string;
  englishLevel: EnglishLevel;
  durationMinutes: 30 | 45 | 60;
  theme: string;
  grammar: string[];
  storyIdeaMode: StoryIdeaMode;
  storyIdea: string | null;
};

export class CourseBasicValidationError extends Error {
  constructor(message = "课程基础信息不完整") {
    super(message);
    this.name = "CourseBasicValidationError";
  }
}

export type CoursesDb = {
  course: {
    findMany?: (query: {
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }];
      include: {
        people: {
          include: {
            person: true;
          };
        };
        _count: {
          select: {
            storyOptions: true;
          };
        };
        lessonDraft: {
          select: {
            courseId: true;
          };
        };
      };
    }) => Promise<DbCourse[]>;
    create?: (query: {
      data: CourseBasicWriteData & {
        status: "draft";
        people: {
          create: Array<{ person: { connect: { id: string } } }>;
        };
      };
    }) => Promise<{ id: string; status: CourseStatus }>;
    update?: (query: {
      where: { id: string };
      data: CourseBasicWriteData & {
        people: {
          deleteMany: Record<string, never>;
          create: Array<{ person: { connect: { id: string } } }>;
        };
      };
    }) => Promise<{ id: string; status: CourseStatus }>;
    findUnique?: (query: {
      where: { id: string };
      include: {
        people: {
          include: {
            person: true;
          };
        };
      };
    }) => Promise<DbCourseBasic | null>;
  };
  person?: {
    findMany: (query: {
      where: {
        archivedAt: null;
        OR: Array<
          | { id: string; role: "teacher" }
          | {
              id: {
                in: string[];
              };
              role: "student";
            }
        >;
      };
      select: {
        id: true;
        role: true;
      };
    }) => Promise<Array<{ id: string; role: PersonRole }>>;
  };
};

function dbPersonToProfile(person: NonNullable<DbCourseBasic["people"][number]["person"]>): PersonProfile {
  return {
    id: person.id ?? "",
    role: person.role,
    name: person.name ?? "",
    chineseName: person.chineseName ?? undefined,
    englishName: person.englishName ?? undefined,
    age: person.age ?? undefined,
    gender: person.gender ?? undefined,
    appearance: person.appearance ?? undefined,
    interests: person.interests ?? [],
    learningGoal: person.learningGoal ?? undefined,
    notes: person.notes ?? undefined,
    avatarUrl: person.avatarUrl ?? undefined,
    createdAt: person.createdAt?.toISOString() ?? "",
    updatedAt: person.updatedAt?.toISOString() ?? "",
  };
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function toCourseBasicWriteData(input: CourseBasicInput): CourseBasicWriteData {
  return {
    title: normalizeText(input.title),
    englishLevel: input.englishLevel,
    durationMinutes: input.durationMinutes,
    theme: normalizeText(input.theme),
    grammar: uniqueValues(input.grammar.map(normalizeText).filter(Boolean)),
    storyIdeaMode: input.storyIdeaMode,
    storyIdea: input.storyIdeaMode === "manual" ? normalizeOptionalText(input.storyIdea) : null,
  };
}

function validateCourseBasicShape(input: CourseBasicInput) {
  const data = toCourseBasicWriteData(input);

  if (!data.title || !input.teacherId || input.studentIds.length < 1 || !data.theme || data.grammar.length < 1) {
    throw new CourseBasicValidationError();
  }

  if (data.storyIdeaMode === "manual" && !data.storyIdea) {
    throw new CourseBasicValidationError();
  }

  return data;
}

async function validatePeople(db: CoursesDb, input: CourseBasicInput) {
  if (!db.person) {
    throw new CourseBasicValidationError();
  }

  const studentIds = uniqueValues(input.studentIds);
  const people = await db.person.findMany({
    where: {
      archivedAt: null,
      OR: [
        { id: input.teacherId, role: "teacher" },
        {
          id: {
            in: studentIds,
          },
          role: "student",
        },
      ],
    },
    select: {
      id: true,
      role: true,
    },
  });

  const hasTeacher = people.some((person) => person.id === input.teacherId && person.role === "teacher");
  const foundStudentIds = new Set(people.filter((person) => person.role === "student").map((person) => person.id));
  const hasAllStudents = studentIds.every((studentId) => foundStudentIds.has(studentId));

  if (!hasTeacher || !hasAllStudents) {
    throw new CourseBasicValidationError();
  }

  return studentIds;
}

function toPeopleCreate(teacherId: string, studentIds: string[]) {
  return [teacherId, ...studentIds].map((personId) => ({
    person: {
      connect: {
        id: personId,
      },
    },
  }));
}

function toCourseBasicDetail(course: DbCourseBasic): CourseBasicDetail {
  const teacher = course.people.find(({ person }) => person.role === "teacher");
  const studentIds = course.people.filter(({ person }) => person.role === "student").map(({ personId }) => personId);

  if (!teacher) {
    throw new CourseBasicValidationError("课程缺少老师");
  }

  return {
    id: course.id,
    title: course.title,
    teacherId: teacher.personId,
    studentIds,
    englishLevel: course.englishLevel,
    durationMinutes: course.durationMinutes,
    theme: course.theme,
    grammar: course.grammar,
    storyIdeaMode: course.storyIdeaMode,
    storyIdea: course.storyIdea ?? undefined,
    status: course.status,
  };
}

function getCourseProgress(course: DbCourse): {
  currentStep: CourseCreateStep;
  nextEditPath: string;
  lessonDraftExists: boolean;
  storyOptionsCount: number;
} {
  const storyOptionsCount = course._count?.storyOptions ?? 0;
  const lessonDraftExists = Boolean(course.lessonDraft);

  if (lessonDraftExists || course.selectedStoryOptionId) {
    return {
      currentStep: "lesson_draft",
      nextEditPath: `/courses/${course.id}/create/lesson-draft`,
      lessonDraftExists,
      storyOptionsCount,
    };
  }

  if (storyOptionsCount > 0) {
    return {
      currentStep: "story_options",
      nextEditPath: `/courses/${course.id}/create/story-options`,
      lessonDraftExists,
      storyOptionsCount,
    };
  }

  return {
    currentStep: "basic",
    nextEditPath: `/courses/${course.id}/create/basic`,
    lessonDraftExists,
    storyOptionsCount,
  };
}

export async function listCourses(db: CoursesDb): Promise<CourseListItem[]> {
  if (!db.course.findMany) {
    return [];
  }

  const courses = await db.course.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      people: {
        include: {
          person: true,
        },
      },
      _count: {
        select: {
          storyOptions: true,
        },
      },
      lessonDraft: {
        select: {
          courseId: true,
        },
      },
    },
  });

  return courses.map((course) => {
    const teacher = course.people.find(({ person }) => person.role === "teacher")?.person;
    const progress = getCourseProgress(course);

    return {
      id: course.id,
      title: course.title,
      teacherName: teacher?.name ?? null,
      studentNames: course.people
        .filter(({ person }) => person.role === "student")
        .map(({ person }) => person.englishName || person.chineseName || person.name),
      englishLevel: course.englishLevel,
      theme: course.theme,
      status: course.status,
      storyOptionsCount: progress.storyOptionsCount,
      selectedStoryOptionId: course.selectedStoryOptionId,
      lessonDraftExists: progress.lessonDraftExists,
      currentStep: progress.currentStep,
      nextEditPath: progress.nextEditPath,
      updatedAt: course.updatedAt.toISOString(),
    };
  });
}

export async function createCourseBasic(db: CoursesDb, input: CourseBasicInput) {
  if (!db.course.create) {
    throw new CourseBasicValidationError();
  }

  const data = validateCourseBasicShape(input);
  const studentIds = await validatePeople(db, input);

  const course = await db.course.create({
    data: {
      ...data,
      status: "draft",
      people: {
        create: toPeopleCreate(input.teacherId, studentIds),
      },
    },
  });

  return { id: course.id, status: course.status };
}

export async function updateCourseBasic(db: CoursesDb, id: string, input: CourseBasicInput) {
  if (!db.course.update) {
    throw new CourseBasicValidationError();
  }

  const data = validateCourseBasicShape(input);
  const studentIds = await validatePeople(db, input);

  const course = await db.course.update({
    where: { id },
    data: {
      ...data,
      people: {
        deleteMany: {},
        create: toPeopleCreate(input.teacherId, studentIds),
      },
    },
  });

  return { id: course.id, status: course.status };
}

export async function getCourseBasic(db: CoursesDb, id: string) {
  if (!db.course.findUnique) {
    return null;
  }

  const course = await db.course.findUnique({
    where: { id },
    include: {
      people: {
        include: {
          person: true,
        },
      },
    },
  });

  return course ? toCourseBasicDetail(course) : null;
}

export async function getStoryGenerationContext(db: CoursesDb, id: string) {
  const course = await db.course.findUnique?.({
    where: { id },
    include: {
      people: {
        include: {
          person: true,
        },
      },
    },
  });

  if (!course) {
    return null;
  }

  const basic = toCourseBasicDetail(course);
  const teacherRecord = course.people.find(({ person }) => person.role === "teacher")?.person;
  const studentRecords = course.people.filter(({ person }) => person.role === "student").map(({ person }) => person);

  if (!teacherRecord || studentRecords.length < 1) {
    throw new CourseBasicValidationError();
  }

  return {
    course: basic,
    teacher: dbPersonToProfile(teacherRecord),
    students: studentRecords.map(dbPersonToProfile),
  };
}
