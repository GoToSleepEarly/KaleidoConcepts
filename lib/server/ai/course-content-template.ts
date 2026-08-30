import { z } from "zod";

import type { CourseContentChapter, CourseContentParagraph, CourseContentPart, StoryContentIntent } from "@/lib/contracts/api";
import { buildCleanParagraphText, englishWordCount, stableShuffle, validateParagraphParts } from "@/lib/domain/course-content";
import { englishWordRangesForTarget } from "@/lib/domain/story-length-policy";

export const STEP4_CONTENT_CONTRACT_VERSION = "step4.content.v4" as const;
export const STEP4_READING_CANDIDATE_VERSION = "step4.reading-candidate.v1" as const;

const requiredText = z.string().trim().min(1);
const optionSlotSchema = z.object({
  id: z.string().regex(/^OC\d+$/),
  kind: z.literal("optionCloze"),
  knowledgePointKey: requiredText,
  answer: requiredText,
  distractors: z.tuple([requiredText, requiredText]),
}).strict();
const candidateOptionSlotSchema = optionSlotSchema.omit({ distractors: true });
const wordFormSlotSchema = z.object({
  id: z.string().regex(/^WF\d+$/),
  kind: z.literal("wordForm"),
  knowledgePointKey: requiredText,
  answer: requiredText,
  cue: requiredText,
}).strict();
const vocabularySlotSchema = z.object({
  id: z.string().regex(/^VOC\d+$/),
  kind: z.literal("vocabulary"),
  answer: requiredText,
  canonicalForm: requiredText,
  meaningZh: requiredText,
}).strict();

export const generatedContentSlotSchema = z.discriminatedUnion("kind", [optionSlotSchema, wordFormSlotSchema, vocabularySlotSchema]);
const candidateContentSlotSchema = z.discriminatedUnion("kind", [candidateOptionSlotSchema, wordFormSlotSchema, vocabularySlotSchema]);
export const generatedChapterTemplateSchema = z.object({
  outlineChapterId: requiredText,
  paragraphs: z.array(z.object({ template: requiredText }).strict()).min(1),
  slots: z.array(generatedContentSlotSchema),
}).strict();
const candidateChapterTemplateSchema = z.object({
  outlineChapterId: requiredText,
  paragraphs: z.array(z.object({ template: requiredText }).strict()).min(1),
  slots: z.array(candidateContentSlotSchema),
}).strict();
export const readingCandidateEnvelopeSchema = z.object({
  candidateVersion: z.literal(STEP4_READING_CANDIDATE_VERSION),
  chapters: z.array(candidateChapterTemplateSchema).min(1),
  mainIdea: z.object({ text: requiredText }).strict(),
}).strict();
const readingReviewChapterSchema = z.object({
  outlineChapterId: requiredText,
  paragraphPatches: z.array(z.object({ paragraphIndex: z.number().int().nonnegative(), template: requiredText }).strict()),
  slots: z.array(generatedContentSlotSchema),
}).strict().superRefine((value, context) => {
  const indices = value.paragraphPatches.map((patch) => patch.paragraphIndex);
  if (new Set(indices).size !== indices.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "段落补丁索引重复" });
});
export const readingReviewBundleSchema = z.object({
  contractVersion: z.literal(STEP4_CONTENT_CONTRACT_VERSION),
  chapters: z.array(readingReviewChapterSchema).min(1),
  mainIdea: z.object({ text: requiredText }).strict().optional(),
}).strict();

export type GeneratedContentSlot = z.infer<typeof generatedContentSlotSchema>;
export type GeneratedChapterTemplate = z.infer<typeof generatedChapterTemplateSchema>;

