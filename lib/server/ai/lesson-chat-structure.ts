import type { CourseBasicDetail, LessonDraft, PersonProfile, StoryOption } from "@/lib/contracts/api";
import {
  compileLessonContentDraft,
  type AiLessonContentPlan,
  type AiParagraph,
  type AiSentence,
  type AiSentencePart,
} from "@/lib/server/ai/lesson-content-compiler";
import { LessonDraftValidationError } from "@/lib/server/repositories/lesson-drafts";

type LessonChatStructureContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
};

type ParsedStage = {
  index: number;
  title: string;
  englishTitle: string;
  readingLines: string[];
};

type ExerciseMeta = {
  order: number;
  type: "given_word_blank" | "choice_blank" | "vocab_hint" | "phrase_hint";
  answer: string;
  prompt?: string;
  choices?: string[];
  hint?: string;
  label?: string;
};

const answerKeyPattern = /(?:【\s*(?:教师答案区\s*\/\s*Answer Key|Answer Key|答案区|教师答案区)\s*】|^Answer Key\s*:?\s*$)/im;
const closingPattern = /(?:【\s*(?:Closing Reading|课后主旨泛读|Main Idea Reading Practice)\s*】|^Closing Reading\s*:?\s*$)/im;
const lessonDraftPattern = /【\s*Lesson Draft\s*】/im;
const stageMarkerPattern = /【\s*Stage\s*(\d+)\s*】/gi;

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function aliasBase(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "") || "Person";
}

function castAliases(context: LessonChatStructureContext) {
  const teacherName = personName(context.teacher);
  return [
    { alias: `${aliasBase(teacherName)}Teacher`, displayName: teacherName },
    ...context.students.map((student, index) => {
      const name = personName(student);
      return { alias: `${aliasBase(name)}Student${index > 0 ? index + 1 : ""}`, displayName: name };
    }),
  ];
}

function expectedChapterCount(durationMinutes: number) {
  if (durationMinutes === 30) return 3;
  if (durationMinutes === 60) return 5;
  return 4;
}

function sectionAfter(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match || match.index == null) return "";
  return text.slice(match.index + match[0].length);
}

function stripAfterKnownSections(text: string) {
  const closingIndex = text.search(closingPattern);
  const answerIndex = text.search(answerKeyPattern);
  const indexes = [closingIndex, answerIndex].filter((index) => index >= 0);
  return indexes.length ? text.slice(0, Math.min(...indexes)) : text;
}

function normalizeLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

function parseStoryTitle(text: string, fallback: string) {
  const lessonText = sectionAfter(text, lessonDraftPattern) || text;
  const beforeStages = lessonText.split(stageMarkerPattern)[0] ?? lessonText;
  const match = beforeStages.match(/^(?:Story Title|故事题目)\s*[:：]\s*(.+)$/im);
  return match?.[1]?.trim() || fallback;
}

function stripSentenceLabel(line: string) {
  return line.replace(/^\s*S\d+\s*[:：]\s*/i, "").trim();
}

function parseAnswerKey(text: string) {
  const answerText = sectionAfter(text, answerKeyPattern);
  if (!answerText.trim()) throw new LessonDraftValidationError("缺少【教师答案区 / Answer Key】");

  const answers = new Map<number, string>();
  const labelAnswers = new Map<string, { answer: string; hint?: string }>();

  for (const rawLine of answerText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const numbered = line.match(/^(?:Answer\s*)?\(?(\d{1,3})\)?\s*(?:[.、:：]|\s+-\s+)\s*(.+)$/i);
    if (numbered) {
      answers.set(Number(numbered[1]), numbered[2].trim());
      continue;
    }

    const labeled = line.match(/^([VP]\d+)\s*[=:：]\s*([^|~，,;；]+)(?:[|~，,;；]\s*(.+))?$/i);
    if (labeled) {
      labelAnswers.set(labeled[1].toUpperCase(), {
        answer: labeled[2].trim(),
        hint: labeled[3]?.trim(),
      });
    }
  }

  if (answers.size === 0) throw new LessonDraftValidationError("答案区未识别到题号答案，请使用 `1. answer` 格式");
  return { answers, labelAnswers };
}

