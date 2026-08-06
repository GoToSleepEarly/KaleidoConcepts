import { z } from "zod";

export const storyWritingProviderSchema = z.union([
  z.literal("quickrouter_gpt"),
  z.literal("quickrouter_deepseek"),
]);

export const storyOutlineSettingsSchema = z.object({
  chapterCount: z.number().int().min(1).max(8),
  writingProvider: storyWritingProviderSchema,
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
      z.literal("generate_from_reference"),
      z.literal("regenerate_outline"),
    ])
    .optional(),
  targetId: z.string().optional(),
  chapterCount: z.number().int().min(1).max(8).optional(),
  writingProvider: storyWritingProviderSchema.optional(),
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
  characterIds: z.array(z.string()),
  setting: z.string().min(1),
  endingHook: z.string().min(1),
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
