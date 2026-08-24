import type {
  CourseAudienceDetail,
  CourseAudienceInput,
  CourseLifecycleStatus,
  CoursesListResponse,
  CourseStage,
  Gender,
  PersonRole,
} from "@/lib/contracts/api";

type DbSnapshotPerson = {
  id: string;
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  archivedAt: Date | null;
  activeVisualAssetId: string | null;
  activeVisualAsset?: { publicUrl: string | null } | null;
};

type DbCoursePerson = {
  personId: string;
  role: PersonRole;
  chineseNameSnapshot: string;
  englishNameSnapshot: string;
  ageSnapshot: number;
  genderSnapshot: Gender;
  visualAssetIdSnapshot: string | null;
  person?: DbSnapshotPerson;
  visualAssetSnapshot?: { publicUrl: string | null } | null;
};

type DbCourse = {
  id: string;
  title: string;
  durationMinutes: number;
  englishLevel: CourseAudienceInput["englishLevel"] | null;
  knowledgePointIds: unknown;
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  staleFromStage?: CourseStage | null;
  idempotencyKey?: string;
  updatedAt?: Date;
  people?: DbCoursePerson[];
  storyOutline?: { title: string } | null;
  lessonContent?: { courseId: string } | null;
};

type CourseCreateData = {
  title: string;
  durationMinutes: number;
  englishLevel: CourseAudienceInput["englishLevel"];
  knowledgePointIds: string[];
  lifecycleStatus: "draft";
  currentStage: "story_outline";
  idempotencyKey: string;
  people: { create: Array<Omit<DbCoursePerson, "person" | "visualAssetSnapshot">> };
};

type CourseDelegate = {
  findUnique: (query: { where: { id?: string; idempotencyKey?: string }; include?: unknown }) => Promise<DbCourse | null>;
  findMany: (query: { where?: unknown; include?: unknown; orderBy?: unknown; skip?: number; take?: number }) => Promise<DbCourse[]>;
  count: (query: { where?: unknown }) => Promise<number>;
  create: (query: { data: CourseCreateData }) => Promise<DbCourse>;
  update: (query: { where: { id: string }; data: Record<string, unknown> }) => Promise<DbCourse>;
};

type CoursePersonLookup = {
  findMany: (query: { where: { id: { in: string[] }; archivedAt: null }; include?: unknown }) => Promise<DbSnapshotPerson[]>;
};

export type CoursesDb = {
  course: CourseDelegate;
  person: CoursePersonLookup;
  $transaction?: <T>(callback: (tx: CoursesDb) => Promise<T>) => Promise<T>;
};

export class CourseNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CourseNotFoundError";
  }
}

export class CoursePersonValidationError extends Error {
  constructor(message = "授课人物无效") {
    super(message);
    this.name = "CoursePersonValidationError";
  }
}

