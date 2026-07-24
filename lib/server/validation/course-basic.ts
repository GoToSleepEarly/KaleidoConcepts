import { z } from "zod";

export const courseBasicInputSchema = z.object({
  title: z.string().trim().min(1),
  teacherId: z.string().trim().min(1),
  studentIds: z.array(z.string().trim().min(1)).min(1),
  englishLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  theme: z.string().trim().optional(),
  grammar: z.array(z.string().trim().min(1)).min(1),
  llmModel: z.enum(["deepseek_chat", "gpt_5_5"]).default("deepseek_chat"),
});
