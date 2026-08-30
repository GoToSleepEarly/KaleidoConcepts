import { z } from "zod";

import type { CourseContentChapter, CourseContentPart, CourseGrammarQuestion, EnglishLevel, StoryContentIntent, StoryWritingProvider, TeachingPlanState } from "@/lib/contracts/api";
import { buildCleanParagraphText, englishWordCount } from "@/lib/domain/course-content";
import { defaultStoryComplexity, englishWordRangesForTarget, storyLengthPolicy } from "@/lib/domain/story-length-policy";
import { createStoryOutlineProvider } from "@/lib/server/ai/story-outline-provider";
import type { AiProviderSettingsInput } from "@/lib/ai-gateway";
import { devAiLog } from "@/lib/server/ai/dev-ai-log";
import {
  applyReadingReview,
  buildReadingTemplatePrompt,
  buildReadingTemplateFinalizationPrompt,
  buildReadingTemplateRepairPrompt,
  chapterTemplateRepairBundleSchema,
  parseReadingTemplatePayload,
  readingCandidateEnvelopeSchema,
  readingReviewBundleSchema,
  type ChapterTemplateIssue,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
  type ReadingTemplatePromptContext,
} from "@/lib/server/ai/course-content-template";
import {
  generatedExercisesSchema,
  generatedModificationSchema,
  parseAiJson,
} from "@/lib/server/validation/course-content";

export type CourseContentPromptPerson = { role: "teacher" | "student"; chineseName: string; englishName: string };
export type CourseContentPromptCharacter = { displayName: string; englishName: string; roleInStory: string; shortDescription: string };
export type CourseContentPromptInput = Pick<TeachingPlanState, "course" | "outline" | "knowledgePoints" | "plan"> & {
  lengthPolicy?: TeachingPlanState["lengthPolicy"];
  promptPeople?: CourseContentPromptPerson[];
  promptCharacters?: CourseContentPromptCharacter[];
  contentIntent?: StoryContentIntent;
};
export type CleanChapterInput = { outlineChapterId: string; title: string; cleanText: string };
export type ReadingTemplateRepairTarget = {
  current: GeneratedChapterTemplate | null;
  requirements: ChapterTemplateRequirements;
  issues: ChapterTemplateIssue[];
  parseError?: string | null;
};

function replacePersonNames(value: string, people: CourseContentPromptPerson[]) {
  return people.reduce((text, person) => person.chineseName ? text.replaceAll(person.chineseName, person.englishName) : text, value);
}

function replaceStoryCharacterNames(value: string, characters: CourseContentPromptCharacter[]) {
  return characters.reduce((text, character) => character.displayName ? text.replaceAll(character.displayName, character.englishName) : text, value);
}

function pointMap(input: CourseContentPromptInput) {
  return new Map(input.knowledgePoints.map((point, index) => [point.id, Object.fromEntries(Object.entries({
    key: `KP${index + 1}`,
    label: point.label,
    category: point.category,
    unitStart: point.unitStart,
    unitEnd: point.unitEnd,
    sourceUnits: point.units,
  }).filter(([, value]) => value !== undefined)) as { key: string; label: string; category?: string; unitStart?: number; unitEnd?: number; sourceUnits?: TeachingPlanState["knowledgePoints"][number]["units"] }]));
}

function grammarSource(input: CourseContentPromptInput) {
  const point = input.knowledgePoints.find((candidate) => candidate.bookTitle && candidate.edition && candidate.officialLevel);
  return point?.bookTitle && point.edition && point.officialLevel
    ? { bookTitle: point.bookTitle, edition: point.edition, officialLevel: point.officialLevel }
    : undefined;
}

function selectedPoints(ids: string[], points: ReturnType<typeof pointMap>) {
  return ids.map((id) => points.get(id)).filter((point): point is NonNullable<ReturnType<typeof pointMap> extends Map<string, infer T> ? T : never> => Boolean(point));
}

