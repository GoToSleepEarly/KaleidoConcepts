import { describe, expect, test, vi } from "vitest";

import type { TeachingPlan } from "@/lib/contracts/api";
import {
  CourseTeachingPlanConflictError,
  CourseTeachingPlanPrerequisiteError,
  confirmTeachingPlan,
  getTeachingPlanState,
  resetTeachingPlan,
  saveTeachingPlan,
  type TeachingPlanDb,
} from "@/lib/server/repositories/teaching-plan";

function record(data: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date("2026-08-07T00:00:00.000Z"),
    updatedAt: new Date("2026-08-07T00:00:00.000Z"),
    ...data,
  };
}

function completePlan(plan: TeachingPlan): TeachingPlan {
  return {
    ...plan,
    englishLevel: "B1",
    chapters: plan.chapters.map((chapter, index) => ({
      ...chapter,
      targetWordCount: 120,
      knowledgePointIds: [`grammar-${index + 1}`],
      chapterPractice: { enabled: true, grammar: { optionCloze: 4, wordForm: 0 } },
    })),
    afterClassPractice: {
      enabled: true,
      vocabularyReviewEnabled: true,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: true, grammar: { optionCloze: 8, wordForm: 0 } },
      touched: { knowledgePointIds: false, practice: true },
    },
  };
}