export function applyReadingReview(candidatePayload: unknown, reviewPayload: unknown) {
  const candidate = readingCandidateEnvelopeSchema.parse(candidatePayload);
  const review = readingReviewBundleSchema.parse(reviewPayload);
  const candidateIds = candidate.chapters.map((chapter) => chapter.outlineChapterId);
  const reviewIds = review.chapters.map((chapter) => chapter.outlineChapterId);
  if (new Set(candidateIds).size !== candidateIds.length || new Set(reviewIds).size !== reviewIds.length) throw new Error("正文候选或审核章节 ID 重复");
  if (candidateIds.length !== reviewIds.length || candidateIds.some((id) => !reviewIds.includes(id))) throw new Error("正文候选与审核章节 ID 不一致");
  const reviewById = new Map(review.chapters.map((chapter) => [chapter.outlineChapterId, chapter]));
  return {
    contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
    chapters: candidate.chapters.map((chapter) => {
      const reviewed = reviewById.get(chapter.outlineChapterId)!;
      if (reviewed.paragraphPatches.some((patch) => patch.paragraphIndex >= chapter.paragraphs.length)) throw new Error(`正文审核段落索引越界：${chapter.outlineChapterId}`);
      const patches = new Map(reviewed.paragraphPatches.map((patch) => [patch.paragraphIndex, patch.template]));
      return {
        outlineChapterId: chapter.outlineChapterId,
        paragraphs: chapter.paragraphs.map((paragraph, index) => ({ template: patches.get(index) ?? paragraph.template })),
        slots: reviewed.slots,
      };
    }),
    mainIdea: review.mainIdea ?? candidate.mainIdea,
  };
}
export type ChapterGrammarPoint = {
  key: string;
  label: string;
  category?: string;
  unitStart?: number;
  unitEnd?: number;
  sourceUnits?: Array<{ unitNumber: number; officialTitle: string }>;
  knowledgePointId?: string;
};
export type ChapterTemplateRequirements = {
  outlineChapterId: string;
  narrativeTense?: "past";
  paragraphCount: number;
  targetWordCount: number;
  optionClozeCount: number;
  wordFormCount: number;
  vocabularyCount: number;
  grammarPoints: ChapterGrammarPoint[];
};
export type ChapterTemplateIssueCode =
  | "chapter_id"
  | "paragraph_count"
  | "paragraph_word_count"
  | "slot_set"
  | "marker_set"
  | "knowledge_point"
  | "knowledge_point_coverage"
  | "part_structure"
  | "word_count";
export type ChapterTemplateIssue = { code: ChapterTemplateIssueCode; message: string; target?: string };
export type CompiledChapterTemplate = {
  paragraphs: CourseContentParagraph[];
  cleanText: string;
  wordCount: number;
  paragraphWordCounts: number[];
  issues: ChapterTemplateIssue[];
};

export const chapterTemplateRepairSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paragraph"),
    outlineChapterId: requiredText,
    paragraphIndex: z.number().int().nonnegative(),
    template: requiredText,
    slots: z.array(generatedContentSlotSchema),
  }).strict(),
  z.object({
    kind: z.literal("chapter"),
    outlineChapterId: requiredText,
    chapter: generatedChapterTemplateSchema,
  }).strict(),
]);
export const chapterTemplateRepairBundleSchema = z.object({
  contractVersion: z.literal(STEP4_CONTENT_CONTRACT_VERSION),
  repairs: z.array(chapterTemplateRepairSchema),
  mainIdea: z.object({ text: requiredText }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (!value.repairs.length && !value.mainIdea) context.addIssue({ code: z.ZodIssueCode.custom, message: "修复响应至少包含一个目标" });
});
export type ChapterTemplateRepair = z.infer<typeof chapterTemplateRepairSchema>;

export type ReadingTemplatePromptContext = {
  storyTitle: string;
  storySummary: string;
  contentIntent?: StoryContentIntent;
  englishLevel: string;
  cefrWritingProfile: string;
  storyComplexity: string;
  storyComplexityProfile: string;
  people: Array<{ englishName: string; role: "teacher" | "student" }>;
  storyCharacters: Array<{ displayName: string; storyRole: string }>;
  grammarSource?: { bookTitle: string; edition: string; officialLevel: string };
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    summary: string;
    requirements: ChapterTemplateRequirements;
    knowledgePointUsagePlan?: string;
  }>;
  mainIdea: { targetWordCount: number; preferredRange: [number, number]; acceptedRange: [number, number] };
};

const markerPattern = /\{\{([A-Z]+\d+)\}\}/g;
const PARAGRAPH_WORD_COUNT_TOLERANCE = 3;

