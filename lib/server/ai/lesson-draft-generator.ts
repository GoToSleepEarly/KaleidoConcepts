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
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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
    "CRITICAL WORD COUNT: Each chapter MUST contain 120-160 English words in compiled clean text (text parts concatenated with exercise answers). This is a hard requirement — count words before outputting.",
    "CRITICAL TARGET COVERAGE: You MUST use every required learning target listed above at least once as a given_word_blank's target field. Missing a required target will cause rejection.",
    "Each chapter must contain exactly 8 exercise parts: exactly 6 given_word_blank, exactly 1 vocab_hint, and exactly 1 phrase_hint.",
    "Do not use choice_blank in this lesson format.",
    "Use at most one exercise part in each sentence and distribute exercises naturally across the chapter.",
    "Distribute the required learning targets across chapters so that every target appears at least once.",
    "Grammar and tense must be accurate and coherent across the whole story.",
    "Choose one dominant narrative tense based on the story and selected learning targets.",
    "Keep non-dialogue narration in that tense. Change tense only when the timeline or meaning genuinely requires it.",
    "Dialogue may use other tenses naturally. Never switch narrative tense only to create an exercise.",
    "Before output, silently verify: (1) every chapter has 120-160 words, (2) every required learning target appears in at least one given_word_blank, (3) each chapter has exactly 8 exercises (6 given_word_blank + 1 vocab_hint + 1 phrase_hint).",
    "Do not repeat the same exercise answer within a chapter, ignoring case.",
    "The answer must have no surrounding whitespace.",
    "vocab_hint only outputs type, answer, and a concise Chinese hint. Its target is derived by code.",
    "phrase_hint only outputs type, answer, and a concise Chinese hint. Its target is derived by code.",
    "Closing Reading must be a coherent concluding reading of about 150 English words. It must not contain exercises.",
    "Story text must not contain blanks, question numbers, Markdown, HTML, or answer labels.",
    "Do not output sentenceId, exerciseId, occurrence, order, pattern, letterCount, images, or lesson-plan fields.",
    "",
    "Output shape example (expand it to the required full lesson):",
    JSON.stringify(schemaExample, null, 2),
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

function buildQuickRouterResponsesRequestBody(messages: ChatMessage[]) {
  // 稳定性优先：GPT-5.5 是推理模型，显式开启 reasoning 让它在输出前自检词数/题数/
  // 知识点覆盖。推理 token 与正文共享预算，因此同步加大 max_output_tokens。
  const reasoningDisabled = process.env.QUICKROUTER_REASONING === "disabled";
  return {
    model: process.env.QUICKROUTER_LESSON_MODEL ?? process.env.QUICKROUTER_RESPONSES_MODEL ?? "gpt-5.5",
    input: messages,
    max_output_tokens: reasoningDisabled ? 16000 : 32000,
    response_format: { type: "json_object" },
    ...(reasoningDisabled
      ? { temperature: 0.2 }
      : { reasoning: { effort: "medium" } }),
  };
}

type QuickRouterResponsesData = {
  choices?: Array<{ message?: { content?: string | null } }>;
  output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  error?: { message?: string };
  message?: string;
};

async function callQuickRouterResponses(messages: ChatMessage[]) {
  const apiKey = process.env.QUICKROUTER_API_KEY;
  if (!apiKey) throw new Error("AI 服务未配置");
  const response = await fetch("https://api.quickrouter.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildQuickRouterResponsesRequestBody(messages)),
  });
  const data = (await response.json().catch(() => ({}))) as QuickRouterResponsesData;
  if (!response.ok) throw new Error(data.error?.message || data.message || `AI 请求失败：HTTP ${response.status}`);
  const content =
    data.choices?.[0]?.message?.content ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text)
      .filter(Boolean)
      .join("\n");
  if (!content) throw new LessonDraftValidationError("AI 未返回课文内容，请重试生成");
  return content;
}