function createDb() {
  const state: {
    course: Record<string, unknown>;
    outline: Record<string, unknown> | null;
    chapters: Record<string, unknown>[];
    plan: Record<string, unknown> | null;
    knowledgePoints: Record<string, unknown>[];
    contentExists: boolean;
  } = {
    course: record({
      id: "course-1",
      title: "海底图书馆",
      durationMinutes: 45,
      currentStage: "teaching_plan",
      englishLevel: "B1",
      knowledgePointIds: ["grammar-1", "grammar-2"],
    }),
    outline: record({
      id: "outline-1",
      courseId: "course-1",
      title: "海底图书馆",
      summary: "学生进入海底图书馆。",
    }),
    chapters: [
      record({ id: "outline-chapter-1", order: 1, title: "发光地图", storyGoal: "找到地图", keyEvents: ["发现地图"], recommendedKnowledgePointIds: ["grammar-1"], knowledgePointRecommendationSummary: "适合地图线索。" }),
      record({ id: "outline-chapter-2", order: 2, title: "蓝色书页", storyGoal: "找到书页", keyEvents: ["打开门"], recommendedKnowledgePointIds: ["grammar-2"], knowledgePointRecommendationSummary: "适合行动表达。" }),
    ],
    plan: null,
    knowledgePoints: [
      record({ id: "grammar-1", title: "Past Simple", sortOrder: 0, section: { officialTitle: "Present and past" }, bookEdition: { title: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2" }, units: [{ unitNumber: 5, officialTitle: "Past simple" }] }),
      record({ id: "grammar-2", title: "Wh- Questions", sortOrder: 1, section: { officialTitle: "Questions" }, bookEdition: { title: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2" }, units: [{ unitNumber: 49, officialTitle: "Questions 1" }] }),
      record({ id: "grammar-3", title: "Present Perfect", sortOrder: 2, section: { officialTitle: "Present perfect and past" }, bookEdition: { title: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2" }, units: [{ unitNumber: 7, officialTitle: "Present perfect 1" }] }),
    ],
    contentExists: false,
  };

  const db: TeachingPlanDb & { state: typeof state } = {
    state,
    course: {
      findUnique: vi.fn(async () => state.course),
      update: vi.fn(async ({ data }) => {
        state.course = { ...state.course, ...data };
        return state.course;
      }),
    },
    courseStoryOutline: {
      findUnique: vi.fn(async () => state.outline ? { ...state.outline, chapters: state.chapters } : null),
    },
    courseTeachingPlan: {
      findUnique: vi.fn(async () => state.plan),
      upsert: vi.fn(async ({ create, update }) => {
        state.plan = state.plan
          ? { ...state.plan, ...update, updatedAt: new Date("2026-08-07T00:10:00.000Z") }
          : record(create);
        return state.plan;
      }),
      update: vi.fn(async ({ data }) => {
        state.plan = { ...state.plan, ...data, updatedAt: new Date("2026-08-07T00:20:00.000Z") };
        return state.plan;
      }),
    },
    knowledgePoint: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => state.knowledgePoints.filter((point) => where.id.in.includes(String(point.id)))),
    },
    courseLessonContent: {
      findUnique: vi.fn(async () => state.contentExists ? { courseId: "course-1" } : null),
      deleteMany: vi.fn(async () => { state.contentExists = false; return { count: 1 }; }),
    },
    courseContentGeneration: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    courseContentChatMessage: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: async <T>(callback: (tx: TeachingPlanDb) => Promise<T>) => callback(db),
  } as unknown as TeachingPlanDb & { state: typeof state };
  return db;
}

describe("teaching plan repository", () => {
  test("creates a draft shell from confirmed story outline", async () => {
    const db = createDb();

    const state = await getTeachingPlanState(db, "course-1");

    expect(state.course.currentStage).toBe("teaching_plan");
    expect(state.outline.chapters.map((chapter) => chapter.title)).toEqual(["发光地图", "蓝色书页"]);
    expect(state.knowledgePoints.map((point) => point.label)).toEqual(["Past Simple", "Wh- Questions"]);
    expect(state.knowledgePoints[0]).toMatchObject({ bookTitle: "English Grammar in Use", edition: "5th Edition", unitStart: 5, unitEnd: 5 });
    expect(state.plan.status).toBe("draft");
    expect(state.plan.mainIdeaTargetWordCount).toBe(120);
    expect(state.plan.englishLevel).toBe("B1");
    expect(state.plan.chapters[0]).toMatchObject({ targetWordCount: 180, knowledgePointIds: ["grammar-1"], readingExerciseMode: "interactive", chapterPractice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } } });
    expect(state.plan.chapters.map((chapter) => chapter.outlineChapterId)).toEqual(["outline-chapter-1", "outline-chapter-2"]);
    expect(state.plan.afterClassPractice.knowledgePointIds).toEqual(["grammar-1", "grammar-2"]);
    expect(state.outline.chapters[0]).toMatchObject({
      recommendedKnowledgePointIds: ["grammar-1"],
      knowledgePointRecommendationSummary: "适合地图线索。",
    });
  });

  test("rebuilds a stale plan when Step 2 has replaced its outline chapters", async () => {
    const db = createDb();
    db.state.plan = record({
      courseId: "course-1",
      status: "confirmed",
      englishLevel: "B1",
      mainIdeaTargetWordCount: 120,
      chapters: [{
        outlineChapterId: "old-outline-chapter",
        targetWordCount: 120,
        knowledgePointIds: ["grammar-1"],
        readingExerciseMode: "interactive",
        readingExercises: { enabled: true, grammar: { optionCloze: 5, wordForm: 5 }, vocabulary: { chineseHint: 3 } },
        chapterPractice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } },
        touched: { targetWordCount: true, paragraphCount: false, knowledgePointIds: true, readingExerciseMode: false, readingExercises: false, chapterPractice: false },
      }],
      afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: ["grammar-1"], practice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } }, touched: { knowledgePointIds: false, practice: false } },
      confirmedAt: new Date("2026-08-07T00:00:00.000Z"),
    });
    db.state.course = { ...db.state.course, currentStage: "content" };

    const state = await getTeachingPlanState(db, "course-1");

    expect(state.plan.status).toBe("draft");
    expect(state.plan.confirmedAt).toBeNull();
    expect(state.plan.chapters.map((chapter) => chapter.outlineChapterId)).toEqual(["outline-chapter-1", "outline-chapter-2"]);
    expect(db.state.course.currentStage).toBe("content");
  });

  test("resets Step 3 to a fresh draft from the current outline recommendations", async () => {
    const db = createDb();
    const initial = await getTeachingPlanState(db, "course-1");
    const edited = completePlan(initial.plan);
    edited.chapters[0].targetWordCount = 200;
    edited.chapters[0].knowledgePointIds = ["grammar-2"];
    await saveTeachingPlan(db, "course-1", edited);
    db.state.course = { ...db.state.course, currentStage: "content" };
    db.state.contentExists = true;

    const reset = await resetTeachingPlan(db, "course-1");

    expect(reset.status).toBe("draft");
    expect(reset.chapters[0]).toMatchObject({ targetWordCount: 180, knowledgePointIds: ["grammar-1"] });
    expect(reset.confirmedAt).toBeNull();
    expect(db.state.course.currentStage).toBe("content");
    expect(db.state.contentExists).toBe(true);
  });

  test("does not create a plan before story outline is confirmed", async () => {
    const db = createDb();
    db.state.course = { ...db.state.course, currentStage: "story_outline" };

    await expect(getTeachingPlanState(db, "course-1")).rejects.toBeInstanceOf(CourseTeachingPlanPrerequisiteError);
  });

  test("saves a draft without moving a later course backwards", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    const plan = completePlan(state.plan);
    plan.chapters[0].paragraphCount = 6;
    db.state.course = { ...db.state.course, currentStage: "preview" };
    db.state.contentExists = true;

    const saved = await saveTeachingPlan(db, "course-1", plan);

    expect(saved.englishLevel).toBe("B1");
    expect(saved.chapters[0].paragraphCount).not.toBe(6);
    expect(db.state.course.currentStage).toBe("preview");
    expect(db.state.contentExists).toBe(true);
    expect(db.courseLessonContent?.deleteMany).not.toHaveBeenCalled();
  });

  test("rejects knowledge points outside the Step 1 selection", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    const plan = completePlan(state.plan);
    plan.chapters[0].knowledgePointIds.push("grammar-3");

    await expect(saveTeachingPlan(db, "course-1", plan)).rejects.toThrow("知识点只能从第一步已选范围中分配。");
  });

  test("fills missing exercise fields with the current defaults when reading a saved plan", async () => {
    const db = createDb();
    db.state.plan = record({
      courseId: "course-1",
      status: "draft",
      englishLevel: "B1",
      chapters: [
        {
          outlineChapterId: "outline-chapter-1",
          targetWordCount: 90,
          knowledgePointIds: ["grammar-1"],
          readingExerciseMode: "interactive",
          readingExercises: { grammar: { optionCloze: 2 }, vocabulary: {} },
          chapterPractice: { enabled: true, grammar: { wordForm: 3 } },
          touched: { targetWordCount: true, readingExerciseMode: true, readingExercises: true, chapterPractice: true },
        },
        {
          outlineChapterId: "outline-chapter-2",
          targetWordCount: 120,
          knowledgePointIds: ["grammar-2"],
          readingExerciseMode: "interactive",
          readingExercises: { grammar: { optionCloze: 2 }, vocabulary: {} },
          chapterPractice: { enabled: false, grammar: {} },
          touched: { targetWordCount: true, readingExerciseMode: true, readingExercises: true, chapterPractice: false },
        },
      ],
      afterClassPractice: {
        enabled: true,
        vocabularyReviewEnabled: true,
        knowledgePointIds: ["grammar-1"],
        practice: { enabled: true, grammar: { optionCloze: 3 } },
        touched: { knowledgePointIds: true, practice: true },
      },
      confirmedAt: null,
    });

    const state = await getTeachingPlanState(db, "course-1");

    expect(state.plan.chapters[0].readingExerciseMode).toBe("interactive");
    expect(state.plan.chapters[0].targetWordCount).toBe(120);
    expect(state.plan.chapters[0].readingExercises).toEqual({ enabled: true, grammar: { optionCloze: 2, wordForm: 3 }, vocabulary: { chineseHint: 3 } });
    expect(state.plan.chapters[0].chapterPractice).toEqual({ enabled: true, grammar: { optionCloze: 5, wordForm: 3 } });
    expect(state.plan.afterClassPractice.practice).toEqual({ enabled: true, grammar: { optionCloze: 3, wordForm: 5 } });
  });

  test("confirms a complete plan and advances to content", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    await saveTeachingPlan(db, "course-1", completePlan(state.plan));

    const result = await confirmTeachingPlan(db, "course-1", "check");

    expect(result.course.currentStage).toBe("content");
    expect(result.plan.status).toBe("confirmed");
    expect(result.plan.confirmedAt).toBeTruthy();
  });

  test("requires confirmation and preserves stale Step 4 content after an edited plan is reconfirmed", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    await saveTeachingPlan(db, "course-1", completePlan(state.plan));
    db.state.course = { ...db.state.course, currentStage: "content" };
    db.state.contentExists = true;

    await expect(confirmTeachingPlan(db, "course-1", "check")).rejects.toBeInstanceOf(CourseTeachingPlanConflictError);
    const result = await confirmTeachingPlan(db, "course-1", "preserve");

    expect(db.state.contentExists).toBe(true);
    expect(result.course.staleFromStage).toBe("content");
    expect(db.courseContentChatMessage?.deleteMany).not.toHaveBeenCalled();
    expect(db.courseContentGeneration?.deleteMany).not.toHaveBeenCalled();
  });

  test("confirms the new plan while preserving existing downstream content when chosen", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    await saveTeachingPlan(db, "course-1", completePlan(state.plan));
    db.state.contentExists = true;

    const result = await confirmTeachingPlan(db, "course-1", "preserve");

    expect(result.plan.status).toBe("confirmed");
    expect(result.course.currentStage).toBe("content");
    expect(db.state.contentExists).toBe(true);
    expect(db.courseLessonContent?.deleteMany).not.toHaveBeenCalled();
  });

  test("reconfirming an unchanged confirmed plan is idempotent and keeps the furthest stage", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    await saveTeachingPlan(db, "course-1", completePlan(state.plan));
    await confirmTeachingPlan(db, "course-1", "check");
    db.state.course = { ...db.state.course, currentStage: "preview" };
    db.state.contentExists = true;

    const result = await confirmTeachingPlan(db, "course-1", "check");

    expect(result.course.currentStage).toBe("preview");
    expect(db.state.contentExists).toBe(true);
    expect(db.courseContentChatMessage?.deleteMany).not.toHaveBeenCalled();
  });

  test("keeps a legacy confirmed plan below the new word floor unchanged", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    const legacyPlan = completePlan(state.plan);
    legacyPlan.status = "confirmed";
    legacyPlan.confirmedAt = "2026-08-01T00:00:00.000Z";
    legacyPlan.chapters = legacyPlan.chapters.map((chapter) => ({ ...chapter, targetWordCount: 90 }));
    db.state.plan = record({
      courseId: legacyPlan.courseId,
      status: legacyPlan.status,
      englishLevel: legacyPlan.englishLevel,
      mainIdeaTargetWordCount: legacyPlan.mainIdeaTargetWordCount,
      chapters: legacyPlan.chapters,
      afterClassPractice: legacyPlan.afterClassPractice,
      confirmedAt: new Date(legacyPlan.confirmedAt),
    });
    db.state.course = { ...db.state.course, currentStage: "content" };

    const result = await confirmTeachingPlan(db, "course-1", "check");

    expect(result.plan.chapters.every((chapter) => chapter.targetWordCount === 90)).toBe(true);
    expect(db.courseTeachingPlan.update).not.toHaveBeenCalled();
  });
});