const CEFR_WRITING_PROFILES: Record<EnglishLevel, string> = {
  Starter: "Pre-A1/Starter：只用最常见、具体、可直接观察的词；以短而完整的主谓宾句为主；用 and、but、because、so、then 明说先后与因果；避免习语、隐喻、省略和复杂代词指代。",
  A1: "A1：使用高频日常词和短的完整句；主要使用一般现在时、语境明确的一般过去时及 can/cannot；用 and、but、because、so、then 连接行动；人物、地点和指代必须明确。",
  A2: "A2：使用常见词汇和直接描写；可自然使用一般过去时、常见将来表达，以及 when、because、if 等基础从句；句子可有变化，但每句只承载一个主要意思。",
  B1: "B1：使用常见但较丰富的词汇；混合简单句、并列句和有限的时间、原因、条件、定语从句；自然表达人物计划、感受和结果，段落衔接清楚，避免生僻习语。",
  B2: "B2：使用较精确且有变化的词汇和句式；允许多层从句、自然转折及较细致的动机描写；保持叙事流畅，不为了显得高级而使用生僻、学术化表达。",
  C1: "C1：使用灵活、精确的词汇和多样复杂句式；允许含蓄衔接、语气变化和细腻动机，但必须保持清晰、自然并服务于故事推进。",
  C2: "C2：使用高度自然、准确且有文体控制力的表达；可使用恰当习语、修辞和复杂句法，同时保持叙事事实、语气和逻辑完全清楚。",
};

export function cefrWritingProfile(level: string | undefined) {
  return level && level in CEFR_WRITING_PROFILES
    ? CEFR_WRITING_PROFILES[level as EnglishLevel]
    : "严格按照给定 englishLevel 控制词汇、句长、语法和衔接复杂度。";
}

export const cefrWritingQualityRules = [
  "英语正确性是最高优先级：所有正文、题干、答案和答案回填后的完整句都必须语法、时态、主谓一致、单复数、代词、助动词、介词、语序和时间逻辑正确；不得为了题量、知识点覆盖、字数或故事表达保留错误英语。",
  "把 context.englishLevel 和 context.cefrWritingProfile 作为全部英文生成与改写的硬约束，而不是风格建议。",
  "CEFR 只改变表达方式：不得因此删除、增加、重排或改变上游核心事件、人物行动、因果关系和结局。",
  "低等级应删减非必要修饰、隐喻和心理描写，但仍要用完整句和明确连接词讲清行动、原因与结果；禁止用互不衔接的电报式短句伪装简单英语。",
] as const;

export function storyComplexityWritingProfile(complexity: TeachingPlanState["lengthPolicy"]["storyComplexity"]) {
  return {
    clear_linear: "精简·清晰线性：只表达一条直接主线，目标、行动和结果清楚；不新增核心矛盾、受挫、反转或隐藏信息。",
    conflict_driven: "标准·冲突推进：可以充分表达上游已经确定的一个核心矛盾、受挫、选择或策略调整；不增加第二条主线或机械反转。",
    layered: "丰富·多层叙事：可以表达上游已有的复杂动机、信息回收和有铺垫的反转，但仍只有一条主要主线；不得为达到档位凭空添加这些结构。",
  }[complexity];
}

function resolvedLengthPolicy(input: CourseContentPromptInput) {
  if (input.lengthPolicy) return input.lengthPolicy;
  const level = input.course.englishLevel ?? "A2";
  return storyLengthPolicy(level, input.course.storyComplexity ?? defaultStoryComplexity(level));
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === new Set(right).size && left.every((value) => right.includes(value));
}

