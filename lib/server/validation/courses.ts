import { z } from "zod";

export const courseAudienceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  teacherId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1).transform((ids) => [...new Set(ids)]),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
});