export class CourseAudienceConflictError extends Error {
  constructor(message = "修改授课对象会使后续内容保留为旧版本") {
    super(message);
    this.name = "CourseAudienceConflictError";
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

async function snapshots(db: CoursesDb, input: CourseAudienceInput) {
  const studentIds = uniqueIds(input.studentIds);
  const ids = [input.teacherId, ...studentIds];
  const people = await db.person.findMany({
    where: { id: { in: ids }, archivedAt: null },
    include: { activeVisualAsset: { select: { publicUrl: true } } },
  });
  const teacher = people.find((person) => person.id === input.teacherId && person.role === "teacher");
  const students = studentIds.map((id) => people.find((person) => person.id === id && person.role === "student"));
  if (!teacher || students.some((person) => !person)) throw new CoursePersonValidationError();
  if (!teacher.activeVisualAssetId || students.some((person) => !person?.activeVisualAssetId)) {
    throw new CoursePersonValidationError("请先为老师和学生完善人物形象");
  }

  return [teacher, ...(students as DbSnapshotPerson[])].map((person) => ({
    personId: person.id,
    role: person.role,
    chineseNameSnapshot: person.chineseName,
    englishNameSnapshot: person.englishName,
    ageSnapshot: person.age,
    genderSnapshot: person.gender,
    visualAssetIdSnapshot: person.activeVisualAssetId,
  }));
}

function mutationResult(course: DbCourse) {
  return { id: course.id, lifecycleStatus: course.lifecycleStatus, currentStage: course.currentStage, staleFromStage: course.staleFromStage ?? null };
}

export async function createCourse(db: CoursesDb, input: CourseAudienceInput, idempotencyKey: string) {
  const existing = await db.course.findUnique({ where: { idempotencyKey } });
  if (existing) return mutationResult(existing);

  const create = async (tx: CoursesDb) => {
    const people = await snapshots(tx, input);
    const course = await tx.course.create({
      data: {
        title: input.title.trim(),
        durationMinutes: input.durationMinutes,
        englishLevel: input.englishLevel,
        knowledgePointIds: input.knowledgePointIds,
        lifecycleStatus: "draft",
        currentStage: "story_outline",
        idempotencyKey,
        people: { create: people },
      },
    });
    return mutationResult(course);
  };

  return db.$transaction ? db.$transaction(create) : create(db);
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function updateCourseAudience(
  db: CoursesDb,
  id: string,
  input: CourseAudienceInput,
  preserveDownstream: boolean,
) {
  const current = await db.course.findUnique({ where: { id }, include: { people: true } });
  if (!current) throw new CourseNotFoundError();
  const currentPeople = current.people ?? [];
  const currentTeacher = currentPeople.find((person) => person.role === "teacher")?.personId;
  const currentStudents = currentPeople.filter((person) => person.role === "student").map((person) => person.personId).sort();
  const nextStudents = uniqueIds(input.studentIds).sort();
  const keyInputsChanged = current.durationMinutes !== input.durationMinutes
    || current.englishLevel !== input.englishLevel
    || !sameIds(Array.isArray(current.knowledgePointIds) ? current.knowledgePointIds.filter((id): id is string => typeof id === "string").sort() : [], [...input.knowledgePointIds].sort())
    || currentTeacher !== input.teacherId
    || !sameIds(currentStudents, nextStudents);
  const hasDownstream = !["audience", "story_outline"].includes(current.currentStage);

  if (keyInputsChanged && hasDownstream && !preserveDownstream) throw new CourseAudienceConflictError();
  if (!keyInputsChanged) {
    const course = await db.course.update({ where: { id }, data: { title: input.title.trim() } });
    return mutationResult(course);
  }

  const update = async (tx: CoursesDb) => {
    const people = await snapshots(tx, input);
    const course = await tx.course.update({
      where: { id },
      data: {
        title: input.title.trim(),
        durationMinutes: input.durationMinutes,
        englishLevel: input.englishLevel,
        knowledgePointIds: input.knowledgePointIds,
        currentStage: hasDownstream ? current.currentStage : "story_outline",
        staleFromStage: hasDownstream ? "story_outline" : null,
        lifecycleStatus: "draft",
        people: { deleteMany: {}, create: people },
      },
    });
    return mutationResult(course);
  };
  return db.$transaction ? db.$transaction(update) : update(db);
}

function stagePath(id: string, stage: CourseStage) {
  return `/courses/${id}/create/${stage.replaceAll("_", "-")}`;
}

export async function listCourses(db: CoursesDb, page = 1, pageSize = 5, query = ""): Promise<CoursesListResponse> {
  const normalizedQuery = query.trim();
  const where = {
    lifecycleStatus: { not: "archived" },
    ...(normalizedQuery ? {
      OR: [
        { title: { contains: normalizedQuery, mode: "insensitive" } },
        { storyOutline: { is: { title: { contains: normalizedQuery, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const [courses, total] = await Promise.all([db.course.findMany({
    where,
    include: {
      people: true,
      storyOutline: { select: { title: true } },
      lessonContent: { select: { courseId: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  }), db.course.count({ where })]);
  const items = courses.map((course) => {
    const people = course.people ?? [];
    const teacher = people.find((person) => person.role === "teacher");
    return {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes,
      englishLevel: course.englishLevel,
      storyTitle: course.storyOutline?.title ?? null,
      lessonDraftExists: Boolean(course.lessonContent),
      lifecycleStatus: course.lifecycleStatus,
      currentStage: course.currentStage,
      teacherName: teacher?.englishNameSnapshot ?? null,
      studentNames: people.filter((person) => person.role === "student").map((person) => person.englishNameSnapshot),
      nextEditPath: stagePath(course.id, course.currentStage),
      updatedAt: course.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  });
  return { courses: items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getCourseAudience(db: CoursesDb, id: string): Promise<CourseAudienceDetail> {
  const course = await db.course.findUnique({
    where: { id },
    include: { people: { include: { person: { include: { activeVisualAsset: true } }, visualAssetSnapshot: true } } },
  });
  if (!course) throw new CourseNotFoundError();

  return {
    id: course.id,
    title: course.title,
    durationMinutes: course.durationMinutes as 30 | 45 | 60,
    englishLevel: course.englishLevel,
    knowledgePointIds: Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [],
    lifecycleStatus: course.lifecycleStatus,
    currentStage: course.currentStage,
    people: (course.people ?? []).map((snapshot) => {
      const current = snapshot.person;
      const profileChanged = !current
        || current.chineseName !== snapshot.chineseNameSnapshot
        || current.englishName !== snapshot.englishNameSnapshot
        || current.age !== snapshot.ageSnapshot
        || current.gender !== snapshot.genderSnapshot
        || current.activeVisualAssetId !== snapshot.visualAssetIdSnapshot;
      return {
        personId: snapshot.personId,
        role: snapshot.role,
        chineseName: snapshot.chineseNameSnapshot,
        englishName: snapshot.englishNameSnapshot,
        age: snapshot.ageSnapshot,
        gender: snapshot.genderSnapshot,
        visualAssetId: snapshot.visualAssetIdSnapshot,
        visualUrl: snapshot.visualAssetSnapshot?.publicUrl ?? null,
        profileChanged,
      };
    }),
  };
}

export async function archiveCourse(db: CoursesDb, id: string) {
  const course = await db.course.findUnique({ where: { id } });
  if (!course || course.lifecycleStatus === "archived") throw new CourseNotFoundError();
  await db.course.update({ where: { id }, data: { lifecycleStatus: "archived" } });
}
