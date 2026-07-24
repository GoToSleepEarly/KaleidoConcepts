import { describe, expect, test } from "vitest";

import { CourseNotFoundError, createCourseBasic, deleteCourse, getCourseBasic, listCourses, updateCourseBasic } from "./courses";

describe("listCourses", () => {
  test("maps database courses to management list items", async () => {
    const courses = await listCourses({
      course: {
        findMany: async (query) => {
          expect(query).toEqual({
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

          return [
            {
              id: "course-1",
              title: "The Brave Little Rabbit",
              englishLevel: "A1",
              theme: "Plants / Nature",
              status: "ready",
              selectedStoryOptionId: "option-1",
              createdAt: new Date("2026-07-01T09:00:00.000Z"),
              updatedAt: new Date("2026-07-03T09:00:00.000Z"),
              lessonDraft: {
                courseId: "course-1",
              },
              people: [
                { person: { role: "student", englishName: "Summer", chineseName: "夏天", name: "Summer" } },
                { person: { role: "student", englishName: "Tom", chineseName: "汤姆", name: "Tom" } },
                { person: { role: "teacher", englishName: null, chineseName: null, name: "Ms. Lin" } },
              ],
              _count: {
                storyOptions: 3,
              },
            },
          ];
        },
      },
    });

    expect(courses).toEqual([
      {
        id: "course-1",
        title: "The Brave Little Rabbit",
        teacherName: "Ms. Lin",
        studentNames: ["Summer", "Tom"],
        englishLevel: "A1",
        theme: "Plants / Nature",
        status: "ready",
        storyOptionsCount: 3,
        selectedStoryOptionId: "option-1",
        lessonDraftExists: true,
        currentStep: "resources",
        nextEditPath: "/courses/course-1/create/resources",
        updatedAt: "2026-07-03T09:00:00.000Z",
      },
    ]);
  });
});

describe("course basic info", () => {
  const input = {
    title: "Space Adventure",
    teacherId: "teacher-1",
    studentIds: ["student-1", "student-2"],
    englishLevel: "B2" as const,
    durationMinutes: 45 as const,
    theme: "宇宙冒险",
    grammar: ["Past Simple", "There be"],
    llmModel: "deepseek_chat" as const,
  };

  const roleValidationDb = {
    person: {
      findMany: async () => [
        { id: "teacher-1", role: "teacher" as const },
        { id: "student-1", role: "student" as const },
        { id: "student-2", role: "student" as const },
      ],
    },
  };

  test("creates a draft course with one teacher and selected students", async () => {
    const course = await createCourseBasic(
      {
        ...roleValidationDb,
        course: {
          create: async ({ data }) => {
            expect(data).toEqual({
              title: "Space Adventure",
              englishLevel: "B2",
              durationMinutes: 45,
              theme: "宇宙冒险",
              grammar: ["Past Simple", "There be"],
              llmModel: "deepseek_chat",
              status: "draft",
              people: {
                create: [
                  { person: { connect: { id: "teacher-1" } } },
                  { person: { connect: { id: "student-1" } } },
                  { person: { connect: { id: "student-2" } } },
                ],
              },
            });

            return { id: "course-1", status: "draft" };
          },
        },
      },
      input,
    );

    expect(course).toEqual({ id: "course-1", status: "draft" });
  });

  test("updates existing basic info without creating a second course", async () => {
    const course = await updateCourseBasic(
      {
        ...roleValidationDb,
        course: {
          update: async ({ where, data }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(data).toMatchObject({
              title: "Space Adventure",
              people: {
                deleteMany: {},
                create: [
                  { person: { connect: { id: "teacher-1" } } },
                  { person: { connect: { id: "student-1" } } },
                  { person: { connect: { id: "student-2" } } },
                ],
              },
            });

            return { id: "course-1", status: "draft" };
          },
        },
      },
      "course-1",
      input,
    );

    expect(course).toEqual({ id: "course-1", status: "draft" });
  });

  test("maps saved basic info for editing", async () => {
    const course = await getCourseBasic(
      {
        course: {
          findUnique: async ({ where, include }) => {
            expect(where).toEqual({ id: "course-1" });
            expect(include).toEqual({ people: { include: { person: true } } });

            return {
              id: "course-1",
              title: "Space Adventure",
              englishLevel: "B2",
              durationMinutes: 45,
              theme: "宇宙冒险",
              grammar: ["Past Simple"],
              llmModel: "deepseek_chat",
              status: "draft",
              people: [
                { personId: "teacher-1", person: { role: "teacher" } },
                { personId: "student-1", person: { role: "student" } },
              ],
            };
          },
        },
      },
      "course-1",
    );

    expect(course).toEqual({
      id: "course-1",
      title: "Space Adventure",
      teacherId: "teacher-1",
      studentIds: ["student-1"],
      englishLevel: "B2",
      durationMinutes: 45,
      theme: "宇宙冒险",
      grammar: ["Past Simple"],
      llmModel: "deepseek_chat",
      status: "draft",
    });
  });
});

describe("deleteCourse", () => {
  test("deletes an existing course after verifying it exists", async () => {
    const calls: string[] = [];

    const result = await deleteCourse(
      {
        course: {
          findUnique: async ({ where }) => {
            calls.push("findUnique");
            expect(where).toEqual({ id: "course-1" });
            return {
              id: "course-1",
              title: "Space Adventure",
              englishLevel: "B2",
              durationMinutes: 45,
              theme: "宇宙冒险",
              grammar: ["Past Simple"],
              llmModel: "deepseek_chat",
              status: "draft",
              people: [],
            };
          },
          delete: async ({ where }) => {
            calls.push("delete");
            expect(where).toEqual({ id: "course-1" });
            return { id: "course-1" };
          },
        },
      },
      "course-1",
    );

    expect(result).toEqual({ id: "course-1" });
    expect(calls).toEqual(["findUnique", "delete"]);
  });

  test("throws when the course does not exist and never calls delete", async () => {
    let deleteCalled = false;

    await expect(
      deleteCourse(
        {
          course: {
            findUnique: async () => null,
            delete: async () => {
              deleteCalled = true;
              return { id: "course-1" };
            },
          },
        },
        "missing-course",
      ),
    ).rejects.toBeInstanceOf(CourseNotFoundError);

    expect(deleteCalled).toBe(false);
  });
});