function numberedIds(prefix: "OC" | "WF" | "VOC", count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

export function requiredChapterSlotIds(requirements: ChapterTemplateRequirements) {
  return [
    ...numberedIds("OC", requirements.optionClozeCount),
    ...numberedIds("WF", requirements.wordFormCount),
    ...numberedIds("VOC", requirements.vocabularyCount),
  ];
}

function distributeRange(range: [number, number], count: number) {
  const lower = Math.floor(range[0] / count);
  const upper = Math.ceil(range[1] / count);
  return Array.from({ length: count }, () => [lower, upper] as [number, number]);
}

export function paragraphWordBudgets(targetWordCount: number, paragraphCount: number) {
  if (!Number.isInteger(paragraphCount) || paragraphCount < 1) return [];
  const policy = englishWordRangesForTarget(targetWordCount);
  const preferred = distributeRange(policy.generationRange, paragraphCount);
  const accepted = distributeRange(policy.validationRange, paragraphCount).map(([lower, upper]) => (
    paragraphCount === 1 ? [lower, upper] : [Math.max(1, lower - 5), upper + 5]
  ) as [number, number]);
  return preferred.map((preferredRange, paragraphIndex) => ({ paragraphIndex, preferredRange, acceptedRange: accepted[paragraphIndex] }));
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value));
}

function issueKey(issue: ChapterTemplateIssue) {
  return `${issue.code}:${issue.target ?? ""}`;
}

export function compileChapterTemplate(generated: GeneratedChapterTemplate, requirements: ChapterTemplateRequirements): CompiledChapterTemplate {
  const issues: ChapterTemplateIssue[] = [];
  if (generated.outlineChapterId !== requirements.outlineChapterId) issues.push({ code: "chapter_id", message: "返回章节 ID 与目标章节不一致" });
  if (generated.paragraphs.length !== requirements.paragraphCount) issues.push({ code: "paragraph_count", message: `段落数量应为 ${requirements.paragraphCount}，实际 ${generated.paragraphs.length}` });

  const requiredSlotIds = requiredChapterSlotIds(requirements);
  const actualSlotIds = generated.slots.map((slot) => slot.id);
  if (!sameSet(actualSlotIds, requiredSlotIds)) issues.push({ code: "slot_set", message: `题目槽位必须恰好为 ${requiredSlotIds.join("、")}` });

  const markerLocations = generated.paragraphs.flatMap(({ template }, paragraphIndex) => [...template.matchAll(markerPattern)].map((match) => ({ id: match[1], paragraphIndex })));
  const markers = markerLocations.map((marker) => marker.id);
  if (!sameSet(markers, requiredSlotIds)) issues.push({ code: "marker_set", message: "正文模板必须恰好引用每个要求槽位一次" });

  const pointsByKey = new Map(requirements.grammarPoints.map((point) => [point.key, point]));
  const grammarSlots = generated.slots.filter((slot): slot is Extract<GeneratedContentSlot, { kind: "optionCloze" | "wordForm" }> => slot.kind !== "vocabulary");
  for (const slot of grammarSlots) {
    if (!pointsByKey.has(slot.knowledgePointKey)) {
      issues.push({ code: "knowledge_point", target: slot.id, message: `${slot.id} 使用了未允许的知识点` });
    }
  }
  const covered = new Set(grammarSlots.map((slot) => slot.knowledgePointKey));
  const missing = requirements.grammarPoints.filter((point) => !covered.has(point.key));
  if (missing.length) issues.push({ code: "knowledge_point_coverage", message: `未覆盖知识点：${missing.map((point) => point.label).join("、")}` });

  const slotMap = new Map(generated.slots.map((slot) => [slot.id, slot]));
  const paragraphs = generated.paragraphs.map(({ template }, paragraphIndex): CourseContentParagraph => {
    const parts: CourseContentPart[] = [];
    let cursor = 0;
    for (const match of template.matchAll(markerPattern)) {
      const start = match.index ?? 0;
      const text = template.slice(cursor, start);
      if (text) parts.push({ type: "text", text });
      const slotId = match[1];
      const slot = slotMap.get(slotId);
      if (slot?.kind === "optionCloze") {
        const id = `grammar-${requirements.outlineChapterId}-${slot.id}`;
        parts.push({ type: "grammar", id, exerciseType: "optionCloze", knowledgePointId: slot.knowledgePointKey, answer: slot.answer, options: stableShuffle([slot.answer, ...slot.distractors], id) });
      } else if (slot?.kind === "wordForm") {
        parts.push({ type: "grammar", id: `grammar-${requirements.outlineChapterId}-${slot.id}`, exerciseType: "wordForm", knowledgePointId: slot.knowledgePointKey, answer: slot.answer, baseForm: slot.cue });
      } else if (slot?.kind === "vocabulary") {
        parts.push({ type: "vocabulary", id: `vocabulary-${requirements.outlineChapterId}-${slot.id}`, answer: slot.answer, canonicalForm: slot.canonicalForm, meaningZh: slot.meaningZh });
      } else {
        parts.push({ type: "text", text: match[0] });
      }
      cursor = start + match[0].length;
    }
    const tail = template.slice(cursor);
    if (tail) parts.push({ type: "text", text: tail });
    return { id: `paragraph-${requirements.outlineChapterId}-${paragraphIndex + 1}`, parts };
  });

  for (const paragraph of paragraphs) {
    for (const message of validateParagraphParts(paragraph)) issues.push({ code: "part_structure", target: paragraph.id, message });
  }

  const cleanParagraphs = paragraphs.map(buildCleanParagraphText);
  const budgets = paragraphWordBudgets(requirements.targetWordCount, requirements.paragraphCount);
  const paragraphWordCounts = cleanParagraphs.map(englishWordCount);
  const cleanText = cleanParagraphs.join(" ");
  const wordCount = englishWordCount(cleanText);
  const [minimumWords, maximumWords] = englishWordRangesForTarget(requirements.targetWordCount).validationRange;
  const chapterWordCountValid = wordCount >= minimumWords && wordCount <= maximumWords;
  paragraphWordCounts.forEach((count, index) => {
    const budget = budgets[index];
    if (!budget) return;
    const [minimumParagraphWords, maximumParagraphWords] = budget.acceptedRange;
    const outsideToleratedRange = count < minimumParagraphWords - PARAGRAPH_WORD_COUNT_TOLERANCE || count > maximumParagraphWords + PARAGRAPH_WORD_COUNT_TOLERANCE;
    if (!chapterWordCountValid || outsideToleratedRange) issues.push({ code: "paragraph_word_count", target: paragraphs[index]?.id, message: `第 ${index + 1} 段词数应为 ${minimumParagraphWords}–${maximumParagraphWords}（整章合格时允许上下浮动 ${PARAGRAPH_WORD_COUNT_TOLERANCE} 词），实际 ${count}` });
  });
  if (wordCount < minimumWords || wordCount > maximumWords) issues.push({ code: "word_count", message: `正文词数应为 ${minimumWords}–${maximumWords}，实际 ${wordCount}` });

  return { paragraphs, cleanText, wordCount, paragraphWordCounts, issues: [...new Map(issues.map((issue) => [issueKey(issue), issue])).values()] };
}

