import { describe, expect, test } from "vitest";

import {
  archivePerson,
  createPerson,
  listPeople,
  PersonNotFoundError,
  restorePerson,
  updatePerson,
  type PeopleDb,
} from "./people";

const createdAt = new Date("2026-08-01T09:00:00.000Z");
const updatedAt = new Date("2026-08-02T09:00:00.000Z");

function dbPerson(overrides: Record<string, unknown> = {}) {
  return {
    id: "person-1",
    role: "student" as const,
    chineseName: "夏天",
    englishName: "Summer",
    age: 9,
    gender: "female" as const,
    notes: "喜欢主动表达",
    activeVisualAssetId: null,
    archivedAt: null,
    createdAt,
    updatedAt,
    activeVisualAsset: null,
    visualAssets: [],
    coursePeople: [],
    ...overrides,
  };
}

describe("people repository", () => {
  test("creates teachers and students with the same required profile fields", async () => {
    const person = await createPerson(
      {
        person: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            expect(data).toEqual({
              role: "teacher",
              chineseName: "林老师",
              englishName: "Ms. Lin",
              age: 32,
              gender: "female",
              notes: "语气自然",
            });
            return dbPerson({ id: "teacher-1", ...data });
          },
        },
      } as unknown as PeopleDb,
      {
        role: "teacher",
        chineseName: "  林老师  ",
        englishName: " Ms. Lin ",
        age: 32,
        gender: "female",
        notes: " 语气自然 ",
      },
    );

    expect(person).toMatchObject({
      id: "teacher-1",
      role: "teacher",
      chineseName: "林老师",
      englishName: "Ms. Lin",
      visualStatus: "missing",
      activeVisual: null,
    });
  });

  test("lists active people by search and sorts recently used people first", async () => {
    const people = await listPeople(
      {
        person: {
          findMany: async ({ where }: { where: Record<string, unknown> }) => {
            expect(where).toEqual({
              archivedAt: null,
              role: "student",
              OR: [
                { chineseName: { contains: "su", mode: "insensitive" } },
                { englishName: { contains: "su", mode: "insensitive" } },
              ],
            });
            return [
              dbPerson({ id: "older", chineseName: "苏西", englishName: "Susie" }),
              dbPerson({
                id: "recent",
                chineseName: "苏阳",
                englishName: "Sunny",
                coursePeople: [{ createdAt: new Date("2026-08-04T10:00:00.000Z") }],
              }),
            ];
          },
        },
      } as unknown as PeopleDb,
      { role: "student", query: " su ", status: "active", sort: "recent", limit: 20 },
    );

    expect(people.people.map((person) => person.id)).toEqual(["recent", "older"]);
    expect(people.people[0]?.lastUsedAt).toBe("2026-08-04T10:00:00.000Z");
  });

  test("maps the latest generation state without treating a missing image as missing profile data", async () => {
    const result = await listPeople(
      {
        person: {
          findMany: async () => [
            dbPerson({
              visualAssets: [{ status: "failed", updatedAt: new Date("2026-08-03T10:00:00.000Z") }],
            }),
          ],
        },
      } as unknown as PeopleDb,
      {},
    );

    expect(result.people[0]).toMatchObject({ visualStatus: "failed", activeVisual: null });
  });

  test("updates profile fields without accepting a role change", async () => {
    await updatePerson(
      {
        person: {
          findUnique: async () => dbPerson({ role: "teacher" }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            expect(data).toEqual({
              chineseName: "林老师",
              englishName: "Ms. Lynn",
              age: 33,
              gender: "female",
              notes: null,
            });
            expect(data).not.toHaveProperty("role");
            return dbPerson({ role: "teacher", ...data });
          },
        },
      } as unknown as PeopleDb,
      "person-1",
      {
        chineseName: "林老师",
        englishName: "Ms. Lynn",
        age: 33,
        gender: "female",
        notes: "",
      },
    );
  });

  test("archives and restores a person without deleting assets", async () => {
    const updates: Array<Date | null> = [];
    const db = {
      person: {
        findUnique: async () => dbPerson(),
        update: async ({ data }: { data: { archivedAt: Date | null } }) => {
          updates.push(data.archivedAt);
          return dbPerson({ archivedAt: data.archivedAt });
        },
      },
    } as unknown as PeopleDb;

    await archivePerson(db, "person-1");
    await restorePerson(db, "person-1");

    expect(updates[0]).toBeInstanceOf(Date);
    expect(updates[1]).toBeNull();
  });

  test("rejects updates to a missing person", async () => {
    await expect(
      updatePerson(
        { person: { findUnique: async () => null } } as unknown as PeopleDb,
        "missing",
        { chineseName: "夏天", englishName: "Summer", age: 9, gender: "female", notes: "" },
      ),
    ).rejects.toBeInstanceOf(PersonNotFoundError);
  });
});
