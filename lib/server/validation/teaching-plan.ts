import { z } from "zod";

import type { TeachingPlan } from "@/lib/contracts/api";
import { defaultPracticeConfig, defaultReadingExerciseConfig, grammarExerciseTotal, MAX_CHAPTER_TARGET_WORD_COUNT, MIN_CHAPTER_TARGET_WORD_COUNT, minimumReadingParagraphCount, recommendedChapterWordCount } from "@/lib/domain/teaching-plan-policy";

export const englishLevelSchema = z.union([
  z.literal("Starter"),
  z.literal("A1"),
  z.literal("A2"),
  z.literal("B1"),
  z.literal("B2"),
  z.literal("C1"),
  z.literal("C2"),
]);

const grammarCountsSchema = z.object({
  optionCloze: z.number().int().min(0).max(20),
  wordForm: z.number().int().min(0).max(20),
});

const exerciseConfigSchema = z.object({
  enabled: z.boolean(),
  grammar: grammarCountsSchema,
  vocabulary: z.object({ chineseHint: z.number().int().min(0).max(8) }),
});

const practiceConfigSchema = z.object({
  enabled: z.boolean(),
  grammar: grammarCountsSchema,
});

export const teachingPlanSchema = z.object({
  courseId: z.string().min(1),
  status: z.union([z.literal("draft"), z.literal("confirmed")]),
  englishLevel: englishLevelSchema.nullable(),
  mainIdeaTargetWordCount: z.number().int().default(120),
  chapters: z.array(z.object({
    outlineChapterId: z.string().min(1),
    targetWordCount: z.number().int().nullable(),
    paragraphCount: z.number().int().min(1),
    knowledgePointIds: z.array(z.string().min(1)),
    readingExerciseMode: z.union([z.literal("complete"), z.literal("interactive")]),
    readingExercises: exerciseConfigSchema,
    chapterPractice: practiceConfigSchema,
    touched: z.object({
      targetWordCount: z.boolean(),
      paragraphCount: z.boolean(),
      knowledgePointIds: z.boolean(),
      readingExerciseMode: z.boolean(),
      readingExercises: z.boolean(),
      chapterPractice: z.boolean(),
    }),
  })),
  afterClassPractice: z.object({
    enabled: z.boolean(),
    vocabularyReviewEnabled: z.boolean(),
    knowledgePointIds: z.array(z.string().min(1)),
    practice: practiceConfigSchema,
    touched: z.object({
      knowledgePointIds: z.boolean(),
      practice: z.boolean(),
    }),
  }),
  updatedAt: z.string().min(1),
  confirmedAt: z.string().nullable(),
});

export class TeachingPlanValidationError extends Error {
  constructor(message = "教学规划信息不完整") {
    super(message);
    this.name = "TeachingPlanValidationError";
  }
}