function parseStages(text: string): ParsedStage[] {
  const lessonText = sectionAfter(text, lessonDraftPattern) || text;
  const beforeClosing = stripAfterKnownSections(lessonText);
  const markers = [...beforeClosing.matchAll(stageMarkerPattern)];

  if (markers.length > 0) {
    return markers.map((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = index + 1 < markers.length ? markers[index + 1].index! : beforeClosing.length;
      const block = beforeClosing.slice(start, end);
      const title = block.match(/^Title\s*[:：]\s*(.+)$/im)?.[1]?.trim() || `Stage ${marker[1]}`;
      const englishTitle = block.match(/^English Title\s*[:：]\s*(.+)$/im)?.[1]?.trim() || title;
      const readingBlock = sectionAfter(block, /(?:【\s*Reading\s*】|^Reading\s*[:：]?\s*$)/im) || block;
      const readingLines = readingBlock
        .split(/\r?\n/)
        .map(stripSentenceLabel)
        .map(normalizeLine)
        .filter((line) => line && !/^(Title|English Title|Teacher Tip)\s*[:：]/i.test(line));

      return { index: Number(marker[1]), title, englishTitle, readingLines };
    });
  }

  const legacyParts = beforeClosing.split(/第([一二三四五六七八九十\d]+)阶段[:：]/).slice(1);
  const stages: ParsedStage[] = [];
  for (let index = 0; index < legacyParts.length; index += 2) {
    const block = legacyParts[index + 1] ?? "";
    const firstLine = block.split(/\r?\n/).find((line) => line.trim())?.trim() ?? `第${stages.length + 1}阶段`;
    const titleMatch = firstLine.match(/^(.+?)(?:\(([^)]+)\))?$/);
    const readingLines = block
      .split(/\r?\n/)
      .slice(1)
      .map(normalizeLine)
      .filter((line) => line && !/语法提示[:：]/.test(line));
    stages.push({
      index: stages.length + 1,
      title: titleMatch?.[1]?.trim() || firstLine,
      englishTitle: titleMatch?.[2]?.trim() || titleMatch?.[1]?.trim() || firstLine,
      readingLines,
    });
  }
  return stages;
}

function parseClosingReading(text: string) {
  const closingText = sectionAfter(text, closingPattern).split(answerKeyPattern)[0] ?? "";
  const lines = closingText
    .split(/\r?\n/)
    .map(stripSentenceLabel)
    .map(normalizeLine)
    .filter(Boolean);
  if (lines.length === 0) throw new LessonDraftValidationError("缺少【Closing Reading】正文");
  return lines;
}

function hintFromToken(token: string) {
  return token.match(/提示[:：]\s*([^，,；;\])）]+)/)?.[1]?.trim();
}

function choicesFromPrompt(prompt: string) {
  return prompt
    .split("/")
    .map((choice) => choice.trim())
    .filter(Boolean);
}

