import { z } from "zod";

export const personCreateSchema = z.object({
  role: z.enum(["teacher", "student"]),
  chineseName: z.string().trim().min(1).max(80),
  englishName: z.string().trim().min(1).max(80),
  age: z.number().int().min(0).max(99),
  gender: z.enum(["male", "female"]),
  notes: z.string().max(500).optional(),
});

export const personUpdateSchema = personCreateSchema.omit({ role: true });
