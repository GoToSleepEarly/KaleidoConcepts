import { describe, expect, test } from "vitest";

import type { TeachingPlan } from "@/lib/contracts/api";
import { TeachingPlanValidationError, buildTeachingPlanDraft, validateTeachingPlanForConfirm } from "@/lib/server/validation/teaching-plan";

const outlineChapters = [
  { id: "chapter-1", title: "The Map", summary: "Students find a glowing map.", recommendedKnowledgePointIds: ["grammar-1"], knowledgePointRecommendationSummary: "适合地图线索。" },
  { id: "chapter-2", title: "The Gate", summary: "Students open a hidden gate.", recommendedKnowledgePointIds: ["grammar-2"], knowledgePointRecommendationSummary: "适合行动表达。" },
];

function completePlan(overrides: Partial<TeachingPlan> = {}): TeachingPlan {
  const draft = buildTeachingPlanDraft({
    courseId: "course-1",
    englishLevel: "B1",
    durationMinutes: 45,
    chapters: outlineChapters,
    updatedAt: "2026-08-07T00:00:00.000Z",
  });
  return {
    ...draft,
    englishLevel: "B1",
    chapters: draft.chapters.map((chapter) => ({
      ...chapter,
      targetWordCount: 90,
      knowledgePointIds: chapter.outlineChapterId === "chapter-1" ? ["grammar-1"] : ["grammar-2"],
      chapterPractice: { enabled: true, countsByType: { choice: 2, blank: 2, vocab: 0, matching: 0 } },
    })),
    afterClassPractice: {
      enabled: true,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: true, countsByType: { choice: 4, blank: 0, vocab: 0, matching: 4 } },
      touched: { knowledgePointIds: false, practice: true },
    },
    ...overrides,
  };
}

describe("teaching plan validation", () => {
  test("creates a complete draft from Step 1, AI recommendations, and fixed exercise defaults", () => {
    const draft = buildTeachingPlanDraft({
      courseId: "course-1",
      englishLevel: "B1",
      durationMinutes: 45,
      chapters: outlineChapters,
      updatedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(draft.englishLevel).toBe("B1");
    expect(draft.status).toBe("draft");
    expect(draft.chapters).toHaveLength(2);
    expect(draft.chapters[0]).toMatchObject({
      outlineChapterId: "chapter-1",
      targetWordCount: 180,
      knowledgePointIds: ["grammar-1"],
      readingExerciseMode: "none",
      embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } },
      chapterPractice: { enabled: true, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } },
      touched: {
        targetWordCount: false,
        knowledgePointIds: false,
        readingExerciseMode: false,
        embeddedExercises: false,
        chapterPractice: false,
      },
    });
    expect(draft.afterClassPractice).toMatchObject({
      enabled: false,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: false, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } },
      touched: { knowledgePointIds: false, practice: false },
    });
  });

  test("accepts a complete teaching plan", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan(), outlineChapters.map((chapter) => chapter.id))).not.toThrow();
  });

  test("requires English level before confirmation", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan({ englishLevel: null }), outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("请选择英语难度。"));
  });

  test("requires an explicit after-class practice decision", () => {
    const plan = completePlan();
    plan.afterClassPractice.touched.practice = false;

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("请选择是否生成课后练习。"));
  });

  test("accepts target word count up to 200 and rejects values above it", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 200 } : chapter),
    }), outlineChapters.map((chapter) => chapter.id))).not.toThrow();

    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 201 } : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 2 章目标词数需在 50-200 之间。"));
  });

  test("rejects matching questions in embedded reading exercises", () => {
    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 0
        ? {
            ...chapter,
            readingExerciseMode: "embedded",
            embeddedExercises: { enabled: true, countsByType: { choice: 1, blank: 1, vocab: 0, matching: 1 } as never },
          }
        : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章内嵌题型不支持匹配题。"));
  });

  test("rejects after-class knowledge points outside chapter selections", () => {
    const plan = completePlan({
      afterClassPractice: {
        enabled: true,
        knowledgePointIds: ["grammar-3"],
        practice: { enabled: true, countsByType: { choice: 6, blank: 0, vocab: 0, matching: 0 } },
        touched: { knowledgePointIds: true, practice: true },
      },
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后练习知识点只能从章节知识点中选择。"));
  });
});
