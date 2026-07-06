import type { Gender, PersonInput, PersonProfile, PersonRole } from "@/lib/contracts/api";
import { defaultStudentAvatars, defaultTeacherAvatars } from "@/lib/mock-course-data";

type DbPerson = {
  id: string;
  role: PersonRole;
  name: string;
  chineseName: string | null;
  englishName: string | null;
  age: number | null;
  gender: Gender | null;
  appearance: string | null;
  interests: string[];
  learningGoal: string | null;
  notes: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersonData = Omit<DbPerson, "id" | "createdAt" | "updatedAt">;

type PersonFindManyQuery = {
  where: { archivedAt: null; role?: PersonRole };
  orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }];
};

type PersonDelegate = {
  findMany: (query: PersonFindManyQuery) => Promise<DbPerson[]>;
  create: (query: { data: PersonData }) => Promise<DbPerson>;
  update: (query: { where: { id: string }; data: PersonData }) => Promise<DbPerson>;
};

export type PeopleDb = {
  person: PersonDelegate;
};

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPersonProfile(person: DbPerson): PersonProfile {
  return {
    id: person.id,
    role: person.role,
    name: person.name,
    chineseName: person.chineseName ?? undefined,
    englishName: person.englishName ?? undefined,
    age: person.age ?? undefined,
    gender: person.gender ?? undefined,
    appearance: person.appearance ?? undefined,
    interests: person.interests,
    learningGoal: person.learningGoal ?? undefined,
    notes: person.notes ?? undefined,
    avatarUrl: person.avatarUrl ?? undefined,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function toPersonData(input: PersonInput): PersonData {
  if (input.role === "teacher") {
    return {
      role: "teacher",
      name: input.name.trim(),
      chineseName: null,
      englishName: null,
      age: null,
      gender: input.gender ?? null,
      appearance: normalizeOptionalText(input.appearance),
      interests: [],
      learningGoal: null,
      notes: normalizeOptionalText(input.notes),
      avatarUrl: normalizeOptionalText(input.avatarUrl) ?? defaultTeacherAvatars[input.gender ?? "female"],
    };
  }

  const englishName = input.englishName.trim();

  return {
    role: "student",
    name: englishName,
    chineseName: input.chineseName.trim(),
    englishName,
    age: optionalNumber(input.age),
    gender: input.gender,
    appearance: normalizeOptionalText(input.appearance),
    interests: input.interests.map((interest) => interest.trim()).filter(Boolean),
    learningGoal: normalizeOptionalText(input.learningGoal),
    notes: normalizeOptionalText(input.notes),
    avatarUrl: normalizeOptionalText(input.avatarUrl) ?? defaultStudentAvatars[input.gender],
  };
}

export async function listPeople(db: PeopleDb, options: { role?: PersonRole } = {}) {
  const people = await db.person.findMany({
    where: {
      archivedAt: null,
      ...(options.role ? { role: options.role } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return people.map(toPersonProfile);
}

export async function createPerson(db: PeopleDb, input: PersonInput) {
  const person = await db.person.create({ data: toPersonData(input) });
  return toPersonProfile(person);
}

export async function updatePerson(db: PeopleDb, id: string, input: PersonInput) {
  const person = await db.person.update({
    where: { id },
    data: toPersonData(input),
  });

  return toPersonProfile(person);
}
