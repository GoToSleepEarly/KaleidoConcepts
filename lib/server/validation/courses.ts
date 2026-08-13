import { z } from "zod";

export const courseAudienceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  teacherId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1).transform((ids) => [...new Set(ids)]),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  englishLevel: z.enum(["Starter", "A1", "A2", "B1", "B2", "C1", "C2"]),
  knowledgePointIds: z.array(z.string().min(1)).min(1).transform((ids) => [...new Set(ids)]),
});