export function parseReadingTemplatePayload(payload: unknown, requirements: ChapterTemplateRequirements[]) {
  const envelope = z.object({
    contractVersion: z.string(),
    chapters: z.array(z.unknown()),
    mainIdea: z.unknown().optional(),
  }).passthrough().safeParse(payload);
  if (!envelope.success || envelope.data.contractVersion !== STEP4_CONTENT_CONTRACT_VERSION) {
    const envelopeError = envelope.success ? `生成协议版本不匹配：${envelope.data.contractVersion}` : "整课响应外层结构无效";
    return {
      envelopeError,
      mainIdea: null,
      mainIdeaError: envelopeError,
      chapters: requirements.map((requirement) => ({ outlineChapterId: requirement.outlineChapterId, generated: null, parseError: envelopeError })),
    };
  }

  const candidatesById = new Map<string, unknown[]>();
  for (const candidate of envelope.data.chapters) {
    const id = typeof candidate === "object" && candidate !== null && typeof Reflect.get(candidate, "outlineChapterId") === "string" ? Reflect.get(candidate, "outlineChapterId") as string : null;
    if (id) candidatesById.set(id, [...(candidatesById.get(id) ?? []), candidate]);
  }
  const mainIdeaResult = z.object({ text: requiredText }).passthrough().safeParse(envelope.data.mainIdea);
  return {
    envelopeError: null,
    mainIdea: mainIdeaResult.success ? { text: mainIdeaResult.data.text } : null,
    mainIdeaError: mainIdeaResult.success ? null : "课后阅读结构无效",
    chapters: requirements.map((requirement) => {
      const candidates = candidatesById.get(requirement.outlineChapterId) ?? [];
      if (candidates.length !== 1) return { outlineChapterId: requirement.outlineChapterId, generated: null, parseError: candidates.length ? "章节 ID 重复" : "章节缺失" };
      const parsed = generatedChapterTemplateSchema.safeParse(candidates[0]);
      return parsed.success
        ? { outlineChapterId: requirement.outlineChapterId, generated: parsed.data, parseError: null }
        : { outlineChapterId: requirement.outlineChapterId, generated: null, parseError: "章节模板结构无效" };
    }),
  };
}

