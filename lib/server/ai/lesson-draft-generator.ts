import { z } from "zod";

import type {
  CourseBasicDetail,
  LessonDraft,
  PersonProfile,
  StoryOption,
} from "@/lib/contracts/api";
import {
  LessonDraftValidationError,
  validateLessonDraft,
} from "@/lib/server/repositories/lesson-drafts";

import {
  compileLessonContentDraft,
  type AiLessonContentPlan,
  type AiSentencePart,
} from "./lesson-content-compiler";

type LessonDraftGenerationContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
  storyOption: StoryOption;
};
type ChatMessage = { role: "system" | "user"; content: string };
type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: "enabled" | "disabled" };
  reasoning_effort?: "medium";
  temperature?: number;
};

const nonEmpty = z
  .string()
  .refine((value) => value.trim().length > 0, "Required");
const textPartSchema = z
  .object({ type: z.literal("text"), text: z.string().min(1) })
  .strict();
const givenWordPartSchema = z
  .object({
    type: z.literal("given_word_blank"),
    answer: nonEmpty,
    target: nonEmpty,
    prompt: nonEmpty,
    baseWord: nonEmpty.optional(),
  })
  .strip();
const choicePartSchema = z
  .object({
    type: z.literal("choice_blank"),
    answer: nonEmpty,
    target: nonEmpty,
    choices: z.array(nonEmpty).min(2).max(4),
  })
  .strip();
const vocabPartSchema = z
  .object({
    type: z.literal("vocab_hint"),
    answer: nonEmpty,
    hint: nonEmpty,
  })
  .strip();
const phrasePartSchema = z
  .object({
    type: z.literal("phrase_hint"),
    answer: nonEmpty,
    hint: nonEmpty,
  })
  .strip();
const sentencePartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  givenWordPartSchema,
  choicePartSchema,
  vocabPartSchema,
  phrasePartSchema,
]);
const lessonContentPlanSchema = z
  .object({
    title: nonEmpty,
    chapters: z
      .array(
        z
          .object({
            title: nonEmpty,
            paragraphs: z.tuple([
              z
                .object({
                  sentences: z
                    .array(
                      z
                        .object({ parts: z.array(sentencePartSchema).min(1) })
                        .strict(),
                    )
                    .min(1),
                })
                .strict(),
              z
                .object({
                  sentences: z
                    .array(
                      z
                        .object({ parts: z.array(sentencePartSchema).min(1) })
                        .strict(),
                    )
                    .min(1),
                })
                .strict(),
            ]),
          })
          .strict(),
      )
      .min(1),
    closingReading: z
      .object({ title: nonEmpty, sentences: z.array(nonEmpty).min(1) })
      .strict(),
  })
  .strict();

function personName(person: PersonProfile) {
  return (
    person.englishName?.trim() ||
    person.chineseName?.trim() ||
    person.name.trim()
  );
}

function personDescription(person: PersonProfile) {
  return person.appearance?.trim() || person.notes?.trim() || "not provided";
}

function aliasBase(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "") || "Person";
}

function castAliases(context: LessonDraftGenerationContext) {
  const aliases = [
    {
      alias: `${aliasBase(personName(context.teacher))}Teacher`,
      displayName: personName(context.teacher),
    },
  ];
  context.students.forEach((student, index) =>
    aliases.push({
      alias: `${aliasBase(personName(student))}Student${index > 0 ? index + 1 : ""}`,
      displayName: personName(student),
    }),
  );
  return aliases;
}

function allowedTargets(context: LessonDraftGenerationContext) {
  return Array.from(
    new Set([...context.course.grammar, "Vocabulary", "Verb Phrases"]),
  );
}

