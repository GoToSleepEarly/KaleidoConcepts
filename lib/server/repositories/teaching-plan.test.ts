import { describe, expect, test, vi } from "vitest";

import type { TeachingPlan } from "@/lib/contracts/api";
import {
  CourseTeachingPlanPrerequisiteError,
  confirmTeachingPlan,
  getTeachingPlanState,
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
      targetWordCount: 90,
      knowledgePointIds: [`grammar-${index + 1}`],
      chapterPractice: { enabled: true, grammar: { optionCloze: 4, wordForm: 0 } },
    })),
    afterClassPractice: {
      enabled: true,
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
    presets: Record<string, unknown>[];
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
    presets: [
      record({ id: "grammar-1", kind: "grammar", label: "Past Simple", category: "时态", sortOrder: 0, archivedAt: null }),
      record({ id: "grammar-2", kind: "grammar", label: "Wh- Questions", category: "句型", sortOrder: 1, archivedAt: null }),
      record({ id: "grammar-3", kind: "grammar", label: "Present Perfect", category: "时态", sortOrder: 2, archivedAt: null }),
    ],
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
    presetOption: {
      findMany: vi.fn(async () => state.presets),
    },
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
    expect(state.knowledgePoints.map((point) => point.label)).toEqual(["Past Simple", "Wh- Questions", "Present Perfect"]);
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

  test("does not create a plan before story outline is confirmed", async () => {
    const db = createDb();
    db.state.course = { ...db.state.course, currentStage: "story_outline" };

    await expect(getTeachingPlanState(db, "course-1")).rejects.toBeInstanceOf(CourseTeachingPlanPrerequisiteError);
  });

  test("saves a draft without advancing course stage", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    const plan = completePlan(state.plan);
    plan.chapters[0].paragraphCount = 6;

    const saved = await saveTeachingPlan(db, "course-1", plan);

    expect(saved.englishLevel).toBe("B1");
    expect(saved.chapters[0].paragraphCount).not.toBe(6);
    expect(db.state.course.currentStage).toBe("teaching_plan");
  });

  test("allows teachers to add an active grammar point outside the Step 1 AI scope", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    const plan = completePlan(state.plan);
    plan.chapters[0].knowledgePointIds.push("grammar-3");

    const saved = await saveTeachingPlan(db, "course-1", plan);

    expect(saved.chapters[0].knowledgePointIds).toContain("grammar-3");
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
      ],
      afterClassPractice: {
        enabled: true,
        knowledgePointIds: ["grammar-1"],
        practice: { enabled: true, grammar: { optionCloze: 3 } },
        touched: { knowledgePointIds: true, practice: true },
      },
      confirmedAt: null,
    });

    const state = await getTeachingPlanState(db, "course-1");

    expect(state.plan.chapters[0].readingExerciseMode).toBe("interactive");
    expect(state.plan.chapters[0].readingExercises).toEqual({ enabled: true, grammar: { optionCloze: 2, wordForm: 3 }, vocabulary: { chineseHint: 3 } });
    expect(state.plan.chapters[0].chapterPractice).toEqual({ enabled: true, grammar: { optionCloze: 5, wordForm: 3 } });
    expect(state.plan.afterClassPractice.practice).toEqual({ enabled: true, grammar: { optionCloze: 3, wordForm: 5 } });
  });

  test("confirms a complete plan and advances to content", async () => {
    const db = createDb();
    const state = await getTeachingPlanState(db, "course-1");
    await saveTeachingPlan(db, "course-1", completePlan(state.plan));

    const result = await confirmTeachingPlan(db, "course-1", false);

    expect(result.course.currentStage).toBe("content");
    expect(result.plan.status).toBe("confirmed");
    expect(result.plan.confirmedAt).toBeTruthy();
  });
});