export function applyChapterTemplateRepairs(current: GeneratedChapterTemplate, repairs: ChapterTemplateRepair[]) {
  return repairs.reduce((chapter, repair) => {
    if (repair.outlineChapterId !== chapter.outlineChapterId) throw new Error("修复目标章节不一致");
    if (repair.kind === "chapter") {
      if (repair.chapter.outlineChapterId !== chapter.outlineChapterId) throw new Error("重生章节 ID 不一致");
      return repair.chapter;
    }
    if (!chapter.paragraphs[repair.paragraphIndex]) throw new Error("修复目标段落不存在");
    const replacements = new Map(repair.slots.map((slot) => [slot.id, slot]));
    const existingIds = new Set(chapter.slots.map((slot) => slot.id));
    return {
      ...chapter,
      paragraphs: chapter.paragraphs.map((paragraph, index) => index === repair.paragraphIndex ? { template: repair.template } : paragraph),
      slots: [
        ...chapter.slots.map((slot) => replacements.get(slot.id) ?? slot),
        ...repair.slots.filter((slot) => !existingIds.has(slot.id)),
      ],
    };
  }, current);
}

export function repairFullyResolvesChapter(previous: ChapterTemplateIssue[], candidate: ChapterTemplateIssue[]) {
  return previous.length > 0 && candidate.length === 0;
}

export function decompileChapterTemplate(chapter: CourseContentChapter, knowledgePointKeyById: Map<string, string>): GeneratedChapterTemplate | null {
  const slots: GeneratedContentSlot[] = [];
  const paragraphs: Array<{ template: string }> = [];
  for (const paragraph of chapter.paragraphs) {
    let template = "";
    for (const part of paragraph.parts) {
      if (part.type === "text") {
        template += part.text;
        continue;
      }
      const match = part.id.match(/-(OC\d+|WF\d+|VOC\d+)$/);
      if (!match) return null;
      const id = match[1];
      template += `{{${id}}}`;
      if (part.type === "vocabulary") {
        slots.push({ id, kind: "vocabulary", answer: part.answer, canonicalForm: part.canonicalForm, meaningZh: part.meaningZh });
      } else if (part.exerciseType === "wordForm") {
        const knowledgePointKey = knowledgePointKeyById.get(part.knowledgePointId);
        if (!knowledgePointKey || !part.baseForm) return null;
        slots.push({ id, kind: "wordForm", knowledgePointKey, answer: part.answer, cue: part.baseForm });
      } else {
        const knowledgePointKey = knowledgePointKeyById.get(part.knowledgePointId);
        const distractors = (part.options ?? []).filter((option) => option.trim().toLocaleLowerCase() !== part.answer.trim().toLocaleLowerCase());
        if (!knowledgePointKey || distractors.length !== 2) return null;
        slots.push({ id, kind: "optionCloze", knowledgePointKey, answer: part.answer, distractors: [distractors[0], distractors[1]] });
      }
    }
    if (!template.trim()) return null;
    paragraphs.push({ template });
  }
  return generatedChapterTemplateSchema.safeParse({ outlineChapterId: chapter.outlineChapterId, paragraphs, slots }).success
    ? { outlineChapterId: chapter.outlineChapterId, paragraphs, slots }
    : null;
}

function promptChapterSpec(chapter: ReadingTemplatePromptContext["chapters"][number]) {
  const wordRanges = englishWordRangesForTarget(chapter.requirements.targetWordCount);
  const grammarPoints = chapter.requirements.grammarPoints.map(({ key, label, category, unitStart, unitEnd, sourceUnits }) => Object.fromEntries(Object.entries({
    key,
    label,
    category,
    unitRange: unitStart === undefined ? undefined : unitStart === unitEnd ? `Unit ${unitStart}` : `Units ${unitStart}–${unitEnd}`,
    units: sourceUnits,
  }).filter(([, value]) => value !== undefined)));
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    summary: chapter.summary,
    narrativeTense: chapter.requirements.narrativeTense ?? "past",
    chapterWordBudget: { target: chapter.requirements.targetWordCount, preferredRange: wordRanges.generationRange, acceptedRange: wordRanges.validationRange },
    paragraphBudgets: paragraphWordBudgets(chapter.requirements.targetWordCount, chapter.requirements.paragraphCount),
    requiredSlotIds: requiredChapterSlotIds(chapter.requirements),
    grammarPoints,
    ...(chapter.knowledgePointUsagePlan ? { knowledgePointUsagePlan: chapter.knowledgePointUsagePlan } : {}),
  };
}