export function buildLessonContentPrompt(
  context: LessonDraftGenerationContext,
) {
  const aliases = castAliases(context);
  const schemaExample = {
    title: "English story title",
    chapters: [
      {
        title: "English chapter title",
        paragraphs: [
          {
            sentences: [
              {
                parts: [
                  { type: "text", text: "The class " },
                  {
                    type: "given_word_blank",
                    answer: "opened",
                    target: "Past Simple",
                    prompt: "open",
                    baseWord: "open",
                  },
                  { type: "text", text: " the old door." },
                ],
              },
            ],
          },
          {
            sentences: [
              {
                parts: [{ type: "text", text: "A silver map waited inside." }],
              },
            ],
          },
        ],
      },
    ],
    closingReading: {
      title: "Closing reading title",
      sentences: ["Clean English sentence."],
    },
  };

  return [
    "Generate one complete English interactive reading lesson as strict JSON.",
    "An exercise part is both the exact story text and the blank answer. Never copy the answer into a separate field or exercise list.",
    "Code will concatenate text.text and exercise.answer in order to create the clean sentence used for image generation.",
    "",
    `Level: ${context.course.englishLevel}`,
    `Duration: ${context.course.durationMinutes} minutes`,
    `Theme: ${context.course.theme}`,
    `Required learning targets: ${context.course.grammar.join(" / ")}`,
    `Allowed targets: ${allowedTargets(context).join(" / ")}`,
    `Teacher alias: ${aliases[0].alias} (${personDescription(context.teacher)})`,
    `Student aliases: ${context.students.map((student, index) => `${aliases[index + 1].alias} (${personDescription(student)})`).join("; ")}`,
    "Use aliases exactly. Do not use display names in story sentences.",
    "",
    `Story title: ${context.storyOption.title}`,
    `Storyline: ${context.storyOption.storyline}`,
    "Chapters:",
    context.storyOption.chapters
      .map(
        (chapter, index) =>
          `${index + 1}. ${chapter.title}: ${chapter.summary}`,
      )
      .join("\n"),
    "",
    `Output exactly ${context.storyOption.chapters.length} chapters and exactly 2 paragraphs per chapter.`,
    "Use enough naturally varied complete sentences to develop each chapter fully; do not pad or compress the story to hit a sentence count.",
    "Each chapter must contain 120-160 English words in its compiled clean text.",
    "Each chapter must contain exactly 8 exercise parts: exactly 6 given_word_blank, exactly 1 vocab_hint, and exactly 1 phrase_hint.",
    "Do not use choice_blank in this lesson format.",
    "Use at most one exercise part in each sentence and distribute exercises naturally across the chapter.",
    "Use every required learning target at least once across the whole lesson.",
    "Grammar and tense must be accurate and coherent across the whole story.",
    "Choose one dominant narrative tense based on the story and selected learning targets.",
    "Keep non-dialogue narration in that tense. Change tense only when the timeline or meaning genuinely requires it.",
    "Dialogue may use other tenses naturally. Never switch narrative tense only to create an exercise.",
    "Before output, silently check tense continuity chapter by chapter.",
    "Do not repeat the same exercise answer within a chapter, ignoring case.",
    "The answer must have no surrounding whitespace.",
    "vocab_hint only outputs type, answer, and a concise Chinese hint. Its target is derived by code.",
    "phrase_hint only outputs type, answer, and a concise Chinese hint. Its target is derived by code.",
    "Closing Reading must be a coherent concluding reading of about 150 English words, normally 130-170 words. It must not contain exercises or read like a summary list.",
    "Story text must not contain blanks, question numbers, Markdown, HTML, or answer labels.",
    "Do not output sentenceId, exerciseId, occurrence, order, pattern, letterCount, images, or lesson-plan fields.",
    "",
    "Output shape example (expand it to the required full lesson):",
    JSON.stringify(schemaExample, null, 2),
    "",
    "Before returning, silently self-check every chapter:",
    "- 120-160 English words and exactly 2 paragraphs.",
    "- Exactly 8 exercises: 6 given_word_blank, 1 vocab_hint, 1 phrase_hint.",
    "- At most one exercise per sentence, no repeated answers, and all required learning targets covered across the lesson.",
    "- Closing Reading is coherent, exercise-free, and about 150 English words.",
    "- JSON matches the schema and contains no extra fields.",
    "",
    "Return JSON only.",
  ].join("\n");
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
  } catch {
    throw new LessonDraftValidationError("AI 返回的 JSON 无法解析，请重试生成");
  }
}

