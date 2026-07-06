import { describe, expect, test } from "vitest";

import { createPerson, listPeople, updatePerson } from "./people";

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

  test("creates a teacher profile with appearance and without student-only fields", async () => {
    const teacher = await createPerson(
      {
        person: {
          create: async ({ data }) => {
            expect(data).toEqual({
              role: "teacher",
              name: "Ms. Lin",
              chineseName: null,
              englishName: null,
              age: null,
              gender: "female",
              appearance: "黑色长发，圆框眼镜",
              interests: [],
              learningGoal: null,
              notes: "课堂氛围温柔",
              avatarUrl: "/mock-assets/teacher-default.png",
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
        name: "Ms. Lin",
        gender: "female",
        appearance: "黑色长发，圆框眼镜",
        notes: "课堂氛围温柔",
      },
    );

    expect(teacher.role).toBe("teacher");
    expect(teacher.name).toBe("Ms. Lin");
    expect(teacher.appearance).toBe("黑色长发，圆框眼镜");
    expect(teacher.avatarUrl).toBe("/mock-assets/teacher-default.png");
  });

  test("creates a male teacher profile with the male default avatar", async () => {
    const teacher = await createPerson(
      {
        person: {
          create: async ({ data }) => {
            expect(data.avatarUrl).toBe("/mock-assets/teacher-male-default.png");

            return {
              id: "teacher-male-1",
              ...data,
              createdAt: new Date("2026-07-01T10:00:00.000Z"),
              updatedAt: new Date("2026-07-01T10:00:00.000Z"),
            };
          },
        },
      },
      {
        role: "teacher",
        name: "Mr. Chen",
        gender: "male",
        appearance: "短发，圆框眼镜",
        notes: "课堂节奏清晰",
      },
    );

    expect(teacher.avatarUrl).toBe("/mock-assets/teacher-male-default.png");
  });

  test("creates a student profile with default avatar and derived display name", async () => {
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
              avatarUrl: "/mock-assets/student-boy.png",
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
    expect(student.avatarUrl).toBe("/mock-assets/student-boy.png");
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
              appearance: "浅色针织衫",
            });

            return {
              id: "teacher-1",
              role: "teacher",
              name: "Ms. Lin",
              chineseName: null,
              englishName: null,
              age: null,
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
        name: "Ms. Lin",
        gender: "female",
        appearance: "浅色针织衫",
        notes: "",
      },
    );

    expect(updated.updatedAt).toBe("2026-07-03T09:00:00.000Z");
  });
});