async function callDeepSeek(
  messages: ChatMessage[],
  _durationMinutes: number,
  _chapterCount: number,
) {
  void _durationMinutes;
  void _chapterCount;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
  // 稳定性优先：默认开启 thinking，让模型在输出前自检词数/题数/知识点覆盖。
  // 仅当显式设置 DEEPSEEK_THINKING=disabled 时才关闭（换取更快但更不稳的生成）。
  const thinkingEnabled = process.env.DEEPSEEK_THINKING !== "disabled";
  if (!apiKey) throw new Error("AI 服务未配置");
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: thinkingEnabled ? 48000 : 16000,
        response_format: { type: "json_object" },
        ...(thinkingEnabled
          ? { thinking: { type: "enabled" }, reasoning_effort: "medium" }
          : { thinking: { type: "disabled" }, temperature: 0.2 }),
      }),
    },
  );
  if (!response.ok)
    throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; reasoning_content?: string | null };
    }>;
  };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length")
    throw new LessonDraftValidationError(
      "AI 输出达到长度上限，请重试生成",
    );
  if (!choice?.message?.content) {
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
  if (process.env.QUICKROUTER_API_KEY === "mock" || process.env.DEEPSEEK_API_KEY === "mock")
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);

  const useGpt55 = context.course.llmModel === "gpt_5_5" && !!process.env.QUICKROUTER_API_KEY;
  // 真实模型名用于日志观测，避免误导排查（此前固定打印 deepseek_chat）。
  const modelLabel = useGpt55
    ? (process.env.QUICKROUTER_LESSON_MODEL ?? process.env.QUICKROUTER_RESPONSES_MODEL ?? "gpt-5.5")
    : (process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro");
  // 默认不自动重试：开启 thinking/reasoning 后单次约 5 分钟，且自检已把单次成功率拉高，
  // 再叠加重试会让等待时间成倍变长（最坏 3×5 分钟）。失败交由用户手动重新生成。
  // 如需恢复自动重试，设置 LESSON_DRAFT_MAX_ATTEMPTS（如 2 或 3）。
  const maxAttempts = Math.max(1, Number(process.env.LESSON_DRAFT_MAX_ATTEMPTS) || 1);

  const baseMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You create coherent children's PBL English reading lessons. Return one strict JSON object only. Exercise parts are literal story text, so preserve natural spacing around parts and use at most one exercise part per sentence.",
    },
    { role: "user", content: buildLessonContentPrompt(context) },
  ];

  const messages: ChatMessage[] = [...baseMessages];

  let lastError: Error | null = null;
  let lastErrorCategory = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let content: string | null = null;
    try {
      const llmCall = useGpt55
        ? callQuickRouterResponses(messages)
        : callDeepSeek(messages, context.course.durationMinutes, context.storyOption.chapters.length);

      content = await llmCall;
      const plan = parseLessonContentPlan(parseJsonObject(content));
      const targets = allowedTargets(context);
      const targetByKey = new Map(targets.map((t) => [targetKey(t), t]));

      const aiReturnedTargets: Array<{
        chapter: number;
        type: string;
        originalTarget: string;
        canonicalizedTo: string;
      }> = [];

      plan.chapters.forEach((chapter, chapterIndex) => {
        chapter.paragraphs.forEach((paragraph) => {
          paragraph.sentences.forEach((sentence) => {
            sentence.parts.forEach((part) => {
              if (part.type === "text") return;
              if (part.type === "vocab_hint") {
                aiReturnedTargets.push({
                  chapter: chapterIndex + 1,
                  type: part.type,
                  originalTarget: "(auto)",
                  canonicalizedTo: "Vocabulary",
                });
              } else if (part.type === "phrase_hint") {
                aiReturnedTargets.push({
                  chapter: chapterIndex + 1,
                  type: part.type,
                  originalTarget: "(auto)",
                  canonicalizedTo: "Verb Phrases",
                });
              } else {
                const originalTarget = part.target;
                const matched = targetByKey.get(targetKey(originalTarget));
                aiReturnedTargets.push({
                  chapter: chapterIndex + 1,
                  type: part.type,
                  originalTarget,
                  canonicalizedTo: matched ?? `(UNMATCHED: ${originalTarget})`,
                });
              }
            });
          });
        });
      });

      console.info("[LessonDraft] AI generation details", {
        attempt,
        model: modelLabel,
        courseId: context.course.id,
        requiredGrammar: context.course.grammar,
        allowedTargets: targets,
        aiReturnedTargets,
      });

      canonicalizePlanTargets(plan, targets);
      validatePlanPolicy(plan, targets);
      const draft = validateLessonDraft(
        compileLessonContentDraft(
          plan,
          context.storyOption,
          context.course.grammar,
          castAliases(context),
        ),
        context.storyOption,
      );

      if (attempt > 1) {
        console.info("[LessonDraft] Generation succeeded after retry", {
          attempt,
          model: modelLabel,
          courseId: context.course.id,
        });
      }
      return draft;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;

      const isConfigError = errorMessage === "AI 服务未配置";
      const isHttpError = errorMessage.startsWith("AI 请求失败：HTTP") || errorMessage.startsWith("DeepSeek 请求失败：HTTP");
      const isRetriable = !isConfigError && !isHttpError;

      console.error("Lesson draft AI output failed validation", {
        attempt,
        error: errorMessage,
        model: modelLabel,
        courseId: context.course.id,
        requiredGrammar: context.course.grammar,
        willRetry: isRetriable && attempt < maxAttempts,
        rawContent: content,
      });

      if (!isRetriable || attempt >= maxAttempts) {
        if (error instanceof LessonDraftValidationError) throw error;
        throw new LessonDraftValidationError(
          errorMessage.includes("AI 服务未配置") || errorMessage.includes("HTTP")
            ? errorMessage
            : (error instanceof Error ? error.message : "AI 课文内容校验失败，请重试生成"),
        );
      }

      const isWordCountError = errorMessage.includes("词目标");
      const isExerciseCountError = errorMessage.includes("题目数");
      const isCoverageError = errorMessage.includes("知识点未覆盖");
      const isUnknownTargetError = errorMessage.includes("未配置的知识点");
      const isFormatError = errorMessage.includes("JSON") || errorMessage.includes("格式") || errorMessage.includes("Unexpected") || errorMessage.includes("Expected");

      let fixGuidance = "Please fix this issue and output the complete corrected JSON. Return JSON only, no explanations.";
      if (isWordCountError) {
        fixGuidance = "CRITICAL WORD COUNT FIX: Each chapter MUST contain exactly 120-160 English words in compiled clean text (text parts + exercise answers concatenated). Expand story details with natural sentences to reach the target. Do NOT add extra exercises to fill length — add descriptive text sentences instead. Output the complete corrected JSON only.";
      } else if (isExerciseCountError) {
        fixGuidance = "CRITICAL EXERCISE COUNT FIX: Each chapter MUST contain EXACTLY 8 exercises total: exactly 6 given_word_blank, exactly 1 vocab_hint, and exactly 1 phrase_hint. No more, no less. Remove extra exercises or add missing ones to reach exactly 8. Output the complete corrected JSON only.";
      } else if (isCoverageError) {
        fixGuidance = "CRITICAL TARGET COVERAGE FIX: You MUST use every required learning target listed in the prompt at least once as a given_word_blank exercise's target field. Check that ALL required grammar points appear in your given_word_blank exercises. Output the complete corrected JSON only.";
      } else if (isUnknownTargetError) {
        fixGuidance = "CRITICAL INVALID TARGET FIX: You used a learning target that is not in the allowed list. Only use the exact target names listed under 'Allowed targets' in the prompt. Remove or replace any exercises with targets not in that list. Output the complete corrected JSON only.";
      } else if (isFormatError) {
        fixGuidance = "FORMAT FIX: Output one valid strict JSON object matching the schema exactly. No markdown fences, no commentary, no trailing commas. Output the complete corrected JSON only.";
      }

      const errorCategory = isWordCountError ? "word_count"
        : isExerciseCountError ? "exercise_count"
        : isCoverageError ? "coverage"
        : isUnknownTargetError ? "unknown_target"
        : isFormatError ? "format"
        : "other";
      const sameErrorAsLast = lastErrorCategory === errorCategory;
      lastErrorCategory = errorCategory;

      if (attempt === 2 && sameErrorAsLast) {
        messages.length = 0;
        messages.push(...baseMessages);
        messages.push({
          role: "user",
          content:
            "Previous attempts failed validation. This is a fresh start. Pay EXTREME attention to ALL requirements: " +
            "(1) Each chapter MUST have exactly 120-160 English words. " +
            "(2) Each chapter MUST have exactly 8 exercises: 6 given_word_blank + 1 vocab_hint + 1 phrase_hint. " +
            "(3) Every required learning target MUST appear in at least one given_word_blank. " +
            "(4) Only use target names from the allowed list. " +
            "(5) Output valid JSON only, no commentary. " +
            "Return the complete JSON now.",
        });
        console.info("[LessonDraft] Resetting conversation for final attempt due to repeated error", {
          errorCategory,
          courseId: context.course.id,
        });
      } else {
        messages.push({
          role: "assistant",
          content: content ?? "",
        });

        messages.push({
          role: "user",
          content:
            `The previous output had this problem:\n${errorMessage}\n\n${fixGuidance}`,
        });
      }
    }
  }

  if (lastError) {
    if (lastError instanceof LessonDraftValidationError) throw lastError;
    throw new LessonDraftValidationError(lastError.message);
  }
  throw new LessonDraftValidationError("AI 课文内容校验失败，请重试生成");
}