export function buildReadingPromptContext(input: CourseContentPromptInput) {
  const people = input.promptPeople ?? [];
  const characters = input.promptCharacters ?? [];
  const replaceNames = (value: string) => replaceStoryCharacterNames(replacePersonNames(value, people), characters);
  const points = pointMap(input);
  const lengthPolicy = resolvedLengthPolicy(input);
  return {
    storyTitle: replaceNames(input.outline.title),
    storySummary: replaceNames(input.outline.summary ?? ""),
    contentIntent: input.contentIntent,
    englishLevel: input.course.englishLevel,
    cefrWritingProfile: cefrWritingProfile(input.course.englishLevel),
    storyComplexity: lengthPolicy.storyComplexity,
    storyComplexityProfile: storyComplexityWritingProfile(lengthPolicy.storyComplexity),
    people: people.map(({ role, englishName }) => ({ role, englishName })),
    storyCharacters: characters.map((character) => {
      const role = character.shortDescription && character.shortDescription !== character.roleInStory
        ? `${character.roleInStory}；${character.shortDescription}`
        : character.roleInStory;
      return {
        displayName: character.englishName,
        storyRole: replaceNames(role),
      };
    }),
    ...(grammarSource(input) ? { grammarSource: grammarSource(input) } : {}),
    chapters: input.outline.chapters.map((outline) => {
      const plan = input.plan.chapters.find((chapter) => chapter.outlineChapterId === outline.id)!;
      const targetWordCount = plan.targetWordCount ?? 90;
      const paragraphCount = plan.paragraphCount;
      const wordCountPolicy = englishWordRangesForTarget(targetWordCount);
      const recommendedKnowledgePointIds = outline.recommendedKnowledgePointIds ?? [];
      const recommendationSummary = outline.knowledgePointRecommendationSummary.trim();
      const knowledgePointUsagePlan = recommendationSummary && sameStringSet(plan.knowledgePointIds, recommendedKnowledgePointIds)
        ? replaceNames(recommendationSummary)
        : undefined;
      return {
        id: outline.id,
        order: outline.order,
        title: replaceNames(outline.title),
        summary: replaceNames(outline.summary),
        targetWordCount,
        acceptedWordCountRange: wordCountPolicy.validationRange,
        generationAimRange: wordCountPolicy.generationRange,
        paragraphCount,
        grammarPoints: selectedPoints(plan.knowledgePointIds, points),
        ...(knowledgePointUsagePlan ? { knowledgePointUsagePlan } : {}),
        exerciseCounts: {
          optionCloze: plan.readingExercises.grammar.optionCloze,
          wordForm: plan.readingExercises.grammar.wordForm,
          vocabulary: plan.readingExercises.vocabulary.chineseHint,
        },
      };
    }),
    mainIdea: mainIdeaWordCountPolicy(input.plan.mainIdeaTargetWordCount ?? 120),
  };
}

export function buildReadingTemplateRequirements(input: CourseContentPromptInput): ChapterTemplateRequirements[] {
  const points = pointMap(input);
  return input.outline.chapters.map((outline) => {
    const plan = input.plan.chapters.find((chapter) => chapter.outlineChapterId === outline.id)!;
    const grammarPoints = plan.knowledgePointIds.flatMap((knowledgePointId, index) => {
      const point = points.get(knowledgePointId);
      return point ? [{ ...point, key: `G${index + 1}`, knowledgePointId }] : [];
    });
    return {
      outlineChapterId: outline.id,
      narrativeTense: "past" as const,
      paragraphCount: plan.paragraphCount,
      targetWordCount: plan.targetWordCount ?? 90,
      optionClozeCount: plan.readingExercises.grammar.optionCloze,
      wordFormCount: plan.readingExercises.grammar.wordForm,
      vocabularyCount: plan.readingExercises.vocabulary.chineseHint,
      grammarPoints,
    };
  });
}

export function buildReadingTemplatePromptContext(input: CourseContentPromptInput): ReadingTemplatePromptContext {
  const context = buildReadingPromptContext(input);
  const requirements = new Map(buildReadingTemplateRequirements(input).map((requirement) => [requirement.outlineChapterId, requirement]));
  return {
    storyTitle: context.storyTitle,
    storySummary: context.storySummary,
    contentIntent: context.contentIntent,
    englishLevel: context.englishLevel ?? "",
    cefrWritingProfile: context.cefrWritingProfile,
    storyComplexity: context.storyComplexity,
    storyComplexityProfile: context.storyComplexityProfile,
    people: context.people,
    storyCharacters: context.storyCharacters,
    ...(context.grammarSource ? { grammarSource: context.grammarSource } : {}),
    chapters: context.chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      summary: chapter.summary,
      requirements: requirements.get(chapter.id)!,
      ...(chapter.knowledgePointUsagePlan ? { knowledgePointUsagePlan: chapter.knowledgePointUsagePlan } : {}),
    })),
    mainIdea: context.mainIdea,
  };
}

export function mainIdeaWordCountPolicy(targetWordCount: number) {
  return {
    targetWordCount,
    preferredRange: [Math.max(80, targetWordCount - 5), Math.min(150, targetWordCount + 5)] as [number, number],
    acceptedRange: [Math.max(80, targetWordCount - 10), Math.min(150, targetWordCount + 10)] as [number, number],
  };
}