export function buildTeachingPlanDraft(input: {
  courseId: string;
  englishLevel: NonNullable<TeachingPlan["englishLevel"]>;
  durationMinutes: 30 | 45 | 60;
  chapters: Array<{ id: string; title: string; summary: string; recommendedKnowledgePointIds: string[]; knowledgePointRecommendationSummary: string }>;
  updatedAt: string;
}): TeachingPlan {
  const recommendedKnowledgePointIds = [...new Set(input.chapters.flatMap((chapter) => chapter.recommendedKnowledgePointIds))];
  return {
    courseId: input.courseId,
    status: "draft",
    englishLevel: input.englishLevel,
    mainIdeaTargetWordCount: 120,
    chapters: input.chapters.map((chapter) => {
      const targetWordCount = recommendedChapterWordCount(input.englishLevel, input.durationMinutes, input.chapters.length);
      const readingExercises = defaultReadingExerciseConfig();
      return {
        outlineChapterId: chapter.id,
        targetWordCount,
        paragraphCount: minimumReadingParagraphCount(targetWordCount, readingExercises),
        knowledgePointIds: chapter.recommendedKnowledgePointIds,
        readingExerciseMode: "interactive",
        readingExercises,
        chapterPractice: defaultPracticeConfig(false),
        touched: {
          targetWordCount: false,
          paragraphCount: false,
          knowledgePointIds: false,
          readingExerciseMode: false,
          readingExercises: false,
          chapterPractice: false,
        },
      };
    }),
    afterClassPractice: {
      enabled: false,
      vocabularyReviewEnabled: false,
      knowledgePointIds: recommendedKnowledgePointIds,
      practice: defaultPracticeConfig(false),
      touched: { knowledgePointIds: false, practice: false },
    },
    updatedAt: input.updatedAt,
    confirmedAt: null,
  };
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function requireGrammarPractice(enabled: boolean, counts: TeachingPlan["chapters"][number]["chapterPractice"]["grammar"], messagePrefix: string, max: number) {
  if (!enabled) return;
  const count = grammarExerciseTotal(counts);
  if (count < 1) throw new TeachingPlanValidationError(`${messagePrefix}至少保留 1 道语法题。`);
  if (count > max) throw new TeachingPlanValidationError(`${messagePrefix}题量不能超过 ${max} 道。`);
}

export function validateTeachingPlanForConfirm(plan: TeachingPlan, outlineChapterIds: string[]) {
  const parsed = teachingPlanSchema.safeParse(plan);
  if (!parsed.success) throw new TeachingPlanValidationError();
  if (!plan.englishLevel) throw new TeachingPlanValidationError("请选择英语难度。");
  const mainIdeaTargetWordCount = plan.mainIdeaTargetWordCount ?? 120;
  if (mainIdeaTargetWordCount < 80 || mainIdeaTargetWordCount > 150) throw new TeachingPlanValidationError("课后阅读词数需在 80-150 之间。");
  const planChapterIds = plan.chapters.map((chapter) => chapter.outlineChapterId);
  if (!sameIds(planChapterIds, outlineChapterIds)) throw new TeachingPlanValidationError("教学规划章节与故事大纲不一致。");

  for (const [index, chapter] of plan.chapters.entries()) {
    const label = `第 ${index + 1} 章`;
    if (chapter.targetWordCount === null || chapter.targetWordCount < MIN_CHAPTER_TARGET_WORD_COUNT || chapter.targetWordCount > MAX_CHAPTER_TARGET_WORD_COUNT) {
      throw new TeachingPlanValidationError(`${label}目标词数需在 ${MIN_CHAPTER_TARGET_WORD_COUNT}-${MAX_CHAPTER_TARGET_WORD_COUNT} 之间。`);
    }
    if (!chapter.knowledgePointIds.length) throw new TeachingPlanValidationError(`${label}还没有选择知识点。`);
    if (!chapter.readingExercises.enabled || grammarExerciseTotal(chapter.readingExercises.grammar) < 1) {
      throw new TeachingPlanValidationError(`${label}至少保留 1 道正文语法题。`);
    }
    if (grammarExerciseTotal(chapter.readingExercises.grammar) < chapter.knowledgePointIds.length) {
      throw new TeachingPlanValidationError(`${label}正文语法题数量不能少于知识点数量。`);
    }
    requireGrammarPractice(chapter.chapterPractice.enabled, chapter.chapterPractice.grammar, `${label}章节练习`, 20);
    if (chapter.chapterPractice.enabled && grammarExerciseTotal(chapter.chapterPractice.grammar) < chapter.knowledgePointIds.length) {
      throw new TeachingPlanValidationError(`${label}章节练习语法题数量不能少于知识点数量。`);
    }
  }

  if (plan.afterClassPractice.enabled) {
    if (!plan.afterClassPractice.vocabularyReviewEnabled && !plan.afterClassPractice.practice.enabled) {
      throw new TeachingPlanValidationError("课后练习至少开启词汇复习或语法习题中的一项。");
    }
    if (!plan.afterClassPractice.practice.enabled) return;
    const chapterKnowledgePoints = new Set(plan.chapters.flatMap((chapter) => chapter.knowledgePointIds));
    if (!plan.afterClassPractice.knowledgePointIds.length) throw new TeachingPlanValidationError("课后练习还没有选择知识点。");
    if (plan.afterClassPractice.knowledgePointIds.some((id) => !chapterKnowledgePoints.has(id))) {
      throw new TeachingPlanValidationError("课后练习知识点只能从章节知识点中选择。");
    }
    requireGrammarPractice(plan.afterClassPractice.practice.enabled, plan.afterClassPractice.practice.grammar, "课后练习", 40);
    if (grammarExerciseTotal(plan.afterClassPractice.practice.grammar) < plan.afterClassPractice.knowledgePointIds.length) {
      throw new TeachingPlanValidationError("课后语法题数量不能少于所选知识点数量。");
    }
  }
}

export function parseTeachingPlan(input: unknown): TeachingPlan {
  const parsed = teachingPlanSchema.safeParse(input);
  if (!parsed.success) throw new TeachingPlanValidationError();
  return parsed.data as TeachingPlan;
}
