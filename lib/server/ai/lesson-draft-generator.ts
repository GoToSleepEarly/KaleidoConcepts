import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";
import { LessonDraftValidationError, validateLessonDraft } from "@/lib/server/repositories/lesson-drafts";

import { compileLessonContentDraft, type AiLessonContentPlan } from "./lesson-content-compiler";

type LessonDraftGenerationContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
  storyOption: StoryOption;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: "enabled" };
  reasoning_effort: "high";
};

type ExercisePolicy = {
  preferredExercisesPerChapter: number;
  minExercisesPerChapter: number;
  maxExercisesPerChapter: number;
  minMainExercisesPerChapter: number;
  maxHintExercisesPerChapter: number;
};

const exercisePoliciesByDuration: Record<number, ExercisePolicy> = {
  30: { preferredExercisesPerChapter: 6, minExercisesPerChapter: 5, maxExercisesPerChapter: 8, minMainExercisesPerChapter: 4, maxHintExercisesPerChapter: 3 },
  45: { preferredExercisesPerChapter: 8, minExercisesPerChapter: 7, maxExercisesPerChapter: 9, minMainExercisesPerChapter: 5, maxHintExercisesPerChapter: 4 },
  60: { preferredExercisesPerChapter: 9, minExercisesPerChapter: 8, maxExercisesPerChapter: 10, minMainExercisesPerChapter: 6, maxHintExercisesPerChapter: 4 },
};

function getExercisePolicy(durationMinutes: number) {
  return exercisePoliciesByDuration[durationMinutes] ?? exercisePoliciesByDuration[45];
}

function chapterWordTarget(durationMinutes: number) {
  if (durationMinutes === 30) {
    return "about 110-150 English words";
  }

  if (durationMinutes === 60) {
    return "about 150-210 English words";
  }

  return "about 120-160 English words";
}

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function personDescription(person: PersonProfile) {
  return person.appearance?.trim() || person.notes?.trim() || "not provided";
}

function aliasBase(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "") || "Person";
}

function castAliases(context: LessonDraftGenerationContext) {
  const aliases = [{ alias: `${aliasBase(personName(context.teacher))}Teacher`, displayName: personName(context.teacher) }];
  context.students.forEach((student, index) => {
    aliases.push({ alias: `${aliasBase(personName(student))}Student${index + 1 > 1 ? index + 1 : ""}`, displayName: personName(student) });
  });
  return aliases;
}

