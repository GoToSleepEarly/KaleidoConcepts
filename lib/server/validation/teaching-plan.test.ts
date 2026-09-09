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
      chapterPractice: { enabled: true, grammar: { enabledTypes: ["optionCloze", "wordForm"], total: 4 } },
    })),
    afterClassPractice: {
      enabled: true,
      vocabularyReviewEnabled: true,
      knowledgePointIds: ["grammar-1", "grammar-2"],
      practice: { enabled: true, enabledTypes: ["optionCloze", "wordForm"], questionsPerKnowledgePoint: 5 },
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
      targetWordCount: 130,
      knowledgePointIds: ["grammar-1"],
      readingExerciseMode: "interactive",
      readingExercises: { enabled: true, grammar: { enabledTypes: ["optionCloze", "wordForm"], total: 7 }, vocabulary: { enabledTypes: ["chineseHint"], total: 3 } },
      chapterPractice: { enabled: false, grammar: { enabledTypes: ["optionCloze", "wordForm"], total: 10 } },
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
      practice: { enabled: false, enabledTypes: ["optionCloze", "wordForm"], questionsPerKnowledgePoint: 5 },
      touched: { knowledgePointIds: false, practice: false },
    });
  });

  test("uses the unified CEFR and default-complexity recommendation", () => {
    const fourChapters = [
      ...outlineChapters,
      { ...outlineChapters[0], id: "chapter-3" },
      { ...outlineChapters[1], id: "chapter-4" },
    ];
    const b1Draft = buildTeachingPlanDraft({
      courseId: "course-b1",
      englishLevel: "B1",
      durationMinutes: 45,
      chapters: fourChapters,
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    const a2Draft = buildTeachingPlanDraft({
      courseId: "course-a2",
      englishLevel: "A2",
      durationMinutes: 45,
      chapters: fourChapters,
      updatedAt: "2026-08-20T00:00:00.000Z",
    });

    expect(b1Draft.chapters.every((chapter) => chapter.targetWordCount === 130)).toBe(true);
    expect(a2Draft.chapters.every((chapter) => chapter.targetWordCount === 90)).toBe(true);
  });

  test("accepts a complete teaching plan", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan(), outlineChapters.map((chapter) => chapter.id))).not.toThrow();
  });

  test("allows a chapter without grammar points but requires at least one point in the course", () => {
    const chapters = [outlineChapters[0], { ...outlineChapters[1], recommendedKnowledgePointIds: [] }];
    const draft = buildTeachingPlanDraft({ courseId: "course-1", englishLevel: "B1", durationMinutes: 45, chapters, updatedAt: "2026-08-26T00:00:00.000Z" });
    const plan = completePlan({
      chapters: draft.chapters.map((chapter, index) => index === 0
        ? { ...chapter, targetWordCount: 120 }
        : { ...chapter, targetWordCount: 120, knowledgePointIds: [] }),
      afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, enabledTypes: ["optionCloze", "wordForm"], questionsPerKnowledgePoint: 5 }, touched: { knowledgePointIds: false, practice: false } },
    });

    expect(draft.chapters[1].readingExercises).toEqual({ enabled: true, grammar: { enabledTypes: [], total: 0 }, vocabulary: { enabledTypes: ["chineseHint"], total: 3 } });
    expect(() => validateTeachingPlanForConfirm(plan, chapters.map((chapter) => chapter.id))).not.toThrow();

    plan.chapters[0] = { ...plan.chapters[0], knowledgePointIds: [], readingExercises: draft.chapters[1].readingExercises, chapterPractice: { ...plan.chapters[0].chapterPractice, enabled: false } };
    expect(() => validateTeachingPlanForConfirm(plan, chapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("整门课程至少需要分配 1 个知识点。"));
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

  test("accepts teacher targets from 60 to 200", () => {
    expect(() => validateTeachingPlanForConfirm(completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 0 ? { ...chapter, targetWordCount: 59 } : chapter),
    }), outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章目标词数需在 60-200 之间。"));

    expect(() => validateTeachingPlanForConfirm(completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 200 } : chapter),
    }), outlineChapters.map((chapter) => chapter.id))).not.toThrow();

    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 1 ? { ...chapter, targetWordCount: 201 } : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 2 章目标词数需在 60-200 之间。"));
  });

  test("accepts one to three正文 pages and rejects larger values", () => {
    expect(() => validateTeachingPlanForConfirm({
      ...completePlan(),
      chapters: completePlan().chapters.map((chapter, index) => index === 0 ? { ...chapter, paragraphCount: 3 } : chapter),
    }, ["chapter-1", "chapter-2"])).not.toThrow();

    expect(() => validateTeachingPlanForConfirm({
      ...completePlan(),
      chapters: completePlan().chapters.map((chapter, index) => index === 0 ? { ...chapter, paragraphCount: 4 } : chapter),
    }, ["chapter-1", "chapter-2"])).toThrow(new TeachingPlanValidationError());
  });

  test("allows optional正文 types but requires at least one grammar question", () => {
    const plan = completePlan({
      chapters: completePlan().chapters.map((chapter, index) => index === 0
        ? {
            ...chapter,
            readingExerciseMode: "interactive",
            readingExercises: { enabled: true, grammar: { enabledTypes: ["optionCloze"], total: 2 }, vocabulary: { enabledTypes: [], total: 0 } },
          }
        : chapter),
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id))).not.toThrow();

    plan.chapters[0].readingExercises.grammar = { enabledTypes: [], total: 0 };
    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章至少保留 1 道正文语法题。"));
  });

  test("rejects after-class knowledge points outside chapter selections", () => {
    const plan = completePlan({
      afterClassPractice: {
        enabled: true,
        vocabularyReviewEnabled: true,
        knowledgePointIds: ["grammar-3"],
        practice: { enabled: true, enabledTypes: ["optionCloze"], questionsPerKnowledgePoint: 5 },
        touched: { knowledgePointIds: true, practice: true },
      },
    });

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后练习知识点只能从章节知识点中选择。"));
  });

  test("requires正文 and chapter grammar questions to cover every chapter knowledge point", () => {
    const plan = completePlan();
    plan.chapters[0].knowledgePointIds = ["grammar-1", "grammar-2", "grammar-3"];
    plan.chapters[0].readingExercises.grammar = { enabledTypes: ["optionCloze", "wordForm"], total: 2 };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章正文语法题数量不能少于知识点数量。"));

    plan.chapters[0].readingExercises.grammar = { enabledTypes: ["optionCloze", "wordForm"], total: 3 };
    plan.chapters[0].chapterPractice.grammar = { enabledTypes: ["optionCloze", "wordForm"], total: 2 };
    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章章节练习语法题数量不能少于知识点数量。"));
  });

  test("requires an enabled type for after-class grammar questions", () => {
    const plan = completePlan();
    plan.afterClassPractice.knowledgePointIds = ["grammar-1", "grammar-2"];
    plan.afterClassPractice.practice.enabledTypes = [];

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("课后练习至少选择一种题型。"));
  });

  test("keeps the vocabulary type selection consistent with its total", () => {
    const plan = completePlan();
    plan.chapters[0].readingExercises.vocabulary = { enabledTypes: [], total: 3 };

    expect(() => validateTeachingPlanForConfirm(plan, outlineChapters.map((chapter) => chapter.id)))
      .toThrow(new TeachingPlanValidationError("第 1 章未选择词汇题型，词汇题总数应为 0。"));
  });
});