export function buildReadingTemplatePrompt(context: ReadingTemplatePromptContext) {
  const payload = {
    storyTitle: context.storyTitle,
    storySummary: context.storySummary,
    contentIntent: context.contentIntent,
    englishLevel: context.englishLevel,
    cefrWritingProfile: context.cefrWritingProfile,
    storyComplexityProfile: context.storyComplexityProfile,
    people: context.people,
    storyCharacters: context.storyCharacters,
    grammarSource: context.grammarSource,
    chapters: context.chapters.map(promptChapterSpec),
    mainIdea: context.mainIdea,
  };
  return [
    "依据 context 一次生成全部章节英文正文、候选作答点和 Main Idea；只返回严格 JSON，不要说明或 Markdown。本轮不生成任何 distractors，候选作答点将在下一次 AI 调用中独立审核定稿。",
    "成功标准同时满足：回填答案后每个完整句的语法、时态与体、主谓一致、单复数、代词、助动词、介词、语序和时间逻辑正确；输出契约正确；忠实保持章节事实、人物行动、关键因果、物品去向和结局。英语正确性最高，不得为题量、知识点、字数或故事表达让步。",
    "contentIntent 是已确认的最终内容目标：storyMode='faithful' 时不得改写原作关键人物、事件因果或结局；classroomPresence='observer' 时课堂人物只能见证，不能推动或改变原作事件。概念故事必须让正文自然呈现每个 learningTarget.expectedUnderstanding；事实故事不得超出 factualFocus 和 sourceRequirements；required 必须保留，excluded 不得出现。contentIntent 不存在时只依据已确认大纲，不自行推测教学理论。",
    "grammarSource 给出本课程统一使用的 Grammar in Use 书名、版本和官方难度；各章 grammarPoints 罗列本章知识点及准确官方 Unit。用这些目录信息和已有英语知识理解实际语法含义；Unit 只是来源，不增加覆盖数量，也不要复述教材内容或自行补案例。",
    "englishLevel 与 cefrWritingProfile 控制表达难度，storyComplexityProfile 控制叙事结构。每段用具体行动、必要对话或概念结果推进故事并保持连续；禁止用大纲复述、规则说明、检查过程或重复空话凑词数，不得为篇幅新增冲突、反转、支线或万能机制。",
    "返回 {candidateVersion,chapters:[chapter],mainIdea:{text}}；chapter={outlineChapterId,paragraphs:[{template}],slots:[slot]}，template 使用 {{OC1}}/{{WF1}}/{{VOC1}}。",
    "slot 统一放入同一数组：{id,kind:'optionCloze',knowledgePointKey,answer}；{id,kind:'wordForm',knowledgePointKey,answer,cue}；{id,kind:'vocabulary',answer,canonicalForm,meaningZh}。禁止返回 distractors 或 options；给词题只用 cue，不返回 baseForm。",
    "先写出正确、连贯的完整 clean text，再从自然存在的结构设置槽位；禁止先定答案再倒推句子。narrativeTense 是旁白基准，其他时态须有句意、时间提示、事件先后或对话支持；知识点不自然时改写局部语境。",
    "requiredSlotIds 每个都在 template 与 slots 中各出现一次；knowledgePointKey 仅来自本章 grammarPoints 且全部覆盖。每个语法空格的 answer 选择本身必须由绑定知识点决定；构成目标语法的功能词、助动词或情态词必须包含在 answer 内，不得预先写在 marker 外。若目标是 to + verb，必须用 {{WF}} 且 answer='to verb'，不得用 to {{WF}} 且 answer='verb'。仅在完整句其他位置出现知识点、而空格只考查无关词形或词义，不算覆盖。cue 是给词提示。",
    "词汇槽位选择适合当前 CEFR、可脱离本句复习的实词或常用词组；canonicalForm 用词典原形，meaningZh 对应当前语境。",
    "每章优先落入 chapterWordBudget.preferredRange，且必须落入 chapterWordBudget.acceptedRange；每段同时优先落入 paragraphBudgets.preferredRange，且必须落入 paragraphBudgets.acceptedRange（所有上下界均为硬验收）；题目答案计入词数。人物、信息、物品和章节结果必须连续。",
    "Main Idea 只返回 {text}，概括全故事且遵守 mainIdea 的 preferredRange 和 acceptedRange，不含题目或标题。",
    "返回前回填全部答案并逐句通读，再检查章节 ID、段落数、固定槽位、知识点覆盖和词数；先修正全部错误，不输出检查过程。示例只说明字段连接方式，禁止照抄内容或数量。",
    "<formatExample>",
    JSON.stringify({ candidateVersion: STEP4_READING_CANDIDATE_VERSION, chapters: [{ outlineChapterId: "example-id", paragraphs: [{ template: "Mia {{OC1}} ready and must {{WF1}} the {{VOC1}}." }], slots: [{ id: "OC1", kind: "optionCloze", knowledgePointKey: "EXAMPLE_KEY", answer: "is" }, { id: "WF1", kind: "wordForm", knowledgePointKey: "EXAMPLE_KEY", answer: "carry", cue: "carry" }, { id: "VOC1", kind: "vocabulary", answer: "map", canonicalForm: "map", meaningZh: "地图" }] }], mainIdea: { text: "Mia follows a plan." } }),
    "</formatExample>",
    "<context>",
    JSON.stringify(payload),
    "</context>",
  ].join("\n");
}

