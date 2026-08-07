import { describe, expect, test } from "vitest";

import {
  CourseAudienceConflictError,
  archiveCourse,
  createCourse,
  getCourseAudience,
  listCourses,
  updateCourseAudience,
  type CoursesDb,
} from "./courses";

const teacher = {
  id: "teacher-1",
  role: "teacher" as const,
  chineseName: "林老师",
  englishName: "Ms. Lin",
  age: 32,
  gender: "female" as const,
  archivedAt: null,
  activeVisualAssetId: "visual-teacher",
};

const student = {
  id: "student-1",
  role: "student" as const,
  chineseName: "夏天",
  englishName: "Summer",
  age: 9,
  gender: "female" as const,
  archivedAt: null,
  activeVisualAssetId: null,
};

const input = {
  title: "海底图书馆",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  durationMinutes: 45 as const,
  englishLevel: "B1" as const,
  knowledgePointIds: ["grammar-1", "grammar-2"],
};

describe("course audience repository", () => {
  test("archives a course instead of deleting its generated assets", async () => {
    const updates: unknown[] = [];
    const db = {
      course: {
        findUnique: async () => ({ id: "course-1", title: "海底图书馆", durationMinutes: 45, lifecycleStatus: "draft", currentStage: "story_outline" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { id: "course-1", title: "海底图书馆", durationMinutes: 45, lifecycleStatus: "archived", currentStage: "story_outline" };
        },
      },
    } as unknown as CoursesDb;

    await archiveCourse(db, "course-1");

    expect(updates).toEqual([{ lifecycleStatus: "archived" }]);
  });

  test("creates a course atomically with identity and visual snapshots", async () => {
    const db = {
      person: { findMany: async () => [teacher, student] },
      course: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> & { people: { create: unknown } } }) => {
          expect(data).toMatchObject({
            title: "海底图书馆",
            durationMinutes: 45,
            englishLevel: "B1",
            knowledgePointIds: ["grammar-1", "grammar-2"],
            lifecycleStatus: "draft",
            currentStage: "story_outline",
          });
          expect(data.people.create).toEqual([
            {
              personId: "teacher-1",
              role: "teacher",
              chineseNameSnapshot: "林老师",
              englishNameSnapshot: "Ms. Lin",
              ageSnapshot: 32,
              genderSnapshot: "female",
              visualAssetIdSnapshot: "visual-teacher",
            },
            {
              personId: "student-1",
              role: "student",
              chineseNameSnapshot: "夏天",
              englishNameSnapshot: "Summer",
              ageSnapshot: 9,
              genderSnapshot: "female",
              visualAssetIdSnapshot: null,
            },
          ]);
          return { id: "course-1", lifecycleStatus: "draft", currentStage: "story_outline" };
        },
      },
    } as unknown as CoursesDb;
    db.$transaction = async (callback) => callback(db);
    const course = await createCourse(
      db,
      input,
      "create-course-key",
    );

    expect(course).toEqual({ id: "course-1", lifecycleStatus: "draft", currentStage: "story_outline" });
  });

  test("returns the original course for an idempotent retry", async () => {
    let createCalled = false;
    const course = await createCourse(
      {
        course: {
          findUnique: async () => ({ id: "course-existing", lifecycleStatus: "draft", currentStage: "story_outline" }),
          create: async () => {
            createCalled = true;
            return {} as never;
          },
        },
      } as unknown as CoursesDb,
      input,
      "same-key",
    );

    expect(createCalled).toBe(false);
    expect(course.id).toBe("course-existing");
  });

  test("requires reset confirmation when people or duration change after downstream work", async () => {
    await expect(
      updateCourseAudience(
        {
          course: {
            findUnique: async () => ({
              id: "course-1",
              title: "旧名称",
              durationMinutes: 30,
              currentStage: "content",
              people: [
                { personId: "teacher-1", role: "teacher" },
                { personId: "student-1", role: "student" },
              ],
            }),
          },
        } as unknown as CoursesDb,
        "course-1",
        input,
        false,
      ),
    ).rejects.toBeInstanceOf(CourseAudienceConflictError);
  });

  test("updates title without resetting downstream content", async () => {
    const updates: unknown[] = [];
    await updateCourseAudience(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            title: "旧名称",
              durationMinutes: 45,
              englishLevel: "B1",
              knowledgePointIds: ["grammar-1", "grammar-2"],
            currentStage: "content",
            people: [
              { personId: "teacher-1", role: "teacher" },
              { personId: "student-1", role: "student" },
            ],
          }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push(data);
            return { id: "course-1", lifecycleStatus: "draft", currentStage: "content" };
          },
        },
      } as unknown as CoursesDb,
      "course-1",
      { ...input, title: "新名称" },
      false,
    );

    expect(updates).toEqual([{ title: "新名称" }]);
  });

  test("lists courses from immutable person snapshots", async () => {
    const courses = await listCourses({
      course: {
        findMany: async () => [
          {
            id: "course-1",
            title: "海底图书馆",
            durationMinutes: 45,
            lifecycleStatus: "draft",
            currentStage: "story_outline",
            updatedAt: new Date("2026-08-05T08:00:00.000Z"),
            people: [
              { role: "teacher", chineseNameSnapshot: "林老师", englishNameSnapshot: "Ms. Lin" },
              { role: "student", chineseNameSnapshot: "夏天", englishNameSnapshot: "Summer" },
            ],
          },
        ],
      },
    } as unknown as CoursesDb);

    expect(courses[0]).toMatchObject({
      teacherName: "林老师",
      studentNames: ["夏天"],
      nextEditPath: "/courses/course-1/create/story-outline",
    });
  });

  test("reports when the current profile differs from the saved snapshot", async () => {
    const audience = await getCourseAudience(
      {
        course: {
          findUnique: async () => ({
            id: "course-1",
            title: "海底图书馆",
            durationMinutes: 45,
            lifecycleStatus: "draft",
            currentStage: "story_outline",
            people: [
              {
                personId: "teacher-1",
                role: "teacher",
                chineseNameSnapshot: "林老师",
                englishNameSnapshot: "Ms. Lin",
                ageSnapshot: 31,
                genderSnapshot: "female",
                visualAssetIdSnapshot: null,
                person: teacher,
              },
            ],
          }),
        },
      } as unknown as CoursesDb,
      "course-1",
    );

    expect(audience.people[0]?.profileChanged).toBe(true);
  });
});
