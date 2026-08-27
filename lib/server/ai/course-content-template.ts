import { z } from "zod";

import type { CourseContentChapter, CourseContentParagraph, CourseContentPart } from "@/lib/contracts/api";
import { buildCleanParagraphText, stableShuffle, validateParagraphParts } from "@/lib/domain/course-content";
import { englishWordRangesForTarget } from "@/lib/domain/story-length-policy";

export const STEP4_CONTENT_CONTRACT_VERSION = "step4.content.v2" as const;

const requiredText = z.string().trim().min(1);
const optionSlotSchema = z.object({
  id: z.string().regex(/^OC\d+$/),
  kind: z.literal("optionCloze"),
  knowledgePointKey: requiredText,
  answer: requiredText,
  distractors: z.tuple([requiredText, requiredText]),
}).strict();
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
export const generatedChapterTemplateSchema = z.object({
  outlineChapterId: requiredText,
  paragraphs: z.array(z.object({ template: requiredText }).strict()).min(1),
  slots: z.array(generatedContentSlotSchema),
}).strict();

export type GeneratedContentSlot = z.infer<typeof generatedContentSlotSchema>;
export type GeneratedChapterTemplate = z.infer<typeof generatedChapterTemplateSchema>;
export type ChapterGrammarPoint = { key: string; label: string; category?: string };
export type ChapterTemplateRequirements = {
  outlineChapterId: string;
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
  repairs: z.array(chapterTemplateRepairSchema).min(1),
}).strict();
export type ChapterTemplateRepair = z.infer<typeof chapterTemplateRepairSchema>;

export type ReadingTemplatePromptContext = {
  storyTitle: string;
  storySummary: string;
  englishLevel: string;
  cefrWritingProfile: string;
  storyComplexity: string;
  storyComplexityProfile: string;
  people: Array<{ englishName: string; role: "teacher" | "student" }>;
  storyCharacters: Array<{ displayName: string; storyRole: string }>;
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    summary: string;
    requirements: ChapterTemplateRequirements;
    knowledgePointUsagePlan?: string;
  }>;
  mainIdea: { targetWordCount: number; preferredRange: [number, number]; acceptedRange: [number, number] };
  qualityRules: string[];
};

const markerPattern = /\{\{([A-Z]+\d+)\}\}/g;

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
  const preferred = distributeRange(policy.aimRange, paragraphCount);
  const accepted = distributeRange(policy.generationRange, paragraphCount);
  return preferred.map((preferredRange, paragraphIndex) => ({ paragraphIndex, preferredRange, acceptedRange: accepted[paragraphIndex] }));
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value));
}

function englishWordCount(text: string) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
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
    if (!pointsByKey.has(slot.knowledgePointKey)) issues.push({ code: "knowledge_point", target: slot.id, message: `${slot.id} 使用了未允许的知识点` });
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
  paragraphWordCounts.forEach((count, index) => {
    const budget = budgets[index];
    if (budget && (count < budget.acceptedRange[0] || count > budget.acceptedRange[1])) issues.push({ code: "paragraph_word_count", target: paragraphs[index]?.id, message: `第 ${index + 1} 段词数应为 ${budget.acceptedRange[0]}–${budget.acceptedRange[1]}，实际 ${count}` });
  });
  const cleanText = cleanParagraphs.join(" ");
  const wordCount = englishWordCount(cleanText);
  const [minimumWords, maximumWords] = englishWordRangesForTarget(requirements.targetWordCount).generationRange;
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
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    summary: chapter.summary,
    paragraphBudgets: paragraphWordBudgets(chapter.requirements.targetWordCount, chapter.requirements.paragraphCount),
    requiredSlotIds: requiredChapterSlotIds(chapter.requirements),
    grammarPoints: chapter.requirements.grammarPoints,
    ...(chapter.knowledgePointUsagePlan ? { knowledgePointUsagePlan: chapter.knowledgePointUsagePlan } : {}),
  };
}