export function buildReadingTemplateFinalizationPrompt(candidateOutput: unknown, context: ReadingTemplatePromptContext) {
  const specs = context.chapters.map((chapter) => {
    const spec = promptChapterSpec(chapter);
    return {
      id: spec.id,
      summary: spec.summary,
      narrativeTense: spec.narrativeTense,
      acceptedWordRange: spec.chapterWordBudget.acceptedRange,
      paragraphAcceptedRanges: spec.paragraphBudgets.map((budget) => budget.acceptedRange),
      requiredSlotIds: spec.requiredSlotIds,
      grammarPoints: spec.grammarPoints.map((point) => ({ key: point.key, label: point.label, units: point.units })),
    };
  });
  return [
    "你是英语教案的最终审校编辑。完整审核 candidate 中的正文、Main Idea 和每一道嵌入题；只返回严格 JSON，不要说明或 Markdown。英语正确性是最高验收门槛。",
    "第一步审核纯正文：把每个 marker 替换为对应 answer，逐句通读全文，包括不含 marker 的句子；语法、时态与体、叙事基准时态、主谓一致、单复数、代词指代、助动词、介词、语序、事件先后和段落衔接必须全部正确。任何位置有错，都返回该段完整 paragraphPatch。",
    "第二步审核题目：候选位置、answer、cue 均可修改；空格处的选择本身必须真实考查绑定 grammarPoint。构成目标语法的功能词、助动词或情态词必须包含在 answer 内，不得预先泄露在 marker 外；若目标是 to + verb，必须用 {{WF}} 且 answer='to verb'，不得用 to {{WF}} 且 answer='verb'。optionCloze 返回两个标准、完整且拼写正确的 distractors；逐项回填后只有 answer 能同时满足当前语法、时间线和语义，否则改写局部上下文提供决定性线索。wordForm 不能只在句子其他位置体现知识点。vocabulary 三个字段须一致，answer 不含连字符。",
    "保持章节 ID、段落数、requiredSlotIds、题型题量、知识点白名单与覆盖以及 accepted word ranges；只修错误所需的局部文字，保留候选事实、人物行动、因果、物品去向和结局，不增加新事实或支线。Main Idea 也必须英语正确并准确概括全文。",
    "返回 {contractVersion,chapters:[{outlineChapterId,paragraphPatches,slots}],mainIdea?}。paragraphPatches 只列需要修改的段落，元素为 {paragraphIndex,template}，索引从 0 开始；无修改返回 []。slots 必须返回本章全部最终 slot：option={id,kind:'optionCloze',knowledgePointKey,answer,distractors:[两个]}，wordForm={id,kind:'wordForm',knowledgePointKey,answer,cue}，vocabulary={id,kind:'vocabulary',answer,canonicalForm,meaningZh}。Main Idea 无需修改时省略 mainIdea，需要修改时返回完整 {text}。",
    "输出前再次用最终 slots 回填候选正文与所有 paragraphPatches，确认纯正文和题目两轮审核均通过；不要输出审核过程。",
    "<reviewContext>",
    JSON.stringify({
      finalContractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      englishLevel: context.englishLevel,
      cefrWritingProfile: context.cefrWritingProfile,
      grammarSource: context.grammarSource,
      contentIntent: context.contentIntent,
      specs,
      mainIdeaAcceptedRange: context.mainIdea.acceptedRange,
      candidate: candidateOutput,
    }),
    "</reviewContext>",
  ].join("\n");
}