function zodIssuePath(error: z.ZodError) {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

export function parseLessonContentPlan(value: unknown): AiLessonContentPlan {
  const result = lessonContentPlanSchema.safeParse(value);
  if (!result.success)
    throw new LessonDraftValidationError(
      `AI 返回的阅读内容 JSON 格式无效：${zodIssuePath(result.error)}`,
    );
  return result.data as AiLessonContentPlan;
}

function validatePlanPolicy(plan: AiLessonContentPlan, targets: string[]) {
  plan.chapters.forEach((chapter, chapterIndex) => {
    const label = `第 ${chapterIndex + 1} 章`;
    const wordCount = countEnglishWords(
      chapter.paragraphs
        .flatMap((paragraph) => paragraph.sentences)
        .map((sentence) =>
          sentence.parts
            .map((part) => (part.type === "text" ? part.text : part.answer))
            .join(""),
        )
        .join(" "),
    );
    if (wordCount < 100 || wordCount > 180) {
      throw new LessonDraftValidationError(
        `${label}课文明显偏离 120-160 词目标，当前 ${wordCount} 个`,
      );
    }

    const byParagraph = chapter.paragraphs.map((paragraph) =>
      paragraph.sentences.flatMap((sentence) =>
        sentence.parts.filter((part) => part.type !== "text"),
      ),
    );
    const exercises = byParagraph.flat();
    if (exercises.length < 4 || exercises.length > 10) {
      throw new LessonDraftValidationError(
        `${label}题目数明显偏离建议范围，当前 ${exercises.length} 道`,
      );
    }
    const unknownTargets = Array.from(
      new Set(
        exercises
          .map(exerciseTarget)
          .filter((target) => !targets.includes(target)),
      ),
    );
    if (unknownTargets.length)
      throw new LessonDraftValidationError(
        `${label}包含未配置的知识点：${unknownTargets.join(" / ")}`,
      );
  });
}

export function countEnglishWords(text: string) {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

function exerciseTarget(part: Exclude<AiSentencePart, { type: "text" }>) {
  if (part.type === "vocab_hint") return "Vocabulary";
  if (part.type === "phrase_hint") return "Verb Phrases";
  return part.target;
}

function targetKey(target: string) {
  return target
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");
}

function canonicalizePlanTargets(plan: AiLessonContentPlan, targets: string[]) {
  const targetByKey = new Map(
    targets.map((target) => [targetKey(target), target]),
  );
  plan.chapters.forEach((chapter) =>
    chapter.paragraphs.forEach((paragraph) =>
      paragraph.sentences.forEach((sentence) =>
        sentence.parts.forEach((part) => {
          if (
            part.type === "given_word_blank" ||
            part.type === "choice_blank"
          ) {
            part.target =
              targetByKey.get(targetKey(part.target)) ?? part.target;
          }
        }),
      ),
    ),
  );
}

export function buildDeepSeekRequestBody(
  messages: ChatMessage[],
  _durationMinutes: number,
  _chapterCount = 1,
): DeepSeekRequestBody {
  void _durationMinutes;
  void _chapterCount;
  const body: DeepSeekRequestBody = {
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    messages,
    max_tokens: 48000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "medium",
  };

  if (process.env.DEEPSEEK_THINKING === "disabled") {
    body.thinking = { type: "disabled" };
    delete body.reasoning_effort;
    body.temperature = 0.2;
  }

  return body;
}

async function callDeepSeek(
  messages: ChatMessage[],
  durationMinutes: number,
  chapterCount: number,
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  if (!apiKey) throw new Error("AI 服务未配置");
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildDeepSeekRequestBody(messages, durationMinutes, chapterCount),
      ),
    },
  );
  if (!response.ok)
    throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; reasoning_content?: string | null };
    }>;
    usage?: { completion_tokens?: number; total_tokens?: number };
  };
  const choice = data.choices?.[0];
  if (choice.finish_reason === "length")
    throw new LessonDraftValidationError(
      "AI 输出达到长度上限，系统已提高长课程额度，请重试生成",
    );
  if (!choice?.message?.content) {
    console.error("DeepSeek returned no lesson content", {
      finishReason: choice?.finish_reason ?? null,
      reasoningLength: choice?.message?.reasoning_content?.length ?? 0,
      completionTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    });
    throw new LessonDraftValidationError("AI 未返回课文内容，请重试生成");
  }
  return choice.message.content;
}

function text(value: string): AiSentencePart {
  return { type: "text", text: value };
}

function mockLessonDraft(context: LessonDraftGenerationContext): LessonDraft {
  const plan: AiLessonContentPlan = {
    title: context.storyOption.title,
    chapters: context.storyOption.chapters.map((chapter) => ({
      title: chapter.title,
      paragraphs: [
        {
          sentences: [
            {
              parts: [
                text("MsPANTeacher and the students "),
                {
                  type: "given_word_blank",
                  answer: "visited",
                  target: context.course.grammar[0] ?? "Past Simple",
                  prompt: "visit",
                  baseWord: "visit",
                },
                text(` ${context.course.theme}.`),
              ],
            },
            { parts: [text("There was a quiet clue near the story gate.")] },
          ],
        },
        {
          sentences: [
            { parts: [text("The group followed the clue together.")] },
            {
              parts: [
                text("They promised not to "),
                {
                  type: "phrase_hint",
                  answer: "give up",
                  hint: "放弃",
                },
                text("."),
              ],
            },
          ],
        },
      ],
    })),
    closingReading: {
      title: "After the Story",
      sentences: ["The class remembered the story clues."],
    },
  };
  return compileLessonContentDraft(
    plan,
    context.storyOption,
    [],
    castAliases(context),
  );
}

export async function generateLessonDraft(
  context: LessonDraftGenerationContext,
): Promise<LessonDraft> {
  if (process.env.DEEPSEEK_API_KEY === "mock")
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You create coherent children's PBL English reading lessons. Return one strict JSON object only. Exercise parts are literal story text, so preserve natural spacing around parts and use at most one exercise part per sentence.",
    },
    { role: "user", content: buildLessonContentPrompt(context) },
  ];
  const content = await callDeepSeek(
    messages,
    context.course.durationMinutes,
    context.storyOption.chapters.length,
  );
  try {
    const plan = parseLessonContentPlan(parseJsonObject(content));
    const targets = allowedTargets(context);
    canonicalizePlanTargets(plan, targets);
    validatePlanPolicy(plan, targets);
    return validateLessonDraft(
      compileLessonContentDraft(
        plan,
        context.storyOption,
        context.course.grammar,
        castAliases(context),
      ),
      context.storyOption,
    );
  } catch (error) {
    console.error("Lesson draft AI output failed validation", {
      error: error instanceof Error ? error.message : String(error),
      rawContent: content,
    });
    if (error instanceof LessonDraftValidationError) throw error;
    throw new LessonDraftValidationError(
      error instanceof Error
        ? error.message
        : "AI 课文内容校验失败，请重试生成",
    );
  }
}
