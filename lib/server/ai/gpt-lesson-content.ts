import { z } from "zod";

import type { CourseBasicDetail, StoryOption } from "@/lib/contracts/api";
import { LessonDraftValidationError } from "@/lib/server/repositories/lesson-drafts";

import type {
  AiLessonContentPlan,
  AiParagraph,
  AiSentence,
  AiSentencePart,
} from "./lesson-content-compiler";

export type GptExerciseSlot =
  | { id: string; type: "given_word_blank"; target: string }
  | { id: string; type: "vocab_hint" }
  | { id: string; type: "phrase_hint" };

export type GptLessonBlueprint = {
  chapters: Array<{
    id: string;
    paragraphs: Array<{
      id: string;
      exercises: GptExerciseSlot[];
    }>;
  }>;
};

type GptExerciseContent = {
  before: string;
  answer: string;
  after: string;
  givenWord?: string;
  hint?: string;
};

type GptParagraphContent = {
  opening: string;
  exercise1: GptExerciseContent;
  transition1: string;
  exercise2: GptExerciseContent;
  transition2: string;
  exercise3: GptExerciseContent;
  transition3: string;
  exercise4: GptExerciseContent;
  closing: string;
};

type GptChapterContent = {
  title: string;
  paragraph1: GptParagraphContent;
  paragraph2: GptParagraphContent;
};

type GptLessonContent = {
  title: string;
  chapters: Record<string, GptChapterContent>;
  closingReading: { title: string; text: string };
};

type BlueprintContext = {
  course: Pick<CourseBasicDetail, "grammar">;
  storyOption: Pick<StoryOption, "chapters">;
};

const paragraphSlotTypes = [
  ["given_word_blank", "given_word_blank", "vocab_hint", "given_word_blank"],
  ["given_word_blank", "phrase_hint", "given_word_blank", "given_word_blank"],
] as const;

export function buildGptLessonBlueprint(
  context: BlueprintContext,
): GptLessonBlueprint {
  const targets = Array.from(
    new Set(context.course.grammar.map((item) => item.trim()).filter(Boolean)),
  );
  const grammarCapacity = context.storyOption.chapters.length * 6;
  if (targets.length === 0) {
    throw new LessonDraftValidationError(
      "GPT-5.5 lesson generation requires at least one learning target",
    );
  }
  if (targets.length > grammarCapacity) {
    throw new LessonDraftValidationError(
      `GPT-5.5 lesson generation has ${targets.length} learning targets but only ${grammarCapacity} grammar exercise slots`,
    );
  }

  let grammarSlotIndex = 0;
  return {
    chapters: context.storyOption.chapters.map((_, chapterIndex) => ({
      id: `chapter${chapterIndex + 1}`,
      paragraphs: paragraphSlotTypes.map((types, paragraphIndex) => ({
        id: `paragraph${paragraphIndex + 1}`,
        exercises: types.map((type, exerciseIndex): GptExerciseSlot => {
          const id = `chapter${chapterIndex + 1}-paragraph${paragraphIndex + 1}-exercise${exerciseIndex + 1}`;
          if (type === "given_word_blank") {
            const target = targets[grammarSlotIndex % targets.length];
            grammarSlotIndex += 1;
            return { id, type, target };
          }
          return { id, type };
        }),
      })),
    })),
  };
}

type JsonSchema = Record<string, unknown>;

function objectSchema(
  properties: Record<string, JsonSchema>,
  description?: string,
): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function exerciseJsonSchema(slot: GptExerciseSlot): JsonSchema {
  const common = {
    before: {
      type: "string",
      description:
        "Exact story text before the answer in this one complete sentence. May be empty.",
    },
    answer: {
      type: "string",
      description:
        "The exact non-empty answer text occupying the single exercise anchor.",
    },
    after: {
      type: "string",
      description:
        "Exact story text after the answer in this one complete sentence. May be empty.",
    },
  };
  if (slot.type === "given_word_blank") {
    return objectSchema(
      {
        ...common,
        givenWord: {
          type: "string",
          description:
            "The base word or concise given-word prompt shown to the learner.",
        },
      },
      `Create one natural story sentence that accurately tests the required learning target: ${slot.target}.`,
    );
  }
  return objectSchema(
    {
      ...common,
      hint: {
        type: "string",
        description: "A concise Chinese hint that does not reveal the answer.",
      },
    },
    slot.type === "vocab_hint"
      ? "Create one natural story sentence containing a useful CEFR-level vocabulary answer."
      : "Create one natural story sentence containing a useful CEFR-level verb phrase answer.",
  );
}

function paragraphJsonSchema(slots: GptExerciseSlot[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    opening: {
      type: "string",
      description:
        "One natural narrative sentence that opens or continues this paragraph.",
    },
  };
  slots.forEach((slot, index) => {
    properties[`exercise${index + 1}`] = exerciseJsonSchema(slot);
    if (index < slots.length - 1) {
      properties[`transition${index + 1}`] = {
        type: "string",
        description:
          "One natural non-exercise sentence connecting the surrounding story events.",
      };
    }
  });
  properties.closing = {
    type: "string",
    description:
      "One natural narrative sentence that closes this paragraph and supports continuity.",
  };
  return objectSchema(properties);
}