export function buildExercisePromptContext(input: CourseContentPromptInput, cleanChapters: CleanChapterInput[]) {
  const points = pointMap(input);
  const chapterSpecs = cleanChapters.flatMap((clean) => {
    const plan = input.plan.chapters.find((chapter) => chapter.outlineChapterId === clean.outlineChapterId)!;
    if (!plan.chapterPractice.enabled) return [];
    return [{
      id: clean.outlineChapterId,
      title: clean.title,
      cleanText: clean.cleanText,
      knowledgePointKeys: selectedPoints(plan.knowledgePointIds, points).map((point) => point.key),
      counts: { ...plan.chapterPractice.grammar },
    }];
  });
  const homeworkKeys = input.plan.afterClassPractice.practice.enabled
    ? selectedPoints(input.plan.afterClassPractice.knowledgePointIds, points).map((point) => point.key)
    : [];
  const usedKeys = new Set([...chapterSpecs.flatMap((chapter) => chapter.knowledgePointKeys), ...homeworkKeys]);
  return {
    englishLevel: input.course.englishLevel,
    cefrWritingProfile: cefrWritingProfile(input.course.englishLevel),
    ...(grammarSource(input) ? { grammarSource: grammarSource(input) } : {}),
    knowledgePoints: [...points.values()].filter((point) => usedKeys.has(point.key)),
    chapters: chapterSpecs,
    homework: {
      enabled: input.plan.afterClassPractice.practice.enabled,
      knowledgePointKeys: homeworkKeys,
      counts: input.plan.afterClassPractice.practice.enabled ? { ...input.plan.afterClassPractice.practice.grammar } : { optionCloze: 0, wordForm: 0 },
    },
  };
}

export function buildReadingRepairPromptContext(input: CourseContentPromptInput, failedChapters: CourseContentChapter[]) {
  return failedChapters.map((chapter) => ({
    outlineChapterId: chapter.outlineChapterId,
    paragraphs: chapter.paragraphs.map((paragraph) => ({
      parts: buildPromptParts(input, paragraph.parts),
    })),
  }));
}

export function buildPromptParts(input: CourseContentPromptInput, parts: CourseContentPart[]) {
  const knowledgePointKeys = new Map(input.knowledgePoints.map((point, index) => [point.id, `KP${index + 1}`]));
  return parts.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    if (part.type === "vocabulary") return { type: "vocabulary" as const, answer: part.answer, canonicalForm: part.canonicalForm, meaningZh: part.meaningZh };
    const knowledgePointKey = knowledgePointKeys.get(part.knowledgePointId) ?? "UNKNOWN_KP";
    if (part.exerciseType === "wordForm") return { type: "grammar" as const, exerciseType: "wordForm" as const, knowledgePointKey, answer: part.answer, baseForm: part.baseForm };
    const answer = part.answer.trim().toLocaleLowerCase();
    const distractors = (part.options ?? []).filter((option) => option.trim().toLocaleLowerCase() !== answer).slice(0, 2);
    return { type: "grammar" as const, exerciseType: "optionCloze" as const, knowledgePointKey, answer: part.answer, distractors };
  });
}

export function buildPromptQuestions(input: CourseContentPromptInput, questions: CourseGrammarQuestion[]) {
  const knowledgePointKeys = new Map(input.knowledgePoints.map((point, index) => [point.id, `KP${index + 1}`]));
  return questions.map((question) => {
    const knowledgePointKey = knowledgePointKeys.get(question.knowledgePointId) ?? "UNKNOWN_KP";
    if (question.type === "wordForm") return { type: question.type, knowledgePointKey, before: question.before, after: question.after, answer: question.answer, baseForm: question.baseForm };
    const answer = question.answer.trim().toLocaleLowerCase();
    const distractors = (question.options ?? []).filter((option) => option.trim().toLocaleLowerCase() !== answer).slice(0, 2);
    return { type: question.type, knowledgePointKey, before: question.before, after: question.after, answer: question.answer, distractors };
  });
}

