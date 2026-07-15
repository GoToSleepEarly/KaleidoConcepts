import { describe, expect, test } from "vitest";

import { archivePerson, createPerson, listPeople, PersonNotFoundError, updatePerson } from "./people";

describe("people repository", () => {
  test("lists active people with optional role filtering", async () => {
    const people = await listPeople(
      {
        person: {
          findMany: async (query) => {
            expect(query).toEqual({
              where: { archivedAt: null, role: "teacher" },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            });

            return [
              {
                id: "teacher-1",
                role: "teacher",
                name: "Ms. Lin",
                chineseName: null,
                englishName: null,
                age: null,
                gender: "female",
                appearance: "黑色长发，圆框眼镜，浅色针织衫",
                interests: [],
                learningGoal: null,
                notes: "语气亲切自然",
                avatarUrl: null,
                createdAt: new Date("2026-07-01T09:00:00.000Z"),
                updatedAt: new Date("2026-07-02T09:00:00.000Z"),
              },
            ];
          },
        },
      },
      { role: "teacher" },
    );

    expect(people).toEqual([
      {
        id: "teacher-1",
        role: "teacher",
        name: "Ms. Lin",
        gender: "female",
        appearance: "黑色长发，圆框眼镜，浅色针织衫",
        interests: [],
        notes: "语气亲切自然",
        avatarUrl: undefined,
        createdAt: "2026-07-01T09:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
    ]);
  });

  test("creates a teacher profile aligned with student fields and derived display name", async () => {
    const teacher = await createPerson(
      {
        person: {
          create: async ({ data }) => {
            expect(data).toEqual({
              role: "teacher",
              name: "Ms. Lin",
              chineseName: "林老师",
              englishName: "Ms. Lin",
              age: 30,
              gender: "female",
              appearance: "黑色长发，圆框眼镜",
              interests: [],
              learningGoal: null,
              notes: "课堂氛围温柔",
              avatarUrl: null,
            });

            return {
              id: "teacher-1",
              ...data,
              createdAt: new Date("2026-07-01T10:00:00.000Z"),
              updatedAt: new Date("2026-07-01T10:00:00.000Z"),
            };
          },
        },
      },
      {
        role: "teacher",
        chineseName: "林老师",
        englishName: "Ms. Lin",
        age: 30,
        gender: "female",
        appearance: "黑色长发，圆框眼镜",
        notes: "课堂氛围温柔",
      },
    );

    expect(teacher.role).toBe("teacher");
    expect(teacher.name).toBe("Ms. Lin");
    expect(teacher.chineseName).toBe("林老师");
    expect(teacher.age).toBe(30);
    expect(teacher.appearance).toBe("黑色长发，圆框眼镜");
    expect(teacher.avatarUrl).toBeUndefined();
  });

  test("creates a student profile without a default avatar and derived display name", async () => {
    const student = await createPerson(
      {
        person: {
          create: async ({ data }) => {
            expect(data).toMatchObject({
              role: "student",
              name: "Tom",
              chineseName: "汤姆",
              englishName: "Tom",
              age: 8,
              gender: "male",
              appearance: "短发，喜欢穿蓝色外套",
              interests: ["森林"],
              avatarUrl: null,
            });

            return {
              id: "student-1",
              ...data,
              createdAt: new Date("2026-07-01T10:00:00.000Z"),
              updatedAt: new Date("2026-07-01T10:00:00.000Z"),
            };
          },
        },
      },
      {
        role: "student",
        chineseName: "汤姆",
        englishName: "Tom",
        age: 8,
        gender: "male",
        appearance: "短发，喜欢穿蓝色外套",
        interests: ["森林"],
        learningGoal: "",
        notes: "",
      },
    );

    expect(student.name).toBe("Tom");
    expect(student.appearance).toBe("短发，喜欢穿蓝色外套");
    expect(student.avatarUrl).toBeUndefined();
  });

  test("updates a person without changing the role", async () => {
    const updated = await updatePerson(
      {
        person: {
          update: async ({ where, data }) => {
            expect(where).toEqual({ id: "teacher-1" });
            expect(data).toMatchObject({
              role: "teacher",
              name: "Ms. Lin",
              chineseName: "林老师",
              englishName: "Ms. Lin",
              age: 32,
              gender: "female",
              appearance: "浅色针织衫",
            });

            return {
              id: "teacher-1",
              role: "teacher",
              name: "Ms. Lin",
              chineseName: "林老师",
              englishName: "Ms. Lin",
              age: 32,
              gender: "female",
              appearance: "浅色针织衫",
              interests: [],
              learningGoal: null,
              notes: null,
              avatarUrl: null,
              createdAt: new Date("2026-07-01T09:00:00.000Z"),
              updatedAt: new Date("2026-07-03T09:00:00.000Z"),
            };
          },
        },
      },
      "teacher-1",
      {
        role: "teacher",
        chineseName: "林老师",
        englishName: "Ms. Lin",
        age: 32,
        gender: "female",
        appearance: "浅色针织衫",
        notes: "",
      },
    );

    expect(updated.updatedAt).toBe("2026-07-03T09:00:00.000Z");
  });

  test("archives an existing person via soft delete", async () => {
    const calls: string[] = [];
    let archivedAt: Date | null = null;

    await archivePerson(
      {
        person: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            calls.push("findUnique");
            expect(where).toEqual({ id: "student-1" });
            return {
              id: "student-1",
              role: "student",
              name: "Tom",
              chineseName: "汤姆",
              englishName: "Tom",
              age: 8,
              gender: "male",
              appearance: "短发",
              interests: [],
              learningGoal: null,
              notes: null,
              avatarUrl: null,
              archivedAt: null,
              createdAt: new Date("2026-07-01T09:00:00.000Z"),
              updatedAt: new Date("2026-07-01T09:00:00.000Z"),
            };
          },
          update: async ({ where, data }: { where: { id: string }; data: { archivedAt: Date } }) => {
            calls.push("update");
            expect(where).toEqual({ id: "student-1" });
            expect(data).toHaveProperty("archivedAt");
            archivedAt = (data as { archivedAt: Date }).archivedAt;
            return {} as never;
          },
        },
      } as never,
      "student-1",
    );

    expect(calls).toEqual(["findUnique", "update"]);
    expect(archivedAt).toBeInstanceOf(Date);
  });

  test("throws when archiving a missing person and never calls update", async () => {
    let updateCalled = false;

    await expect(
      archivePerson(
        {
          person: {
            findUnique: async () => null,
            update: async () => {
              updateCalled = true;
              return {} as never;
            },
          },
        } as never,
        "missing-person",
      ),
    ).rejects.toBeInstanceOf(PersonNotFoundError);

    expect(updateCalled).toBe(false);
  });
});
