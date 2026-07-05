import { z } from "zod";

const chapterSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  knowledgeHook: z.string().trim().min(1),
});

const teachingDesignSchema = z.object({
  grammarIntegration: z.string().trim().min(1),
  studentFit: z.string().trim().min(1),
  teacherGuidance: z.string().trim().min(1),
  difficultyFit: z.string().trim().min(1),
});

export const storyOptionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  logline: z.string().trim().min(1),
  chapters: z.array(chapterSchema).min(1),
  teachingDesign: teachingDesignSchema,
});

export const storyOptionsPayloadSchema = z.object({
  options: z.array(storyOptionSchema).length(3),
});
