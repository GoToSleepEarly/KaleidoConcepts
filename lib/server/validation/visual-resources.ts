import { z } from "zod";

export const visualSettingsSchema = z.object({
  quality: z.enum(["low", "medium", "high"]).optional(),
  imageGenerationConcurrency: z.number().int().min(1).max(5).optional(),
}).strict().refine((input) => input.quality !== undefined || input.imageGenerationConcurrency !== undefined, {
  message: "至少需要修改一项视觉设置",
});

export const visualIntentSchema = z.object({
  intent: z.enum(["preserve_identity", "originalize"]),
}).strict();

export const visualCharacterAppearanceSchema = z.object({
  appearanceDescription: z.string().trim().min(1).max(400).optional(),
  courseAppearance: z.string().trim().min(1).max(400),
}).strict();

export const visualRefineSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
}).strict();

export const visualCoverConfirmSchema = z.object({
  assetId: z.string().min(1),
}).strict();

export const visualGenerateSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("cover") }).strict(),
  z.object({ scope: z.literal("slot"), slotId: z.string().min(1) }).strict(),
  z.object({ scope: z.literal("chapter"), chapterId: z.string().min(1) }).strict(),
  z.object({ scope: z.literal("all") }).strict(),
]);