export function buildReadingRepairRequirements(input: CourseContentPromptInput, failedChapters: CourseContentChapter[]) {
  return failedChapters.map((chapter) => {
    const targetWordCount = input.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)?.targetWordCount ?? chapter.targetWordCount;
    const { validationRange: acceptedRange, generationRange: aimRange } = englishWordRangesForTarget(targetWordCount);
    const currentWordCount = englishWordCount(chapter.paragraphs.map(buildCleanParagraphText).join(" "));
    const base = { outlineChapterId: chapter.outlineChapterId, currentWordCount, targetWordCount, acceptedRange, aimRange };
    if (currentWordCount < acceptedRange[0]) return {
      ...base,
      minimumNetWordsToAdd: acceptedRange[0] - currentWordCount,
      recommendedNetWordsToAddRange: [aimRange[0] - currentWordCount, aimRange[1] - currentWordCount] as [number, number],
    };
    if (currentWordCount > acceptedRange[1]) return {
      ...base,
      minimumNetWordsToRemove: currentWordCount - acceptedRange[1],
      recommendedNetWordsToRemoveRange: [currentWordCount - aimRange[1], currentWordCount - aimRange[0]] as [number, number],
    };
    return base;
  });
}

export function buildModificationPromptContext(
  targetType: string,
  target: unknown,
  instruction: string,
  constraints: unknown,
  relatedContext: Record<string, unknown>,
) {
  const context = { targetType, target, instruction, constraints, ...relatedContext };
  return typeof relatedContext.englishLevel === "string"
    ? { ...context, cefrWritingProfile: cefrWritingProfile(relatedContext.englishLevel) }
    : context;
}

function jsonOnly(instructions: string[], context: unknown) {
  return [...instructions, "只返回严格 JSON，不要 Markdown 代码块或额外说明。", "<context>", JSON.stringify(context), "</context>"].join("\n");
}

const schemaDescriptions = {
  reading: "{chapters:[{outlineChapterId,paragraphs:[{parts:[textPart|optionGrammarPart|wordFormGrammarPart|vocabularyPart]}]}],mainIdea:{text}}；textPart={type:'text',text}；optionGrammarPart={type:'grammar',exerciseType:'optionCloze',knowledgePointKey,answer,distractors:[string,string]}；wordFormGrammarPart={type:'grammar',exerciseType:'wordForm',knowledgePointKey,answer,baseForm}；vocabularyPart={type:'vocabulary',answer,canonicalForm,meaningZh}",
  readingRepair: "{chapters:[{outlineChapterId,paragraphs:[{parts:[textPart|optionGrammarPart|wordFormGrammarPart|vocabularyPart]}]}]}；各 part 字段与首次正文契约完全一致",
  mainIdea: "{text}",
  exercises: "{chapters:[{outlineChapterId,questions:[optionQuestion|wordFormQuestion]}],homeworkGrammar:[optionQuestion|wordFormQuestion]}；optionQuestion={type:'optionCloze',knowledgePointKey,before,after,answer,distractors:[string,string]}；wordFormQuestion={type:'wordForm',knowledgePointKey,before,after,answer,baseForm}",
  modification: "{kind,chapter?,paragraph?,questions?,mainIdea?}；只保留 kind 对应的一个结果字段；chapter/paragraph 的 part 和 questions 使用正文与练习的严格题型契约",
} as const;

const optionOutputRule = "选项填空必须返回 answer 和 distractors；distractors 恰好两个、互不重复且都不等于 answer。禁止返回 options，程序会把 answer 与 distractors 合并并打乱。";
const optionQualityRule = "两个干扰项必须与答案属于相同词性或语法维度；每项都必须是标准英语中真实存在、拼写正确的完整词形或结构，禁止虚构变形或残缺助动词、情态动词结构。分别把 answer 和每个 distractor 拼回 before+空格+after：只要干扰项在当前语法、时间线和语义中也成立，就先改写 before/after 提供决定性线索；不能把‘不如 answer 合适’当作错误，也不要使用明显无关的随机词。";
const wordFormOutputRule = "给词填空必须返回 answer 和 baseForm；baseForm 是括号提示词，answer 必须使完整句正确且空格本身考查绑定知识点。构成目标语法的功能词、助动词或情态词必须包含在 answer 内，不得预先写进 before/after；若目标是 to + verb，answer 必须是完整的 'to verb'，不得把 to 放进 before 后只让学生照抄 verb。仅在句子其他位置出现知识点不算考查。answer 可按句法变化或与 baseForm 相同，不得为制造变化写错句子。";
const questionPositionRule = "before 是空格前文本，after 是空格后文本；不得包含下划线、题号、括号提示或答案，程序会在两者之间插入空格和提示。";
const vocabularyQualityRule = "词汇题选择对当前 CEFR 学生有复用价值、能脱离本句复习的实词或常用词组；不要选择人物名、地名、纯功能词、缩写、带连字符的词或同一 canonicalForm 的重复项目。canonicalForm 使用词典原形，meaningZh 必须对应当前语境。";