function studentsBlock(students: PersonProfile[], aliases: Array<{ alias: string; displayName: string }>) {
  return students
    .map((student, index) =>
      [
        `- nameToUseInStory: ${aliases[index + 1].alias}`,
        `  age: ${student.age ?? "unknown"}`,
        `  interests: ${student.interests.join(" / ") || "not provided"}`,
        `  appearance / notes: ${personDescription(student)}`,
        `  learning goal: ${student.learningGoal ?? "not provided"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function allowedTargets(context: LessonDraftGenerationContext) {
  return Array.from(new Set([...context.course.grammar, "Vocabulary", "Verb Phrases"]));
}

export function buildLessonContentPrompt(context: LessonDraftGenerationContext) {
  const policy = getExercisePolicy(context.course.durationMinutes);
  const targets = allowedTargets(context);
  const aliases = castAliases(context);

  return [
    "请根据课程信息和中文故事大纲，生成完整英文互动阅读内容 JSON。",
    "",
    "这份 JSON 会被代码编译成学生阅读文本、老师答案列表，以及后续页面和图片生成需要的 clean text。",
    "不要直接渲染挖空题；只输出 clean sentences 和 exercise anchors。",
    "",
    "## Course",
    `Level: ${context.course.englishLevel} (CEFR / Cambridge English)`,
    `Duration: ${context.course.durationMinutes} minutes`,
    `Theme: ${context.course.theme}`,
    `Learning targets: ${context.course.grammar.join(" / ")}`,
    "",
    "## Cast",
    `Teacher: ${aliases[0].alias} — ${personDescription(context.teacher)}`,
    "Students:",
    studentsBlock(context.students, aliases),
    "",
    "Name rules: Use cast aliases exactly as given. Do not split, translate, rename, or replace cast aliases. Do not use real display names in story sentences.",
    "",
    "## Story Outline",
    `Title: ${context.storyOption.title}`,
    `Storyline: ${context.storyOption.storyline}`,
    "Chapters:",
    context.storyOption.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.summary}`).join("\n"),
    "",
    "## Size",
    `Generate exactly ${context.storyOption.chapters.length} chapters.`,
    "Each chapter:",
    "- exactly 2 paragraphs",
    "- each paragraph 4-5 clean English sentences",
    `- total length: ${chapterWordTarget(context.course.durationMinutes)}`,
    `- exercises: ${policy.minExercisesPerChapter}-${policy.maxExercisesPerChapter} per chapter, target ${policy.preferredExercisesPerChapter}`,
    `- at least ${policy.minMainExercisesPerChapter} given_word_blank or choice_blank exercises`,
    `- no more than ${policy.maxHintExercisesPerChapter} vocab_hint + phrase_hint exercises total`,
    "",
    "## Teaching Requirements",
    "- Follow the story outline and keep the whole story coherent.",
    `- English must fit ${context.course.englishLevel} CEFR / Cambridge level.`,
    "- Every exercise must include targetCategory and target.",
    `- target must be exactly one of: ${targets.join(" / ")}`,
    `- Across the whole lesson, cover every selected learning target at least once: ${context.course.grammar.join(" / ")}`,
    "- Use exercise types:",
    "  1. given_word_blank: Grammar / Modals / Vocab; prompt is shown in parentheses. Prefer this for most grammar tense exercises.",
    "  2. choice_blank: mainly for Modals or clear meaning-based choices; 2-4 unique choices and one correct answer.",
    "  3. vocab_hint: Vocabulary; Chinese hint only.",
    "  4. phrase_hint: Verb Phrases; Chinese hint only.",
    "- Use choice_blank sparingly, mainly for Modals or clear meaning-based choices.",
    "- Do not use choice_blank for ordinary verb tense changes if given_word_blank works better.",
    "- If you cannot provide 2-4 unique meaningful choices, use given_word_blank instead.",
    "- If Verb Phrases is selected, include phrase_hint in each chapter when natural.",
    "- Do not output order, exerciseId, pattern, letterCount, or label. Code will generate them.",
    "- Exercises may be listed in any order. Code will sort them by reading position.",
    "- If two exercises use the same sentenceId, their answers must be text-disjoint.",
    "- Text-disjoint means the answers do not share any word or phrase.",
    "- One answer must not contain the other answer.",
    "- One answer must not be part of the other answer.",
    "- Do not use vocab_hint for a word that is inside a given_word_blank, choice_blank, or phrase_hint answer in the same sentence.",
    "- Do not use phrase_hint for a phrase that overlaps a given_word_blank or choice_blank answer in the same sentence.",
    "- Bad same-sentence pairs: \"are invading\" + \"invading\"; \"was looking\" + \"looking\"; \"are blocking\" + \"blocking the way\"; \"give up\" + \"up\".",
    "- If answers would overlap, keep only one exercise for that sentence and choose another sentence for the other exercise.",
    "",
    "## Sentence Rules",
    "- Story sentences must be clean English.",
    "- Do not write \"(1)\", \"________\", \"[V1]\", answer labels, Markdown, or HTML inside sentences.",
    "- Every answer must be an exact substring of the referenced sentence.",
    "",
    "## SentenceId",
    "Use c{chapter}p{paragraph}s{sentence}. Example: c1p2s3 = chapter 1, paragraph 2, sentence 3.",
    "",
    "## Output Schema",
    JSON.stringify(
      {
        title: "English story title",
        chapters: [
          {
            title: "English chapter title",
            paragraphs: [{ sentences: ["Clean English sentence."] }, { sentences: ["Clean English sentence."] }],
            exercises: [
              { type: "given_word_blank", targetCategory: "grammar", target: "Past Simple", sentenceId: "c1p1s1", answer: "left", prompt: "leave", baseWord: "leave" },
              { type: "choice_blank", targetCategory: "modal", target: "Modals", sentenceId: "c1p1s2", answer: "mustn't", choices: ["mustn't", "shouldn't"] },
              { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: "c1p1s3", answer: "destiny", hint: "天命/使命" },
              { type: "phrase_hint", targetCategory: "verb_phrase", target: "Verb Phrases", sentenceId: "c1p1s4", answer: "give up", hint: "放弃" },
            ],
          },
        ],
        closingReading: { title: "Closing reading title", sentences: ["Clean English sentence."] },
      },
      null,
      2,
    ),
    "",
    "Final self-check silently:",
    "- JSON only.",
    "- No blanks or question numbers inside sentences.",
    "- Every answer is copied from the referenced sentence and appears exactly once.",
    "- Every selected learning target is covered.",
    "- Before final output, check every choice_blank: choices length is 2-4, choices include answer, and choices have no duplicates.",
    "- No image or lesson-plan fields.",
    "",
    "Now output JSON only.",
  ].join("\n");
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

function parseLessonContentPlan(value: unknown): AiLessonContentPlan {
  if (typeof value !== "object" || value === null || !Array.isArray((value as AiLessonContentPlan).chapters)) {
    throw new LessonDraftValidationError("AI 返回的阅读内容 JSON 格式无效，请重试生成");
  }

  return value as AiLessonContentPlan;
}

export function buildDeepSeekRequestBody(messages: ChatMessage[], durationMinutes: number): DeepSeekRequestBody {
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";

  return {
    model,
    messages,
    max_tokens: durationMinutes === 60 ? 20000 : 16000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: "high",
  };
}

async function callDeepSeek(messages: ChatMessage[], durationMinutes: number) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  if (!apiKey) {
    throw new Error("AI 服务未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDeepSeekRequestBody(messages, durationMinutes)),
  });

  if (!response.ok) {
    throw new Error("DeepSeek 请求失败");
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek 返回为空");
  }

  return content;
}