export function buildReadingTemplatePrompt(context: ReadingTemplatePromptContext) {
  const payload = {
    contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
    storyTitle: context.storyTitle,
    storySummary: context.storySummary,
    englishLevel: context.englishLevel,
    cefrWritingProfile: context.cefrWritingProfile,
    storyComplexity: context.storyComplexity,
    storyComplexityProfile: context.storyComplexityProfile,
    people: context.people,
    storyCharacters: context.storyCharacters,
    chapters: context.chapters.map(promptChapterSpec),
    mainIdea: context.mainIdea,
  };
  return [
    "一次生成全部章节英文正文、正文题目槽位和 Main Idea，只返回严格 JSON，不要说明或 Markdown。返回 contractVersion、chapters、mainIdea。",
    "chapter={outlineChapterId,paragraphs:[{template}],slots:[slot]}。template 用 {{OC1}}/{{WF1}}/{{VOC1}} 标记答案位置；requiredSlotIds 中每个 ID 必须在 template 和 slots 各恰好出现一次。",
    "slot 统一放入同一个数组：选项填空={id,kind:'optionCloze',knowledgePointKey,answer,distractors:[两个]}；给词填空={id,kind:'wordForm',knowledgePointKey,answer,cue}；词汇={id,kind:'vocabulary',answer,canonicalForm,meaningZh}。",
    "AI 根据故事语境自主为语法槽位选择允许的 grammarPoints.key；全部 grammarPoints 至少覆盖一次，额外槽位按自然度分配，不机械平均。",
    "先写自然、连贯、符合 englishLevel 的完整故事，再设置槽位。答案拼回后必须语法正确，不能为了覆盖知识点制造错误句子。",
    "storyComplexity 只限制叙事结构，不改变上游事实、既定因果、学习目标或点名角色。目标词数调高时只增加必要表达、连接与细节，不得增加冲突、反转、支线或新机制。",
    ...context.qualityRules,
    "每段优先落入 paragraphBudgets.preferredRange，绝不能超过 acceptedRange；题目答案计入词数。人物、信息、物品和章节结果必须连续。",
    "Main Idea 只返回 {text}，概括全故事且遵守 mainIdea 的 preferredRange 和 acceptedRange，不含题目或标题。",
    "返回前在内部检查协议版本、章节 ID、段落数、全部固定槽位、知识点覆盖、答案正确性和词数；不要输出检查过程。",
    "下面仅示范 JSON 字段与槽位连接方式，禁止照抄章节 ID、内容或数量；实际输出必须完全遵守 context。",
    "<formatExample>",
    JSON.stringify({ contractVersion: STEP4_CONTENT_CONTRACT_VERSION, chapters: [{ outlineChapterId: "example-id", paragraphs: [{ template: "Mia {{OC1}} ready and must {{WF1}} the {{VOC1}}." }], slots: [{ id: "OC1", kind: "optionCloze", knowledgePointKey: "EXAMPLE_KEY", answer: "is", distractors: ["are", "be"] }, { id: "WF1", kind: "wordForm", knowledgePointKey: "EXAMPLE_KEY", answer: "carry", cue: "carry" }, { id: "VOC1", kind: "vocabulary", answer: "map", canonicalForm: "map", meaningZh: "地图" }] }], mainIdea: { text: "Mia follows a plan." } }),
    "</formatExample>",
    "<context>",
    JSON.stringify(payload),
    "</context>",
  ].join("\n");
}

export function buildReadingTemplateRepairPrompt(targets: Array<{
  current: GeneratedChapterTemplate | null;
  requirements: ChapterTemplateRequirements;
  issues: ChapterTemplateIssue[];
  parseError?: string | null;
}>, storyRules?: { storyComplexity: string; storyComplexityProfile: string }) {
  return [
    "修复失败章节，只返回严格 JSON：{contractVersion,repairs:[...]}。不得返回或修改未列出的成功章节。",
    "有可用 current 且问题只影响局部时返回 paragraph repair={kind:'paragraph',outlineChapterId,paragraphIndex,template,slots:[只含该段需新增或修改的槽位]}。结构无法局部恢复或 current 为空时返回 chapter repair={kind:'chapter',outlineChapterId,chapter}。",
    "每个修复必须一次消除该章全部 issues；保留故事事实、未失败段落和未失败槽位。若无法保证完全修复，也必须只返回目标范围，禁止扩大修改。",
    ...(storyRules ? [`故事复杂度与边界：${JSON.stringify(storyRules)}。只修篇幅或结构，不得借修复增加冲突、反转、支线或改变事实。`] : []),
    "knowledgePointKey 只能来自 requirements.grammarPoints，全部知识点至少覆盖一次；requiredSlotIds 必须在模板和 slots 中各恰好出现一次。",
    "<repairTargets>",
    JSON.stringify({ contractVersion: STEP4_CONTENT_CONTRACT_VERSION, targets: targets.map((target) => ({ ...target, requirements: { ...target.requirements, requiredSlotIds: requiredChapterSlotIds(target.requirements), paragraphBudgets: paragraphWordBudgets(target.requirements.targetWordCount, target.requirements.paragraphCount) } })) }),
    "</repairTargets>",
  ].join("\n");
}