export function buildGptLessonJsonSchema(
  blueprint: GptLessonBlueprint,
): JsonSchema {
  const chapterProperties = Object.fromEntries(
    blueprint.chapters.map((chapter) => [
      chapter.id,
      objectSchema({
        title: { type: "string", description: "English chapter title." },
        paragraph1: paragraphJsonSchema(chapter.paragraphs[0].exercises),
        paragraph2: paragraphJsonSchema(chapter.paragraphs[1].exercises),
      }),
    ]),
  );
  return objectSchema({
    title: { type: "string", description: "English lesson story title." },
    chapters: objectSchema(chapterProperties),
    closingReading: objectSchema({
      title: { type: "string", description: "English closing reading title." },
      text: {
        type: "string",
        description:
          "A coherent exercise-free closing reading of about 150 English words.",
      },
    }),
  });
}

const nonEmpty = z
  .string()
  .refine((value) => value.trim().length > 0, "Required");
const framedExerciseSchema = z
  .object({
    before: z.string(),
    answer: nonEmpty,
    after: z.string(),
    givenWord: nonEmpty.optional(),
    hint: nonEmpty.optional(),
  })
  .strict();
const paragraphContentSchema = z
  .object({
    opening: nonEmpty,
    exercise1: framedExerciseSchema,
    transition1: nonEmpty,
    exercise2: framedExerciseSchema,
    transition2: nonEmpty,
    exercise3: framedExerciseSchema,
    transition3: nonEmpty,
    exercise4: framedExerciseSchema,
    closing: nonEmpty,
  })
  .strict();
const chapterContentSchema = z
  .object({
    title: nonEmpty,
    paragraph1: paragraphContentSchema,
    paragraph2: paragraphContentSchema,
  })
  .strict();
const gptLessonContentSchema = z
  .object({
    title: nonEmpty,
    chapters: z.record(chapterContentSchema),
    closingReading: z.object({ title: nonEmpty, text: nonEmpty }).strict(),
  })
  .strict();

function exercisePart(
  content: GptExerciseContent,
  slot: GptExerciseSlot,
): Exclude<AiSentencePart, { type: "text" }> {
  if (slot.type === "given_word_blank") {
    if (!content.givenWord) {
      throw new LessonDraftValidationError(`${slot.id}.givenWord is required`);
    }
    return {
      type: slot.type,
      answer: content.answer,
      target: slot.target,
      prompt: content.givenWord,
      baseWord: content.givenWord,
    };
  }
  if (!content.hint) {
    throw new LessonDraftValidationError(`${slot.id}.hint is required`);
  }
  return {
    type: slot.type,
    answer: content.answer,
    hint: content.hint,
  };
}

function framedSentence(
  content: GptExerciseContent,
  slot: GptExerciseSlot,
): AiSentence {
  const parts: AiSentencePart[] = [];
  if (content.before) parts.push({ type: "text", text: content.before });
  parts.push(exercisePart(content, slot));
  if (content.after) parts.push({ type: "text", text: content.after });
  return { parts };
}

function textSentence(value: string): AiSentence {
  return { parts: [{ type: "text", text: value }] };
}

function convertParagraph(
  content: GptParagraphContent,
  slots: GptExerciseSlot[],
): AiParagraph {
  return {
    sentences: [
      textSentence(content.opening),
      framedSentence(content.exercise1, slots[0]),
      textSentence(content.transition1),
      framedSentence(content.exercise2, slots[1]),
      textSentence(content.transition2),
      framedSentence(content.exercise3, slots[2]),
      textSentence(content.transition3),
      framedSentence(content.exercise4, slots[3]),
      textSentence(content.closing),
    ],
  };
}

export function parseGptLessonContentPlan(
  value: unknown,
  blueprint: GptLessonBlueprint,
): AiLessonContentPlan {
  const result = gptLessonContentSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new LessonDraftValidationError(
      `GPT-5.5 returned invalid lesson content: ${issues}`,
    );
  }
  const content = result.data as GptLessonContent;
  const expectedChapterKeys = blueprint.chapters.map((chapter) => chapter.id);
  const actualChapterKeys = Object.keys(content.chapters);
  if (
    actualChapterKeys.length !== expectedChapterKeys.length ||
    expectedChapterKeys.some((key) => !content.chapters[key])
  ) {
    throw new LessonDraftValidationError(
      `GPT-5.5 returned unexpected chapters: ${actualChapterKeys.join(" / ")}`,
    );
  }

  return {
    title: content.title,
    chapters: blueprint.chapters.map((chapter) => {
      const source = content.chapters[chapter.id];
      return {
        title: source.title,
        paragraphs: [
          convertParagraph(source.paragraph1, chapter.paragraphs[0].exercises),
          convertParagraph(source.paragraph2, chapter.paragraphs[1].exercises),
        ],
      };
    }),
    closingReading: {
      title: content.closingReading.title,
      sentences: [content.closingReading.text],
    },
  };
}