export function buildReadingTemplateRepairPrompt(targets: Array<{
  current: GeneratedChapterTemplate | null;
  requirements: ChapterTemplateRequirements;
  issues: ChapterTemplateIssue[];
  parseError?: string | null;
}>, context: ReadingTemplatePromptContext, mainIdeaTarget?: { current: { text: string } | null; issues: string[] }) {
  const chapterById = new Map(context.chapters.map((chapter, index) => [chapter.id, { chapter, index }]));
  const adjacentSummary = (chapter: ReadingTemplatePromptContext["chapters"][number] | undefined) => chapter
    ? { id: chapter.id, title: chapter.title, summary: chapter.summary }
    : undefined;
  return [
    "一次修复全部失败目标，只返回严格 JSON：{contractVersion,repairs:[...],mainIdea?}。不得返回或修改未列出的成功章节；课后阅读未失败时不得返回 mainIdea。",
    "有可用 current 且问题只影响局部时返回 paragraph repair={kind:'paragraph',outlineChapterId,paragraphIndex,template,slots:[只含该段需新增或修改的槽位]}。结构无法局部恢复或 current 为空时返回 chapter repair={kind:'chapter',outlineChapterId,chapter}。",
    "每个修复必须一次消除该章全部 issues；保留故事事实、未失败段落和未失败槽位。若无法保证完全修复，也必须只返回目标范围，禁止扩大修改。",
    `最小共享上下文：${JSON.stringify({ storyTitle: context.storyTitle, storySummary: context.storySummary, ...(mainIdeaTarget ? { storyArc: context.chapters.map(({ id, title, summary }) => ({ id, title, summary })) } : {}), contentIntent: context.contentIntent, englishLevel: context.englishLevel, cefrWritingProfile: context.cefrWritingProfile, storyComplexity: context.storyComplexity, storyComplexityProfile: context.storyComplexityProfile, people: context.people, grammarSource: context.grammarSource })}。`,
    "英语正确性是最高优先级：修复后的答案回填句必须在语法、时态、主谓一致、单复数、代词、助动词、介词、语序和时间逻辑上正确。每个语法空格的 answer 选择本身必须由绑定知识点决定；仅完整句其他位置出现知识点不算覆盖。分别回填每个 distractor，只要任一项在当前语法、时间线和语义中也成立，就先改写局部上下文使 answer 成为唯一正确答案。不得为了题量、知识点覆盖、字数或故事表达保留错误英语。",
    "只修目标问题，不得借修复增加冲突、反转、支线或改变事实。knowledgePointKey 只能来自 spec.grammarPoints，全部知识点至少覆盖一次；requiredSlotIds 必须在模板和 slots 中各恰好出现一次。",
    ...(mainIdeaTarget ? ["mainIdea 只返回 {text}，依据共享故事事实概括全故事并解决 mainIdeaTarget 的全部问题，不修改正文。"] : []),
    "<repairTargets>",
    JSON.stringify({ contractVersion: STEP4_CONTENT_CONTRACT_VERSION, mainIdeaTarget, mainIdeaPolicy: mainIdeaTarget ? context.mainIdea : undefined, targets: targets.map((target) => {
      const located = chapterById.get(target.requirements.outlineChapterId);
      const chapter = located?.chapter;
      return {
        current: target.current,
        issues: target.issues,
        parseError: target.parseError,
        spec: chapter ? promptChapterSpec(chapter) : {
          id: target.requirements.outlineChapterId,
          narrativeTense: target.requirements.narrativeTense ?? "past",
          chapterWordBudget: { target: target.requirements.targetWordCount, preferredRange: englishWordRangesForTarget(target.requirements.targetWordCount).generationRange, acceptedRange: englishWordRangesForTarget(target.requirements.targetWordCount).validationRange },
          paragraphBudgets: paragraphWordBudgets(target.requirements.targetWordCount, target.requirements.paragraphCount),
          requiredSlotIds: requiredChapterSlotIds(target.requirements),
          grammarPoints: target.requirements.grammarPoints.map(({ key, label, category, unitStart, unitEnd, sourceUnits }) => ({ key, label, category, unitStart, unitEnd, units: sourceUnits })),
        },
        previousChapter: located && located.index > 0 ? adjacentSummary(context.chapters[located.index - 1]) : undefined,
        nextChapter: located && located.index < context.chapters.length - 1 ? adjacentSummary(context.chapters[located.index + 1]) : undefined,
      };
    }) }),
    "</repairTargets>",
  ].join("\n");
}
