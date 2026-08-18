import { z } from "zod";

export const storyWritingProviderSchema = z.union([
  z.literal("quickrouter_gpt"),
  z.literal("quickrouter_deepseek"),
]);

export const storyOutlineSettingsSchema = z.object({
  chapterCount: z.number().int().min(1).max(8),
  writingProvider: storyWritingProviderSchema,
});

export const researchPlanSchema = z.object({
  researchGoal: z.string().trim().min(1),
  packets: z.array(z.object({
    title: z.string().trim().min(1),
    subjects: z.array(z.object({
      name: z.string().trim().min(1),
      context: z.string().trim().min(1).optional(),
    })).min(1),
    researchQuestions: z.array(z.string().trim().min(1)).min(1),
    storyUseGoals: z.array(z.string().trim().min(1)).min(1),
  })).min(1),
});

export const storyOutlineMessageSchema = z.object({
  message: z.string().default(""),
  mode: z.union([z.literal("idea"), z.literal("random"), z.literal("revise")]),
  action: z
    .union([
      z.literal("choose_direction"),
      z.literal("confirm_reference_object"),
      z.literal("request_reference_search"),
      z.literal("supply_reference_material"),
      z.literal("choose_reference_search"),
      z.literal("confirm_reference_materials"),
      z.literal("choose_story_usage"),
      z.literal("describe_story_usage"),
      z.literal("generate_directions"),
      z.literal("generate_from_reference"),
      z.literal("regenerate_outline"),
      z.literal("submit_alignment_answers"),
      z.literal("confirm_requirements"),
      z.literal("modify_requirements"),
      z.literal("revise_direction"),
      z.literal("confirm_direction"),
      z.literal("revise_outline"),
      z.literal("revise_chapter"),
      z.literal("confirm_story_change"),
      z.literal("cancel_story_change"),
      z.literal("retry_operation"),
    ])
    .optional(),
  targetId: z.string().optional(),
  targetChapterOrder: z.number().int().min(1).max(8).optional(),
  alignmentAnswers: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  researchPlan: researchPlanSchema.optional(),
  chapterCount: z.number().int().min(1).max(8).optional(),
  writingProvider: storyWritingProviderSchema.optional(),
  requestId: z.string().uuid().optional(),
  resetDownstream: z.boolean().optional(),
});

const sourceReferenceSchema = z.object({
  id: z.string().optional(),
  courseId: z.string().optional(),
  name: z.string().min(1),
  type: z.union([
    z.literal("real_person"),
    z.literal("historical_person"),
    z.literal("public_figure"),
    z.literal("ip"),
    z.literal("game_character"),
    z.literal("fictional_character"),
    z.literal("other"),
  ]),
  sourceStatus: z.union([
    z.literal("confirmed"),
    z.literal("insufficient"),
    z.literal("teacher_supplied"),
  ]),
  summary: z.string().min(1),
  usableFacts: z.array(z.string()),
  avoidTopics: z.array(z.string()),
  adaptationBoundary: z.string().min(1),
  researchProvider: z.union([z.literal("quickrouter_gpt"), z.literal("none")]).optional(),
  confirmedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const characterSchema = z.object({
  id: z.string().optional(),
  courseId: z.string().optional(),
  displayName: z.string().min(1),
  englishName: z.string().min(1),
  sourceType: z.union([z.literal("person"), z.literal("referenced"), z.literal("original")]),
  sourcePersonId: z.string().nullable().optional(),
  sourceReferenceId: z.string().nullable().optional(),
  roleInStory: z.string().min(1),
  shortDescription: z.string().min(1),
  visualDescription: z.string().nullable().optional(),
  shouldAppearInImages: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const chapterSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(1),
  title: z.string().min(1),
  storyGoal: z.string().min(1),
  keyEvents: z.array(z.string()).min(1),
  whatHappens: z.string().optional(),
  characterActions: z.string().optional(),
  mainlineProgress: z.string().optional(),
  characterIds: z.array(z.string()),
  setting: z.string().min(1),
  endingHook: z.string().min(1),
  recommendedKnowledgePointIds: z.array(z.string().min(1)).optional(),
  knowledgePointRecommendationSummary: z.string().optional(),
});

export const storyOutlineSaveSchema = z.object({
  outline: z.object({
    id: z.string().optional(),
    courseId: z.string().optional(),
    chapterCount: z.number().int().min(1).max(8),
    title: z.string().min(1),
    summary: z.string().min(1),
    writingProvider: storyWritingProviderSchema,
    sourceReferences: z.array(sourceReferenceSchema),
    characters: z.array(characterSchema),
    chapters: z.array(chapterSchema).min(1),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
  resetDownstream: z.boolean().optional(),
});

export const referenceMaterialUpdateSchema = sourceReferenceSchema.pick({
  name: true,
  type: true,
  sourceStatus: true,
  summary: true,
  usableFacts: true,
  avoidTopics: true,
  adaptationBoundary: true,
});