function mockLessonDraft(context: LessonDraftGenerationContext): LessonDraft {
  const aliases = castAliases(context);
  return compileLessonContentDraft(
    {
      title: context.storyOption.title,
      chapters: context.storyOption.chapters.map((chapter, chapterIndex) => ({
        title: chapter.title,
        paragraphs: [
          {
            sentences: [
              `Ms. PAN and the students visited ${context.course.theme}.`,
              `There was a quiet clue near the story gate.`,
              `The group followed the clue together.`,
              `They found a warm answer at the end.`,
            ],
          },
          {
            sentences: [
              `The teacher helped everyone read the story carefully.`,
              `The students shared ideas and felt brave.`,
              `There was a bright path back to class.`,
              `They promised not to give up in chapter ${chapterIndex + 1}.`,
            ],
          },
        ],
        exercises: [
          { type: "given_word_blank", targetCategory: "grammar", target: context.course.grammar[0] ?? "Past Simple", sentenceId: `c${chapterIndex + 1}p1s1`, answer: "visited", prompt: "visit", baseWord: "visit" },
          { type: "given_word_blank", targetCategory: "grammar", target: "There be", sentenceId: `c${chapterIndex + 1}p1s2`, answer: "There was", prompt: "there / be", baseWord: "be" },
          { type: "vocab_hint", targetCategory: "vocab", target: "Vocabulary", sentenceId: `c${chapterIndex + 1}p1s2`, answer: "clue", hint: "线索" },
          { type: "phrase_hint", targetCategory: "verb_phrase", target: "Verb Phrases", sentenceId: `c${chapterIndex + 1}p2s4`, answer: "give up", hint: "放弃" },
        ],
      })),
      closingReading: {
        title: "After the Story",
        sentences: ["The class remembered the story clues.", "They worked together and finished the adventure."],
      },
    },
    context.storyOption,
    context.course.grammar.filter((target) => target !== "There be"),
    aliases,
  );
}

export async function generateLessonDraft(context: LessonDraftGenerationContext): Promise<LessonDraft> {
  if (process.env.DEEPSEEK_API_KEY === "mock") {
    return validateLessonDraft(mockLessonDraft(context), context.storyOption);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是儿童 PBL 英语课程的英文互动阅读内容生成专家。",
        "最终只输出严格 JSON，不要 Markdown、解释、注释或代码块。",
        "核心规则：",
        "- Story sentences 必须是 clean English，不要包含题号、空格线、Markdown 或 HTML。",
        "- Exercises 单独放在 exercises 数组，用 sentenceId 引用句子。",
        "- 每个 exercise.answer 必须是对应 sentence 的 exact substring。",
        "- 每个 exercise 必须标注 target。",
        "- 不生成图片、分镜、视觉风格、角色视觉描述、页面设计、教案或课堂流程。",
        "- 请先内部思考和自检，最终只输出 JSON。",
      ].join("\n"),
    },
    {
      role: "user",
      content: buildLessonContentPrompt(context),
    },
  ];

  const content = await callDeepSeek(messages, context.course.durationMinutes);

  try {
    const plan = parseLessonContentPlan(parseJsonObject(content));
    return validateLessonDraft(compileLessonContentDraft(plan, context.storyOption, context.course.grammar, castAliases(context)), context.storyOption);
  } catch (error) {
    console.error("Lesson draft AI output failed validation", {
      error: error instanceof Error ? error.message : String(error),
      rawContent: content,
    });
    throw error;
  }
}
