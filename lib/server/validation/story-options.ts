import { z } from "zod";

const storyOptionVariantSchema = z.enum(["faithful", "enhanced", "creative"]);

const chapterSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const storyOptionSchema = z.object({
  id: z.string().trim().min(1),
  variant: storyOptionVariantSchema,
  title: z.string().trim().min(1),
  storyline: z.string().trim().min(1),
  chapters: z.array(chapterSchema).min(1),
});

export const storyOptionsPayloadSchema = z.object({
  options: z.array(storyOptionSchema).length(3),
  clearLessonDraft: z.boolean().optional(),
});