export const courseContentPromptExamples = {
  reading: "正确的正文 parts 示例：optionCloze 片段=[{\"type\":\"text\",\"text\":\"Yesterday, Mia \"},{\"type\":\"grammar\",\"exerciseType\":\"optionCloze\",\"knowledgePointKey\":\"KP1\",\"answer\":\"found\",\"distractors\":[\"finds\",\"will find\"]},{\"type\":\"text\",\"text\":\" the hidden door.\"}]；wordForm 片段=[{\"type\":\"text\",\"text\":\"Later, she \"},{\"type\":\"grammar\",\"exerciseType\":\"wordForm\",\"knowledgePointKey\":\"KP1\",\"answer\":\"opened\",\"baseForm\":\"open\"},{\"type\":\"text\",\"text\":\" it carefully.\"}]；vocabulary={\"type\":\"vocabulary\",\"answer\":\"looked after\",\"canonicalForm\":\"look after\",\"meaningZh\":\"照顾\"}。题目 answer 拼回前后 text 后必须语法正确。",
  questions: "正确的独立题目示例：optionCloze={\"type\":\"optionCloze\",\"knowledgePointKey\":\"KP1\",\"before\":\"Yesterday, Mia \",\"after\":\" the hidden door.\",\"answer\":\"found\",\"distractors\":[\"finds\",\"will find\"]}；wordForm={\"type\":\"wordForm\",\"knowledgePointKey\":\"KP1\",\"before\":\"Yesterday, Mia \",\"after\":\" the hidden door.\",\"answer\":\"found\",\"baseForm\":\"find\"}。程序渲染为 Yesterday, Mia ______ (find) the hidden door.，提示紧跟空格。",
} as const;

export const readingGrammarCoherenceRules = [
  "英语正确性高于题目植入：先结合章节剧情、grammarPoints、官方 Unit 和可选 knowledgePointUsagePlan 确定叙事基准时态及真实使用语境，不得为了覆盖知识点或凑题量制造错误英语。",
  "先在内部形成语法、时间和逻辑正确的 clean text，再从自然存在的结构设置题目锚点；知识点无法自然嵌入时改写局部语境，禁止先定答案再倒推句子。",
  "输出前回填全部 grammar answer 并通读，确认每句语法与时间线正确、选项只有一个正确答案；不要输出检查过程。",
] as const;

export const readingStoryQualityRules = [
  ...cefrWritingQualityRules,
  "先忠实展开上游故事，不改变人物目标、关键因果、物品去向、章节结果或最终任务；不得新增能直接解决核心问题的万能道具、能力或规则。",
  "每个段落承担一个清楚的剧情推进，并让前一段的结果成为下一段行动成立的原因；人物位置、已知信息和关键物品归属必须连续。",
  "正文应像自然的儿童故事，而不是大纲复述或练习句集合。使用符合 CEFR 的清楚句式、具体动作和必要对话，避免连续解释、重复总结和空泛评价。",
  "人物成长通过行动、选择和结果表现，不要用旁白宣布成长、友谊、勇气或合作。",
  "先保证完整故事和英语表达成立，再嵌入题目；不能为了安放题目改变剧情事实、制造不自然句子或破坏段落节奏。",
] as const;

function modificationOutputRules(targetType: string) {
  if (targetType === "chapter_practice" || targetType === "homework") return [optionOutputRule, optionQualityRule, wordFormOutputRule, questionPositionRule, courseContentPromptExamples.questions];
  if (targetType === "chapter" || targetType === "paragraph") return [...readingStoryQualityRules, optionOutputRule, optionQualityRule, wordFormOutputRule, vocabularyQualityRule, ...readingGrammarCoherenceRules, courseContentPromptExamples.reading];
  return [];
}

export function contentReadingTimeoutMs(value = process.env.COURSE_CONTENT_GENERATION_TIMEOUT_MS) {
  const configured = Number(value);
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
}

export const courseContentFormatRepairAttempts = 1;

