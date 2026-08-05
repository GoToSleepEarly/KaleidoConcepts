import type {
  CourseAudienceDetail,
  CourseAudienceInput,
  CourseLifecycleStatus,
  CourseListItem,
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
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  idempotencyKey?: string;
  updatedAt?: Date;
  people?: DbCoursePerson[];
};

type CourseCreateData = {
  title: string;
  durationMinutes: number;
  lifecycleStatus: "draft";
  currentStage: "story_outline";
  idempotencyKey: string;
  people: { create: Array<Omit<DbCoursePerson, "person" | "visualAssetSnapshot">> };
};

type CourseDelegate = {
  findUnique: (query: { where: { id?: string; idempotencyKey?: string }; include?: unknown }) => Promise<DbCourse | null>;
  findMany: (query: { where?: unknown; include?: unknown; orderBy?: unknown }) => Promise<DbCourse[]>;
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
  constructor(message = "修改授课对象会重置后续内容") {
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
  return { id: course.id, lifecycleStatus: course.lifecycleStatus, currentStage: course.currentStage };
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
  resetDownstream: boolean,
) {
  const current = await db.course.findUnique({ where: { id }, include: { people: true } });
  if (!current) throw new CourseNotFoundError();
  const currentPeople = current.people ?? [];
  const currentTeacher = currentPeople.find((person) => person.role === "teacher")?.personId;
  const currentStudents = currentPeople.filter((person) => person.role === "student").map((person) => person.personId).sort();
  const nextStudents = uniqueIds(input.studentIds).sort();
  const keyInputsChanged = current.durationMinutes !== input.durationMinutes
    || currentTeacher !== input.teacherId
    || !sameIds(currentStudents, nextStudents);
  const hasDownstream = !["audience", "story_outline"].includes(current.currentStage);

  if (keyInputsChanged && hasDownstream && !resetDownstream) throw new CourseAudienceConflictError();
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
        currentStage: "story_outline",
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

export async function listCourses(db: CoursesDb): Promise<CourseListItem[]> {
  const courses = await db.course.findMany({
    where: { lifecycleStatus: { not: "archived" } },
    include: { people: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return courses.map((course) => {
    const people = course.people ?? [];
    const teacher = people.find((person) => person.role === "teacher");
    return {
      id: course.id,
      title: course.title,
      durationMinutes: course.durationMinutes,
      lifecycleStatus: course.lifecycleStatus,
      currentStage: course.currentStage,
      teacherName: teacher?.chineseNameSnapshot ?? null,
      studentNames: people.filter((person) => person.role === "student").map((person) => person.chineseNameSnapshot),
      nextEditPath: stagePath(course.id, course.currentStage),
      updatedAt: course.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  });
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
