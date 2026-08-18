import { z } from "zod";

export const contentProviderSchema = z.object({ writingProvider: z.enum(["quickrouter_gpt", "quickrouter_deepseek"]) }).strict();
export const contentGenerateSchema = z.object({}).strict();
export const contentModifySchema = z.object({
  targetType: z.enum(["chapter", "paragraph", "chapter_practice", "main_idea", "homework"]),
  targetId: z.string().min(1),
  instruction: z.string().trim().min(1).max(1000),
}).strict();

const requiredText = z.string().trim().min(1);
const distractorsSchema = z.tuple([requiredText, requiredText]);

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeExerciseOptionShape(value: unknown, discriminator: "type" | "exerciseType") {
  if (typeof value !== "object" || value === null) return value;
  const current = { ...value } as Record<string, unknown>;
  if (current[discriminator] === "optionCloze") {
    const answer = typeof current.answer === "string" ? normalized(current.answer) : "";
    if (Array.isArray(current.distractors)) {
      const distractors = current.distractors.filter((option): option is string => typeof option === "string" && normalized(option) !== answer);
      if (distractors.length === 2) current.distractors = distractors;
    }
    if (!current.distractors && Array.isArray(current.options)) {
      const distractors = current.options.filter((option): option is string => typeof option === "string" && normalized(option) !== answer);
      if (distractors.length === 2) current.distractors = distractors;
    }
    delete current.options;
  }
  if (current[discriminator] === "wordForm" && !current.baseForm && typeof current.baseWord === "string") {
    current.baseForm = current.baseWord;
    delete current.baseWord;
  }
  if (current[discriminator] === "wordForm" && typeof current.baseForm === "string") {
    current.baseForm = current.baseForm.trim().replace(/^\((.*)\)$/, "$1").trim();
  }
  return current;
}

function normalizeGeneratedQuestionShape(value: unknown) {
  if (typeof value !== "object" || value === null) return value;
  const current = { ...value } as Record<string, unknown>;
  if (!current.type && (current.exerciseType === "optionCloze" || current.exerciseType === "wordForm")) current.type = current.exerciseType;
  delete current.exerciseType;
  if (!current.distractors && Array.isArray(current.choices)) current.options = current.choices;
  delete current.choices;
  return normalizeExerciseOptionShape(current, "type");
}

function normalizeExercisesEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null) return value;
  const source = typeof Reflect.get(value, "exercises") === "object" && Reflect.get(value, "exercises") !== null
    ? Reflect.get(value, "exercises") as Record<string, unknown>
    : value as Record<string, unknown>;
  const homework = source.homeworkGrammar ?? source.homework ?? source.afterClassPractice;
  const homeworkGrammar = Array.isArray(homework)
    ? homework
    : typeof homework === "object" && homework !== null
      ? Reflect.get(homework, "questions") ?? Reflect.get(homework, "grammar") ?? []
      : [];
  return { ...source, chapters: source.chapters ?? source.chapterExercises ?? [], homeworkGrammar };
}

function validateDistractors(value: { answer: string; distractors: [string, string] }, context: z.RefinementCtx) {
  const values = [value.answer, ...value.distractors].map(normalized);
  if (new Set(values).size !== 3) context.addIssue({ code: z.ZodIssueCode.custom, message: "答案和两个干扰项必须互不重复" });
}

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() }).strict();
const optionGrammarPartSchema = z.object({
  type: z.literal("grammar"),
  exerciseType: z.literal("optionCloze"),
  knowledgePointKey: requiredText,
  answer: requiredText,
  distractors: distractorsSchema,
}).strict();
const wordFormGrammarPartSchema = z.object({
  type: z.literal("grammar"),
  exerciseType: z.literal("wordForm"),
  knowledgePointKey: requiredText,
  answer: requiredText,
  baseForm: requiredText,
}).strict();
const vocabularyPartSchema = z.object({
  type: z.literal("vocabulary"), answer: requiredText, canonicalForm: requiredText, meaningZh: requiredText,
}).strict();
const readingPartSchema = z.preprocess(
  (value) => typeof value === "object" && value !== null && Reflect.get(value, "type") === "grammar" ? normalizeExerciseOptionShape(value, "exerciseType") : value,
  z.union([textPartSchema, optionGrammarPartSchema, wordFormGrammarPartSchema, vocabularyPartSchema]).superRefine((value, context) => {
    if (value.type === "grammar" && value.exerciseType === "optionCloze") validateDistractors(value, context);
  }),
);

