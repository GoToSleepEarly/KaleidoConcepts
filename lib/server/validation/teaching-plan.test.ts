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
      targetWordCount: 120,
      knowledgePointIds: chapter.outlineChapterId === "chapter-1" ? ["grammar-1"] : ["grammar-2"],
      chapterPractice: { enabled: true, grammar: { optionCloze: 2, wordForm: 2 } },
    })),
    afterClassPractice: {
      enabled: true,
      vocabularyReviewEnabled: true,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: true, grammar: { optionCloze: 4, wordForm: 0 } },
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
    expect(draft.mainIdeaTargetWordCount).toBe(120);
    expect(draft.chapters).toHaveLength(2);
    expect(draft.chapters[0]).toMatchObject({
      outlineChapterId: "chapter-1",
      targetWordCount: 180,
      knowledgePointIds: ["grammar-1"],
      readingExerciseMode: "interactive",
      readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
      chapterPractice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } },
      touched: {
        targetWordCount: false,
        knowledgePointIds: false,
        readingExerciseMode: false,
        readingExercises: false,
        chapterPractice: false,
      },
    });
    expect(draft.afterClassPractice).toMatchObject({
      enabled: false,
      vocabularyReviewEnabled: false,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: false, grammar: { optionCloze: 5, wordForm: 5 } },
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

  test("keeps after-class reading between 80 and 150 words", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan({ mainIdeaTargetWordCount: 80 }), outlineChapters.map((chapter) => chapter.id))).not.toThrow();
    expect(() => validateTeachingPlanForConfirm(completePlan({ mainIdeaTargetWordCount: 151 }), outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后阅读词数需在 80-150 之间。"));
  });

  test("accepts the default decision to skip after-class practice", () => {
    const plan = completePlan();
    plan.afterClassPractice = { ...plan.afterClassPractice, enabled: false, vocabularyReviewEnabled: false, practice: { ...plan.afterClassPractice.practice, enabled: false }, touched: { ...plan.afterClassPractice.touched, practice: false } };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id))).not.toThrow();
  });

  test("accepts vocabulary-only after-class review without grammar questions", () => {
    const plan = completePlan();
    plan.afterClassPractice = {
      ...plan.afterClassPractice,
      enabled: true,
      vocabularyReviewEnabled: true,
      practice: { ...plan.afterClassPractice.practice, enabled: false },
    };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id))).not.toThrow();
  });

  test("accepts chapter targets from 120 to 200 and rejects values outside the range", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 0 ? { ...chapter, targetWordCount: 119 } : chapter),
    }), outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章目标词数需在 120-200 之间。"));

    expect(() => validateTeachingPlanForConfirm(completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 200 } : chapter),
    }), outlineChapters.map((chapter) => chapter.id))).not.toThrow();

    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 201 } : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 2 章目标词数需在 120-200 之间。"));
  });

  test("allows optional正文 types but requires at least one grammar question", () => {
    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 0
        ? {
            ...chapter,
            readingExerciseMode: "interactive",
            readingExercises: { enabled: true, grammar: { optionCloze: 2, wordForm: 0 }, vocabulary: { chineseHint: 0 } },
          }
        : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id))).not.toThrow();

    plan.chapters[0].readingExercises.grammar = { optionCloze: 0, wordForm: 0 };
    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章至少保留 1 道正文语法题。"));
  });

  test("rejects after-class knowledge points outside chapter selections", () => {
    const plan = completePlan({
      afterClassPractice: {
        enabled: true,
        vocabularyReviewEnabled: true,
        knowledgePointIds: ["grammar-3"],
        practice: { enabled: true, grammar: { optionCloze: 6, wordForm: 0 } },
        touched: { knowledgePointIds: true, practice: true },
      },
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后练习知识点只能从章节知识点中选择。"));
  });

  test("requires正文 and chapter grammar questions to cover every chapter knowledge point", () => {
    const plan = completePlan();
    plan.chapters[0].knowledgePointIds = ["grammar-1", "grammar-2", "grammar-3"];
    plan.chapters[0].readingExercises.grammar = { optionCloze: 1, wordForm: 1 };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章正文语法题数量不能少于知识点数量。"));

    plan.chapters[0].readingExercises.grammar = { optionCloze: 2, wordForm: 1 };
    plan.chapters[0].chapterPractice.grammar = { optionCloze: 1, wordForm: 1 };
    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章章节练习语法题数量不能少于知识点数量。"));
  });

  test("requires after-class grammar questions to cover every selected knowledge point", () => {
    const plan = completePlan();
    plan.afterClassPractice.knowledgePointIds = ["grammar-1", "grammar-2"];
    plan.afterClassPractice.practice.grammar = { optionCloze: 1, wordForm: 0 };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后语法题数量不能少于所选知识点数量。"));
  });
});
