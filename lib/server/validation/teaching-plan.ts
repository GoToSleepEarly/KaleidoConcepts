import { z } from "zod";

import type { ExerciseType, TeachingPlan } from "@/lib/contracts/api";
import { defaultPracticeConfig, recommendedChapterWordCount } from "@/lib/domain/teaching-plan-policy";

const embeddedExerciseTypes = ["choice", "blank", "vocab"] as const;
const practiceExerciseTypes = ["choice", "blank", "vocab", "matching"] as const;

export const englishLevelSchema = z.union([
  z.literal("A1"),
  z.literal("A2"),
  z.literal("B1"),
  z.literal("B2"),
  z.literal("C1"),
  z.literal("C2"),
]);

const embeddedCountsSchema = z.object({
  choice: z.number().int().min(0).max(8),
  blank: z.number().int().min(0).max(8),
  vocab: z.number().int().min(0).max(8),
}).passthrough();

const practiceCountsSchema = z.object({
  choice: z.number().int().min(0).max(20),
  blank: z.number().int().min(0).max(20),
  vocab: z.number().int().min(0).max(20),
  matching: z.number().int().min(0).max(20),
});

const exerciseConfigSchema = z.object({
  enabled: z.boolean(),
  countsByType: embeddedCountsSchema,
});

const practiceConfigSchema = z.object({
  enabled: z.boolean(),
  countsByType: practiceCountsSchema,
});

export const teachingPlanSchema = z.object({
  courseId: z.string().min(1),
  status: z.union([z.literal("draft"), z.literal("confirmed")]),
  englishLevel: englishLevelSchema.nullable(),
  chapters: z.array(z.object({
    outlineChapterId: z.string().min(1),
    targetWordCount: z.number().int().nullable(),
    knowledgePointIds: z.array(z.string().min(1)),
    readingExerciseMode: z.union([z.literal("none"), z.literal("embedded")]),
    embeddedExercises: exerciseConfigSchema,
    chapterPractice: practiceConfigSchema,
    touched: z.object({
      targetWordCount: z.boolean(),
      knowledgePointIds: z.boolean(),
      readingExerciseMode: z.boolean(),
      embeddedExercises: z.boolean(),
      chapterPractice: z.boolean(),
    }),
  })),
  afterClassPractice: z.object({
    enabled: z.boolean(),
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
    chapters: input.chapters.map((chapter) => ({
      outlineChapterId: chapter.id,
      targetWordCount: recommendedChapterWordCount(input.englishLevel, input.durationMinutes, input.chapters.length),
      knowledgePointIds: chapter.recommendedKnowledgePointIds,
      readingExerciseMode: "none",
      embeddedExercises: { enabled: false, countsByType: { choice: 0, blank: 0, vocab: 0 } },
      chapterPractice: defaultPracticeConfig(),
      touched: {
        targetWordCount: false,
        knowledgePointIds: false,
        readingExerciseMode: false,
        embeddedExercises: false,
        chapterPractice: false,
      },
    })),
    afterClassPractice: {
      enabled: false,
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

function exerciseTotal(counts: Partial<Record<ExerciseType, number>>) {
  return Object.values(counts).reduce((sum, count) => sum + (typeof count === "number" ? count : 0), 0);
}

function requireExerciseConfig(
  enabled: boolean,
  counts: Partial<Record<ExerciseType, number>>,
  messagePrefix: string,
  options: { min: number; max: number; allowed: readonly ExerciseType[]; matchingMessage?: string },
) {
  if (!enabled) return;
  const selectedTypes = Object.entries(counts)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([type]) => type as ExerciseType);
  if (selectedTypes.some((type) => !options.allowed.includes(type))) {
    throw new TeachingPlanValidationError(options.matchingMessage || `${messagePrefix}题型不支持。`);
  }
  const count = exerciseTotal(counts);
  if (selectedTypes.length < 1) throw new TeachingPlanValidationError(`${messagePrefix}至少选择 1 种题型。`);
  if (count < options.min || count > options.max) {
    throw new TeachingPlanValidationError(`${messagePrefix}题量需在 ${options.min}-${options.max} 之间。`);
  }
}

export function validateTeachingPlanForConfirm(plan: TeachingPlan, outlineChapterIds: string[]) {
  const parsed = teachingPlanSchema.safeParse(plan);
  if (!parsed.success) throw new TeachingPlanValidationError();
  if (!plan.englishLevel) throw new TeachingPlanValidationError("请选择英语难度。");
  if (plan.status !== "confirmed" && !plan.afterClassPractice.touched.practice) {
    throw new TeachingPlanValidationError("请选择是否生成课后练习。");
  }

  const planChapterIds = plan.chapters.map((chapter) => chapter.outlineChapterId);
  if (!sameIds(planChapterIds, outlineChapterIds)) throw new TeachingPlanValidationError("教学规划章节与故事大纲不一致。");

  for (const [index, chapter] of plan.chapters.entries()) {
    const label = `第 ${index + 1} 章`;
    if (chapter.targetWordCount === null || chapter.targetWordCount < 50 || chapter.targetWordCount > 200) {
      throw new TeachingPlanValidationError(`${label}目标词数需在 50-200 之间。`);
    }
    if (!chapter.knowledgePointIds.length) throw new TeachingPlanValidationError(`${label}还没有选择知识点。`);
    if (chapter.readingExerciseMode === "embedded") {
      requireExerciseConfig(
        chapter.embeddedExercises.enabled,
        chapter.embeddedExercises.countsByType,
        `${label}内嵌题`,
        {
          min: 1,
          max: 8,
          allowed: [...embeddedExerciseTypes],
          matchingMessage: `${label}内嵌题型不支持匹配题。`,
        },
      );
      if (!chapter.embeddedExercises.enabled) throw new TeachingPlanValidationError(`${label}内嵌题配置不完整。`);
    }
    requireExerciseConfig(
      chapter.chapterPractice.enabled,
      chapter.chapterPractice.countsByType,
      `${label}章节练习`,
      { min: 1, max: 10, allowed: [...practiceExerciseTypes] },
    );
  }

  if (plan.afterClassPractice.enabled) {
    const chapterKnowledgePoints = new Set(plan.chapters.flatMap((chapter) => chapter.knowledgePointIds));
    if (!plan.afterClassPractice.knowledgePointIds.length) throw new TeachingPlanValidationError("课后练习还没有选择知识点。");
    if (plan.afterClassPractice.knowledgePointIds.some((id) => !chapterKnowledgePoints.has(id))) {
      throw new TeachingPlanValidationError("课后练习知识点只能从章节知识点中选择。");
    }
    requireExerciseConfig(
      plan.afterClassPractice.practice.enabled,
      plan.afterClassPractice.practice.countsByType,
      "课后练习",
      { min: 1, max: 20, allowed: [...practiceExerciseTypes] },
    );
    if (!plan.afterClassPractice.practice.enabled) throw new TeachingPlanValidationError("课后练习配置不完整。");
  }
}

export function parseTeachingPlan(input: unknown): TeachingPlan {
  const parsed = teachingPlanSchema.safeParse(input);
  if (!parsed.success) throw new TeachingPlanValidationError();
  const invalidEmbedded = parsed.data.chapters.find((chapter) => "matching" in chapter.embeddedExercises.countsByType && Number(chapter.embeddedExercises.countsByType.matching) > 0);
  if (invalidEmbedded) throw new TeachingPlanValidationError("内嵌题型不支持匹配题。");
  return parsed.data as TeachingPlan;
}
