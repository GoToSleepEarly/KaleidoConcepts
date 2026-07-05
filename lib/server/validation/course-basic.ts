import { z } from "zod";

export const courseBasicInputSchema = z
  .object({
    title: z.string().trim().min(1),
    teacherId: z.string().trim().min(1),
    studentIds: z.array(z.string().trim().min(1)).min(1),
    englishLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
    durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    theme: z.string().trim().min(1),
    grammar: z.array(z.string().trim().min(1)).min(1),
    storyIdeaMode: z.enum(["manual", "ai"]),
    storyIdea: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.storyIdeaMode === "manual" && !value.storyIdea?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "手动输入故事想法时必须填写故事大纲",
        path: ["storyIdea"],
      });
    }
  });