export function createCourseContentGenerationDeps(settings: AiProviderSettingsInput = "quickrouter") {
  const provider = createStoryOutlineProvider(undefined, settings);
  const callWithUsage = async (
    writingProvider: StoryWritingProvider,
    operation: string,
    prompt: string,
    timeoutMs?: number,
    options: { reasoningEffort?: "low" | "medium" | "high"; maxOutputTokens?: number } = {},
  ) => {
    try {
      const result = await provider.generateOutline({ writingProvider, operation, prompt, timeoutMs, ...options });
      if (result.usage) devAiLog({ operation, phase: "response", payload: { tokenUsage: result.usage } });
      return result;
    }
    catch (error) {
      const message = error instanceof Error ? error.message.replaceAll("故事大纲", "课程内容") : "课程内容生成失败";
      throw new Error(message, { cause: error });
    }
  };
  const call = async (
    writingProvider: StoryWritingProvider,
    operation: string,
    prompt: string,
    timeoutMs?: number,
    options: { reasoningEffort?: "low" | "medium" | "high"; maxOutputTokens?: number } = {},
  ) => (await callWithUsage(writingProvider, operation, prompt, timeoutMs, options)).text;
  const structuredCall = async <Schema extends z.ZodTypeAny>(
    writingProvider: StoryWritingProvider,
    operation: string,
    prompt: string,
    schema: Schema,
    schemaKey: keyof typeof schemaDescriptions,
    parseMessage: string,
    timeoutMs?: number,
    options: { reasoningEffort?: "low" | "medium" | "high"; maxOutputTokens?: number } = {},
  ): Promise<z.output<Schema>> => {
    let raw = await call(writingProvider, operation, prompt, timeoutMs, options);
    for (let round = 0; round <= courseContentFormatRepairAttempts; round += 1) {
      try { return parseAiJson(raw, schema, parseMessage); }
      catch (error) {
        devAiLog({ operation, phase: "error", payload: { stage: "schema_parse", round: round + 1, parseMessage }, error });
        if (round === courseContentFormatRepairAttempts) throw error;
        raw = await call(writingProvider, `${operation}_repair_format`, jsonOnly([
          "只做一次 JSON 或 Schema 格式整理，不重新创作语义内容。删除多余字段，并把已经存在的旧字段机械转换为 expectedSchema；缺少答案、正文、题干或知识点等语义内容时不得编造。不得改写故事、题干、答案或知识点。",
        ], { rawOutput: raw, expectedSchema: schemaDescriptions[schemaKey], parseError: error instanceof Error ? error.message : parseMessage }), timeoutMs);
      }
    }
    throw new Error(parseMessage);
  };

  return {
    generateReading: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider) => {
      const requirements = buildReadingTemplateRequirements(input);
      const context = buildReadingTemplatePromptContext(input);
      const candidateResponse = await callWithUsage(writingProvider, "content_generate_reading_candidates_v3", buildReadingTemplatePrompt(context), contentReadingTimeoutMs(), { reasoningEffort: "low", maxOutputTokens: 6_500 });
      const candidateOutput = parseAiJson(candidateResponse.text, readingCandidateEnvelopeSchema, "正文候选结构无效");
      const finalResponse = await callWithUsage(writingProvider, "content_finalize_reading_questions_v3", buildReadingTemplateFinalizationPrompt(candidateOutput, context), contentReadingTimeoutMs(), { reasoningEffort: "high", maxOutputTokens: 6_500 });
      const review = parseAiJson(finalResponse.text, readingReviewBundleSchema, "正文题目审核结构无效");
      const payload = applyReadingReview(candidateOutput, review);
      return { ...parseReadingTemplatePayload(payload, requirements), candidateUsage: candidateResponse.usage, usage: finalResponse.usage };
    },

    repairReading: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, targets: ReadingTemplateRepairTarget[], mainIdeaTarget?: { current: { text: string } | null; issues: string[] }) => {
      const response = await callWithUsage(writingProvider, "content_repair_reading_v2", buildReadingTemplateRepairPrompt(targets, buildReadingTemplatePromptContext(input), mainIdeaTarget), contentReadingTimeoutMs(), { reasoningEffort: "low", maxOutputTokens: 6_500 });
      return { ...parseAiJson(response.text, chapterTemplateRepairBundleSchema, "正文最小修复结构解析失败"), usage: response.usage };
    },

    generateExercises: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, cleanChapters: CleanChapterInput[]) => structuredCall(writingProvider, "content_generate_exercises", jsonOnly([
      "生成全部章节练习和课后语法练习，只返回 {chapters:[{outlineChapterId,questions}],homeworkGrammar} 的严格 JSON。knowledgePointKey 只能取所属目标 knowledgePointKeys；其定义和官方 Unit 统一见 context.knowledgePoints，每个目标知识点至少被一道题独立考查。",
      "question 只能是 optionCloze={type,knowledgePointKey,before,after,answer,distractors:[两个]} 或 wordForm={type,knowledgePointKey,before,after,answer,baseForm}，不得混用字段。",
      optionOutputRule,
      optionQualityRule,
      wordFormOutputRule,
      questionPositionRule,
      "英语正确性最高：每个答案回填句必须在语法、时态与体、主谓一致、单复数、代词、助动词、介词、语序和时间逻辑上正确，并严格符合 englishLevel 与 cefrWritingProfile；不得为覆盖或题量保留错误英语。",
      courseContentPromptExamples.questions,
      "章节题只依据本章 cleanText 改编，不复制原句、不与原文冲突；课后题不得依赖正文。所有题干和答案使用自然、完整、符合等级的英文，不为考语法制造不合常理的情节；严格满足各目标 counts。",
      "输出前逐题回填 answer 和每个 distractor，再逐目标核对 ID、两种题量、知识点覆盖与必填字段；先修正全部问题，不输出核对过程。",
    ], buildExercisePromptContext(input, cleanChapters)), generatedExercisesSchema, "exercises", "练习结构解析失败", undefined, { reasoningEffort: "medium" }),

    repairExercises: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, failedTargets: Array<{ id: string; issues: string[] }>, currentExercises: z.infer<typeof generatedExercisesSchema>, cleanChapters: CleanChapterInput[]) => {
      const context = buildExercisePromptContext(input, cleanChapters);
      const targets = failedTargets.map((failed) => failed.id === "homework"
        ? { kind: "homework", spec: context.homework, currentQuestions: currentExercises.homeworkGrammar, issues: failed.issues }
        : { kind: "chapter", spec: context.chapters.find((chapter) => chapter.id === failed.id), currentQuestions: currentExercises.chapters.find((chapter) => chapter.outlineChapterId === failed.id)?.questions ?? [], issues: failed.issues });
      return structuredCall(writingProvider, "content_repair_exercises", jsonOnly([
        "一次修复 targets 中全部失败练习目标；只重写失败目标，不返回成功目标。",
        "章节目标返回到 chapters；若无失败章节则 chapters=[]。课后目标返回到 homeworkGrammar；若课后未失败则 homeworkGrammar=[]。严格解决每个目标的全部 issues。",
        optionOutputRule,
        optionQualityRule,
        wordFormOutputRule,
        questionPositionRule,
        ...cefrWritingQualityRules,
        courseContentPromptExamples.questions,
        "保持每个目标要求的 id、题量和 knowledgePointKeys 覆盖；知识点定义与官方 Unit 见 knowledgePoints。输出前核对全部必填字段，不要输出核对过程。",
      ], { englishLevel: context.englishLevel, cefrWritingProfile: context.cefrWritingProfile, grammarSource: context.grammarSource, knowledgePoints: context.knowledgePoints, targets }), generatedExercisesSchema, "exercises", "练习修复结构解析失败");
    },

    modifyContent: async (writingProvider: StoryWritingProvider, targetType: string, target: unknown, instruction: string, constraints: unknown, relatedContext: Record<string, unknown>) => structuredCall(writingProvider, "content_modify_target", jsonOnly([
      "只修改明确指定的目标，不联动改写任何其他区域。",
      "返回 {kind,chapter?,paragraph?,questions?,mainIdea?}；kind 等于 targetType，且只填写对应目标字段。",
      "严格执行 instruction，并满足 constraints。",
      ...cefrWritingQualityRules,
      "如目标含题目，必须保持原题型、题量和知识点映射，并使用严格题型契约。",
      ...modificationOutputRules(targetType),
      "输出前核对目标范围、必填字段和 constraints；不要输出核对过程。",
    ], buildModificationPromptContext(targetType, target, instruction, constraints, relatedContext)), generatedModificationSchema, "modification", "修改结果结构解析失败"),
  };
}

export type CourseContentGenerationDeps = ReturnType<typeof createCourseContentGenerationDeps>;
