import { z } from "zod";

export const studentInputSchema = z.object({
  name: z.string().trim().min(1, "Student name is required."),
  age: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  interests: z.string().trim().min(1, "Interests are required."),
  personality: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const lessonBriefSchema = z.object({
  cefrLevel: z.string().trim().min(1, "CEFR level is required."),
  knowledgePoints: z.string().trim().min(1, "Knowledge points are required."),
  targetVocabulary: z.string().trim().optional(),
  theme: z.string().trim().optional(),
  specialRequirements: z.string().trim().optional(),
});

export const createCourseSchema = z.object({
  studentId: z.string().uuid(),
  lessonBrief: lessonBriefSchema,
});