function withoutTitle(value: unknown) {
  if (typeof value !== "object" || value === null) return value;
  const current = { ...value } as Record<string, unknown>;
  delete current.title;
  return current;
}

function normalizeReadingChapter(value: unknown) {
  const chapter = withoutTitle(value);
  if (typeof chapter !== "object" || chapter === null || !Array.isArray(Reflect.get(chapter, "paragraphs"))) return chapter;
  return {
    ...chapter,
    paragraphs: (Reflect.get(chapter, "paragraphs") as unknown[]).map((paragraph) => {
      if (typeof paragraph !== "object" || paragraph === null || !Array.isArray(Reflect.get(paragraph, "parts"))) return paragraph;
      return {
        ...paragraph,
        parts: (Reflect.get(paragraph, "parts") as unknown[]).filter((part) => !(
          typeof part === "object" && part !== null && Reflect.get(part, "type") === "text" && Reflect.get(part, "text") === ""
        )),
      };
    }),
  };
}

const generatedReadingChapterSchema = z.preprocess(normalizeReadingChapter, z.object({
    outlineChapterId: z.string(),
    paragraphs: z.array(z.object({ parts: z.array(readingPartSchema) }).strict()).min(1),
  }).strict());

export const generatedReadingSchema = z.object({
  chapters: z.array(generatedReadingChapterSchema),
}).strict();

export const generatedMainIdeaSchema = z.preprocess(withoutTitle, z.object({ text: z.string() }).strict());
export const generatedReadingBundleSchema = generatedReadingSchema.extend({ mainIdea: generatedMainIdeaSchema }).strict();

const optionQuestionSchema = z.object({
  type: z.literal("optionCloze"),
  knowledgePointKey: requiredText,
  before: z.string(),
  after: z.string(),
  answer: requiredText,
  distractors: distractorsSchema,
});
const wordFormQuestionSchema = z.object({
  type: z.literal("wordForm"),
  knowledgePointKey: requiredText,
  before: z.string(),
  after: z.string(),
  answer: requiredText,
  baseForm: requiredText,
});
export const generatedQuestionSchema = z.preprocess(
  normalizeGeneratedQuestionShape,
  z.discriminatedUnion("type", [optionQuestionSchema, wordFormQuestionSchema]).superRefine((value, context) => {
    if (value.type === "optionCloze") validateDistractors(value, context);
  }),
);

const generatedExerciseChapterSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null) return value;
  const current = { ...value } as Record<string, unknown>;
  current.questions = current.questions ?? current.exercises ?? [];
  return current;
}, z.object({ outlineChapterId: z.string(), questions: z.array(generatedQuestionSchema) }));

export const generatedExercisesSchema = z.preprocess(normalizeExercisesEnvelope, z.object({
  chapters: z.array(generatedExerciseChapterSchema),
  homeworkGrammar: z.array(generatedQuestionSchema),
}));

export const generatedModificationSchema = z.object({
  kind: z.enum(["chapter", "paragraph", "chapter_practice", "main_idea", "homework"]),
  chapter: generatedReadingChapterSchema.optional(),
  paragraph: z.object({ parts: z.array(readingPartSchema) }).strict().optional(),
  questions: z.array(generatedQuestionSchema).optional(),
  mainIdea: generatedMainIdeaSchema.optional(),
}).strict();

export type GeneratedReading = z.infer<typeof generatedReadingSchema>;
export type GeneratedReadingBundle = z.infer<typeof generatedReadingBundleSchema>;
export type GeneratedMainIdea = z.infer<typeof generatedMainIdeaSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GeneratedModification = z.infer<typeof generatedModificationSchema>;

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return text;
}

export function parseAiJson<Schema extends z.ZodTypeAny>(text: string, schema: Schema, message: string): z.output<Schema> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try { value = JSON.parse(cleaned); }
  catch (firstError) {
    try { value = JSON.parse(extractJsonObject(cleaned)); }
    catch { throw new Error(message, { cause: firstError }); }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message, { cause: parsed.error });
  return parsed.data as z.output<Schema>;
}