function buildExerciseMeta(
  order: number,
  token: string,
  answers: Map<number, string>,
  labelAnswers: Map<string, { answer: string; hint?: string }>,
): ExerciseMeta {
  const answer = answers.get(order)?.trim();
  if (!answer) throw new LessonDraftValidationError(`第 ${order} 题缺少答案`);

  const label = token.match(/\[([VP]\d+)\s*:/i)?.[1]?.toUpperCase();
  if (label?.startsWith("V")) {
    return {
      order,
      type: "vocab_hint",
      answer: labelAnswers.get(label)?.answer || answer,
      hint: hintFromToken(token) || labelAnswers.get(label)?.hint || "词汇提示",
      label,
    };
  }
  if (label?.startsWith("P")) {
    return {
      order,
      type: "phrase_hint",
      answer: labelAnswers.get(label)?.answer || answer,
      hint: hintFromToken(token) || labelAnswers.get(label)?.hint || "短语提示",
      label,
    };
  }

  const prompt = token.match(/_{3,}\s*[（(]([^()（）]+)[）)]/)?.[1]?.trim() || answer;
  const choices = choicesFromPrompt(prompt);
  if (choices.length >= 2 && choices.includes(answer)) {
    return {
      order,
      type: "choice_blank",
      answer,
      choices,
    };
  }

  return {
    order,
    type: "given_word_blank",
    answer,
    prompt,
    hint: hintFromToken(token),
  };
}

function exercisePartFromMeta(meta: ExerciseMeta, context: LessonChatStructureContext): Exclude<AiSentencePart, { type: "text" }> {
  if (meta.type === "vocab_hint") {
    return { type: "vocab_hint", answer: meta.answer, hint: meta.hint || "词汇提示" };
  }
  if (meta.type === "phrase_hint") {
    return { type: "phrase_hint", answer: meta.answer, hint: meta.hint || "短语提示" };
  }
  if (meta.type === "choice_blank") {
    return {
      type: "choice_blank",
      answer: meta.answer,
      target: context.course.grammar[0] ?? "Vocabulary",
      choices: meta.choices ?? [meta.answer, "not given"],
    };
  }
  return {
    type: "given_word_blank",
    answer: meta.answer,
    target: context.course.grammar[0] ?? "Grammar",
    prompt: meta.prompt || meta.answer,
    baseWord: meta.prompt || meta.answer,
  };
}

function parseSentenceLine(
  line: string,
  answers: Map<number, string>,
  labelAnswers: Map<string, { answer: string; hint?: string }>,
  context: LessonChatStructureContext,
): AiSentence {
  const tokenPattern =
    /\((\d{1,3})\)\s*(?:\[[VP]\d+\s*:[^\]]+\]|_{3,}\s*[（(][^()（）]+[）)](?:\s*[（(]提示[:：][^()（）]+[）)])?)/gi;
  const matches = [...line.matchAll(tokenPattern)];
  if (matches.length > 1) {
    throw new LessonDraftValidationError("程序友好模板要求每个 S 行最多包含 1 道题，请把多题拆成多行");
  }
  if (matches.length === 0) return { parts: [{ type: "text", text: line }] };

  const match = matches[0];
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const meta = buildExerciseMeta(Number(match[1]), match[0], answers, labelAnswers);
  const parts: AiSentencePart[] = [];
  const before = line.slice(0, start);
  const after = line.slice(end);
  if (before) parts.push({ type: "text", text: before });
  parts.push(exercisePartFromMeta(meta, context));
  if (after) parts.push({ type: "text", text: after });
  return { parts };
}

function splitIntoTwoParagraphs(sentences: AiSentence[]): [AiParagraph, AiParagraph] {
  if (sentences.length < 2) return [{ sentences }, { sentences: [{ parts: [{ type: "text", text: "The story continued with courage and care." }] }] }];
  const midpoint = Math.ceil(sentences.length / 2);
  return [{ sentences: sentences.slice(0, midpoint) }, { sentences: sentences.slice(midpoint) }];
}

function summarize(lines: string[]) {
  return lines
    .join(" ")
    .replace(/\([^)]*\)\s*(?:\[[^\]]+\]|_{3,}\s*\([^)]*\))/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export async function structureLessonChatDraft(
  context: LessonChatStructureContext,
  draftText: string,
): Promise<{
  storyOption: StoryOption;
  draft: LessonDraft;
}> {
  if (!draftText.trim()) throw new LessonDraftValidationError("请先生成或填写最终文案");

  const { answers, labelAnswers } = parseAnswerKey(draftText);
  const stages = parseStages(draftText);
  if (stages.length === 0) throw new LessonDraftValidationError("未识别到阶段，请使用 `【Stage 1】` 格式");

  const expected = expectedChapterCount(context.course.durationMinutes);
  if (stages.length !== expected) {
    throw new LessonDraftValidationError(`阶段数量应为 ${expected} 个，当前识别到 ${stages.length} 个`);
  }

  const plan: AiLessonContentPlan = {
    title: parseStoryTitle(draftText, context.course.title),
    chapters: stages.map((stage) => {
      if (stage.readingLines.length === 0) throw new LessonDraftValidationError(`Stage ${stage.index} 缺少【Reading】正文`);
      const sentences = stage.readingLines.map((line) => parseSentenceLine(line, answers, labelAnswers, context));
      return {
        title: stage.englishTitle || stage.title,
        paragraphs: splitIntoTwoParagraphs(sentences),
      };
    }),
    closingReading: {
      title: "Main Idea Reading Practice",
      sentences: parseClosingReading(draftText),
    },
  };

  const storyOption: StoryOption = {
    id: "chat-final",
    variant: "enhanced",
    title: plan.title,
    storyline: summarize(stages.flatMap((stage) => stage.readingLines)) || `围绕 ${context.course.title} 展开的课堂故事。`,
    chapters: stages.map((stage) => ({
      title: stage.title,
      summary: summarize(stage.readingLines) || `${stage.title} 推动故事继续。`,
    })),
  };

  const draft = compileLessonContentDraft(plan, storyOption, [], castAliases(context));
  return { storyOption, draft };
}
