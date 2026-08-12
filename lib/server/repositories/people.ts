import type {
  Gender,
  PeopleListResponse,
  PersonCreateInput,
  PersonProfile,
  PersonRole,
  PersonUpdateInput,
  PersonVisualSourceMode,
  PersonVisualStatus,
} from "@/lib/contracts/api";

type DbVisualSummary = {
  id: string;
  publicUrl: string | null;
  sourceMode: PersonVisualSourceMode;
  status: PersonVisualStatus;
  createdAt: Date;
  updatedAt: Date;
};

type DbPerson = {
  id: string;
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  notes: string | null;
  activeVisualAssetId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeVisualAsset?: DbVisualSummary | null;
  visualAssets?: Array<Pick<DbVisualSummary, "status" | "updatedAt">>;
  coursePeople?: Array<{ createdAt: Date }>;
};

type PersonWhere = {
  archivedAt?: Date | null | { not: null };
  role?: PersonRole;
  id?: { in: string[] };
  OR?: Array<{
    chineseName?: { contains: string; mode: "insensitive" };
    englishName?: { contains: string; mode: "insensitive" };
  }>;
};

type PersonDelegate = {
  findMany: (query: { where: PersonWhere; include?: unknown; orderBy?: unknown; skip?: number; take?: number }) => Promise<DbPerson[]>;
  count: (query: { where: PersonWhere }) => Promise<number>;
  findUnique: (query: { where: { id: string }; include?: unknown }) => Promise<DbPerson | null>;
  create: (query: { data: Omit<PersonCreateInput, "notes"> & { notes: string | null } }) => Promise<DbPerson>;
  update: (query: {
    where: { id: string };
    data: Partial<Omit<PersonUpdateInput, "notes">> & { notes?: string | null; archivedAt?: Date | null };
  }) => Promise<DbPerson>;
};

export type PeopleDb = { person: PersonDelegate };

export class PersonNotFoundError extends Error {
  constructor(message = "人物不存在") {
    super(message);
    this.name = "PersonNotFoundError";
  }
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function profileWithRelations(person: DbPerson): PersonProfile {
  const active = person.activeVisualAsset;
  const latest = person.visualAssets?.[0];
  const lastUsedAt = person.coursePeople?.[0]?.createdAt;
  const visualStatus = active?.status === "succeeded" && active.publicUrl
    ? "ready"
    : latest?.status === "pending" || latest?.status === "submitting"
      ? "generating"
      : latest?.status === "failed"
        ? "failed"
        : "missing";

  return {
    id: person.id,
    role: person.role,
    chineseName: person.chineseName,
    englishName: person.englishName,
    age: person.age,
    gender: person.gender,
    notes: person.notes ?? undefined,
    archivedAt: person.archivedAt?.toISOString(),
    activeVisual: active?.status === "succeeded" && active.publicUrl
      ? { id: active.id, publicUrl: active.publicUrl, sourceMode: active.sourceMode, createdAt: active.createdAt.toISOString() }
      : null,
    visualStatus,
    lastUsedAt: lastUsedAt?.toISOString(),
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function profileWithoutRelations(person: DbPerson) {
  return profileWithRelations({ ...person, activeVisualAsset: null, visualAssets: [], coursePeople: [] });
}

export async function listPeople(
  db: PeopleDb,
  options: {
    role?: PersonRole;
    query?: string;
    status?: "active" | "archived";
    sort?: "recent" | "name";
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PeopleListResponse> {
  const query = options.query?.trim();
  const where: PersonWhere = {
    archivedAt: options.status === "archived" ? { not: null } : null,
    ...(options.role ? { role: options.role } : {}),
    ...(query
      ? {
          OR: [
            { chineseName: { contains: query, mode: "insensitive" as const } },
            { englishName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
  const [people, total] = await Promise.all([
    db.person.findMany({
    where,
    include: {
      activeVisualAsset: true,
      visualAssets: { select: { status: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      coursePeople: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: options.sort === "name"
      ? [{ chineseName: "asc" }, { id: "asc" }]
      : [{ updatedAt: "desc" }, { chineseName: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
    db.person.count({ where }),
  ]);

  const mapped = people.map(profileWithRelations);
  return { people: mapped, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function createPerson(db: PeopleDb, input: PersonCreateInput) {
  const person = await db.person.create({
    data: {
      role: input.role,
      chineseName: input.chineseName.trim(),
      englishName: input.englishName.trim(),
      age: input.age,
      gender: input.gender,
      notes: optionalText(input.notes),
    },
  });
  return profileWithoutRelations(person);
}

export async function updatePerson(db: PeopleDb, id: string, input: PersonUpdateInput) {
  const current = await db.person.findUnique({ where: { id } });
  if (!current) throw new PersonNotFoundError();

  const person = await db.person.update({
    where: { id },
    data: {
      chineseName: input.chineseName.trim(),
      englishName: input.englishName.trim(),
      age: input.age,
      gender: input.gender,
      notes: optionalText(input.notes),
    },
  });
  return profileWithoutRelations(person);
}

async function setArchived(db: PeopleDb, id: string, archivedAt: Date | null) {
  const current = await db.person.findUnique({ where: { id } });
  if (!current) throw new PersonNotFoundError();
  await db.person.update({ where: { id }, data: { archivedAt } });
}

export function archivePerson(db: PeopleDb, id: string) {
  return setArchived(db, id, new Date());
}

export function restorePerson(db: PeopleDb, id: string) {
  return setArchived(db, id, null);
}
