import { z } from "zod";

import type { CourseContentParagraph, CourseContentPart } from "@/lib/contracts/api";
import { buildCleanParagraphText, stableShuffle, validateParagraphParts } from "@/lib/domain/course-content";
import { cefrWritingProfile, readingWordCountPolicy } from "@/lib/server/ai/course-content-deps";
import { grammarExerciseGuidance, validateGrammarEvidence } from "@/lib/server/ai/grammar-exercise-guidance";

const requiredText = z.string().trim().min(1);
const evidenceText = z.string().trim().min(3);
const distractorsSchema = z.tuple([requiredText, requiredText]);

const optionSlotSchema = z.object({
  id: z.string().regex(/^OC\d+$/),
  knowledgePointKey: requiredText,
  answer: requiredText,
  distractors: distractorsSchema,
  evidenceExcerpt: evidenceText,
}).strict();

const guidedClozeSlotSchema = z.object({
  id: z.string().regex(/^WF\d+$/),
  knowledgePointKey: requiredText,
  answer: requiredText,
  cue: requiredText,
  evidenceExcerpt: evidenceText,
}).strict();

const vocabularySlotSchema = z.object({
  id: z.string().regex(/^VOC\d+$/),
  answer: requiredText,
  canonicalForm: requiredText,
  meaningZh: requiredText,
}).strict();

export const generatedChapterTemplateSchema = z.object({
  outlineChapterId: requiredText,
  paragraphs: z.array(z.object({ template: requiredText }).strict()).min(1),
  slots: z.object({
    optionCloze: z.array(optionSlotSchema),
    wordForm: z.array(guidedClozeSlotSchema),
    vocabulary: z.array(vocabularySlotSchema),
  }).strict(),
}).strict();

export const generatedReadingTemplateSchema = z.object({ chapters: z.array(generatedChapterTemplateSchema).min(1) }).strict();

export type GeneratedChapterTemplate = z.infer<typeof generatedChapterTemplateSchema>;
export type GeneratedReadingTemplate = z.infer<typeof generatedReadingTemplateSchema>;
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

export type ParagraphWordBudget = {
  paragraphIndex: number;
  preferredRange: [number, number];
  acceptedRange: [number, number];
};

export type ChapterTemplatePromptContext = {
  storyTitle: string;
  storySummary: string;
  englishLevel: string;
  chapter: { id: string; order: number; title: string; summary: string };
  surroundingChapters: Array<{ order: number; title: string; summary: string }>;
  grammarPoints: ChapterGrammarPoint[];
  people: Array<{ englishName: string; role: "teacher" | "student" }>;
  storyCharacters: Array<{ displayName: string; storyRole: string }>;
  requirements: ChapterTemplateRequirements;
};

export type ReadingTemplatePromptContext = {
  storyTitle: string;
  storySummary: string;
  englishLevel: string;
  people: Array<{ englishName: string; role: "teacher" | "student" }>;
  storyCharacters: Array<{ displayName: string; storyRole: string }>;
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    summary: string;
    requirements: ChapterTemplateRequirements;
  }>;
};

export type ChapterTemplateIssueCode =
  | "chapter_id"
  | "paragraph_count"
  | "paragraph_word_count"
  | "slot_set"
  | "marker_set"
  | "knowledge_point"
  | "knowledge_point_coverage"
  | "knowledge_point_evidence"
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

export const chapterTemplatePatchSchema = z.union([
  z.object({
    kind: z.literal("templates"),
    outlineChapterId: requiredText,
    paragraphs: z.array(z.object({ template: requiredText }).strict()).min(1),
  }).strict(),
  z.object({
    kind: z.literal("grammar_slot"),
    outlineChapterId: requiredText,
    paragraphIndex: z.number().int().nonnegative(),
    template: requiredText,
    slotType: z.enum(["optionCloze", "wordForm"]),
    slot: z.union([optionSlotSchema, guidedClozeSlotSchema]),
  }).strict(),
]);

export type ChapterTemplatePatch = z.infer<typeof chapterTemplatePatchSchema>;
export const chapterTemplatePatchBundleSchema = z.object({ patches: z.array(chapterTemplatePatchSchema).min(1) }).strict();
export type ChapterTemplateRepairMode = "patch" | "regenerate_chapter";
const markerPattern = /\{\{([A-Z]+\d+)\}\}/g;

function numberedIds(prefix: "OC" | "WF" | "VOC", count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function distributeRange(range: [number, number], count: number) {
  const distribute = (total: number) => {
    const base = Math.floor(total / count);
    const remainder = total % count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  };
  const minimums = distribute(range[0]);
  const maximums = distribute(range[1]);
  return minimums.map((minimum, index): [number, number] => [minimum, maximums[index]]);
}

export function paragraphWordBudgets(targetWordCount: number, paragraphCount: number): ParagraphWordBudget[] {
  if (!Number.isInteger(paragraphCount) || paragraphCount < 1) return [];
  const policy = readingWordCountPolicy(targetWordCount);
  const preferred = distributeRange(policy.aimRange, paragraphCount);
  const accepted = distributeRange(policy.acceptedRange, paragraphCount);
  return preferred.map((preferredRange, index) => ({ paragraphIndex: index, preferredRange, acceptedRange: accepted[index] }));
}

export function requiredChapterSlotIds(requirements: ChapterTemplateRequirements) {
  return [
    ...numberedIds("OC", requirements.optionClozeCount),
    ...numberedIds("WF", requirements.wordFormCount),
    ...numberedIds("VOC", requirements.vocabularyCount),
  ];
}

function promptChapterSpec(chapter: ReadingTemplatePromptContext["chapters"][number]) {
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    summary: chapter.summary,
    paragraphBudgets: paragraphWordBudgets(chapter.requirements.targetWordCount, chapter.requirements.paragraphCount),
    requiredSlotIds: requiredChapterSlotIds(chapter.requirements),
    grammarPoints: chapter.requirements.grammarPoints.map((point) => ({
      ...point,
      exerciseGuidance: grammarExerciseGuidance(point.label)?.guidance,
    })),
  };
}

function sharedPromptRules(scope: "一个章节" | "全部章节") {
  return [
    `联合生成${scope}的英文正文与固定题目槽位，只返回严格 JSON，不要说明。`,
    "结构={chapters:[{outlineChapterId,paragraphs:[{template}],slots:{optionCloze,wordForm,vocabulary}}]}；单章请求省略最外层 chapters。",
    "template 用 {{OC1}}/{{WF1}}/{{VOC1}} 标记答案位置；每个 requiredSlotIds 必须在模板和 slots 中各恰好出现一次。",
    "OC={id,knowledgePointKey,answer,distractors:[两个],evidenceExcerpt}；WF={id,knowledgePointKey,answer,cue,evidenceExcerpt}；VOC={id,answer,canonicalForm,meaningZh}。",
    "WF 是给词提示填空：cue 是括号提示，答案可等于 cue、发生词形变化或与助动/结构词共同完成知识点；不能把无关词形题贴上知识点 ID。",
    "每个语法槽位的 evidenceExcerpt 必须逐字取自答案替换后的所在段落，至少两个词，并展示答案与紧邻的目标语法结构。",
    "全部 grammarPoints 至少各覆盖一次；答案拼回后语法唯一正确。故事事实优先，删除重复解释和非必要修饰来满足篇幅。",
    "每段必须落入 paragraphBudgets.preferredRange，绝不能超过 acceptedRange；先按预算写完再放槽位，不把总词数误当成每段词数。",
    "只使用 people 英文名和 storyCharacters.displayName；章节按顺序保持人物、信息、物品和结果连续。",
  ];
}

export function buildReadingTemplateExperimentPrompt(context: ReadingTemplatePromptContext) {
  const payload = {
    storyTitle: context.storyTitle,
    storySummary: context.storySummary,
    englishLevel: context.englishLevel,
    cefrWritingProfile: cefrWritingProfile(context.englishLevel),
    people: context.people,
    storyCharacters: context.storyCharacters,
    chapters: context.chapters.map(promptChapterSpec),
  };
  return [...sharedPromptRules("全部章节"), "<context>", JSON.stringify(payload), "</context>"].join("\n");
}

export function buildChapterTemplateExperimentPrompt(context: ChapterTemplatePromptContext) {
  const chapter = promptChapterSpec({ ...context.chapter, requirements: context.requirements });
  const payload = {
    storyTitle: context.storyTitle,
    storySummary: context.storySummary,
    englishLevel: context.englishLevel,
    cefrWritingProfile: cefrWritingProfile(context.englishLevel),
    people: context.people,
    storyCharacters: context.storyCharacters,
    chapter,
    surroundingChapters: context.surroundingChapters,
  };
  return [...sharedPromptRules("一个章节"), "只返回单章对象，不要最外层 chapters。", "<context>", JSON.stringify(payload), "</context>"].join("\n");
}

const CHAPTER_REGENERATION_ISSUES = new Set<ChapterTemplateIssueCode>([
  "chapter_id",
  "paragraph_count",
  "slot_set",
  "marker_set",
  "knowledge_point",
  "knowledge_point_coverage",
  "part_structure",
]);

export function chapterTemplateRepairMode(issues: ChapterTemplateIssue[]): ChapterTemplateRepairMode {
  return issues.some((issue) => CHAPTER_REGENERATION_ISSUES.has(issue.code)) ? "regenerate_chapter" : "patch";
}

export function buildChapterTemplateRepairPrompt(
  current: GeneratedChapterTemplate,
  requirements: ChapterTemplateRequirements,
  issues: ChapterTemplateIssue[],
) {
  const mode = chapterTemplateRepairMode(issues);
  const payload = { current, requirements: promptChapterSpec({ id: requirements.outlineChapterId, order: 0, title: "", summary: "", requirements }), issues };
  const rules = mode === "patch"
    ? [
        "只返回 {patches:[...]}。词数问题返回 kind=templates，只改 paragraphs；语义证据问题返回 kind=grammar_slot，只改对应段落和槽位。",
        "不得返回或改写其他章节、已通过的槽位或人物事实。同一段有多个 grammar_slot patch 时，template 必须完全相同。",
      ]
    : [
        "结构契约已损坏，只重新返回当前这一章的完整单章对象；不得返回其他章节。",
        "严格使用 requiredSlotIds，并保留当前故事事实；先满足 preferredRange，再逐项自检槽位和 evidenceExcerpt。",
      ];
  return [
    "修复一个已生成章节，只返回严格 JSON，不要说明。",
    ...rules,
    "所有修改必须消除给定问题，且不能新增任何校验问题；否则保留原结果并停止自动修复。",
    "<repair>",
    JSON.stringify(payload),
    "</repair>",
  ].join("\n");
}

function normalizedSet(values: string[]) {
  return [...new Set(values)].sort();
}

function sameSet(left: string[], right: string[]) {
  const normalizedLeft = normalizedSet(left);
  const normalizedRight = normalizedSet(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function englishWordCount(text: string) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
}

function issueKey(issue: ChapterTemplateIssue) {
  return `${issue.code}:${issue.target ?? ""}`;
}

export function isMonotonicTemplateRepair(previous: ChapterTemplateIssue[], candidate: ChapterTemplateIssue[]) {
  const fingerprint = (issue: ChapterTemplateIssue) => `${issueKey(issue)}:${issue.message}`;
  const previousFingerprints = new Set(previous.map(fingerprint));
  const candidateFingerprints = new Set(candidate.map(fingerprint));
  return candidateFingerprints.size < previousFingerprints.size
    && [...candidateFingerprints].every((value) => previousFingerprints.has(value));
}

export function applyChapterTemplatePatch(current: GeneratedChapterTemplate, patch: ChapterTemplatePatch): GeneratedChapterTemplate {
  if (patch.outlineChapterId !== current.outlineChapterId) throw new Error("修复目标章节不一致");
  if (patch.kind === "templates") return { ...current, paragraphs: patch.paragraphs };
  if (!current.paragraphs[patch.paragraphIndex]) throw new Error("修复目标段落不存在");
  const slots = current.slots[patch.slotType];
  const slotIndex = slots.findIndex((slot) => slot.id === patch.slot.id);
  if (slotIndex < 0) throw new Error("修复目标槽位不存在");
  return {
    ...current,
    paragraphs: current.paragraphs.map((paragraph, index) => index === patch.paragraphIndex ? { template: patch.template } : paragraph),
    slots: {
      ...current.slots,
      [patch.slotType]: slots.map((slot, index) => index === slotIndex ? patch.slot : slot),
    },
  } as GeneratedChapterTemplate;
}

export function applyChapterTemplatePatches(current: GeneratedChapterTemplate, patches: ChapterTemplatePatch[]) {
  const templatePatches = patches.filter((patch) => patch.kind === "templates");
  if (templatePatches.length > 1) throw new Error("一次修复只能返回一个正文模板补丁");
  const paragraphTemplateByIndex = new Map<number, string>();
  for (const patch of patches) {
    if (patch.kind !== "grammar_slot") continue;
    const templatePatch = templatePatches[0];
    if (templatePatch && templatePatch.paragraphs[patch.paragraphIndex]?.template !== patch.template) {
      throw new Error("语法修复正文与本次正文模板补丁冲突");
    }
    const previous = paragraphTemplateByIndex.get(patch.paragraphIndex);
    if (previous !== undefined && previous !== patch.template) throw new Error("同一段落的多个语法修复返回了冲突正文");
    paragraphTemplateByIndex.set(patch.paragraphIndex, patch.template);
  }
  return [...patches]
    .sort((left, right) => Number(left.kind === "grammar_slot") - Number(right.kind === "grammar_slot"))
    .reduce(applyChapterTemplatePatch, current);
}

export function compileChapterTemplate(generated: GeneratedChapterTemplate, requirements: ChapterTemplateRequirements): CompiledChapterTemplate {
  const issues: ChapterTemplateIssue[] = [];
  if (generated.outlineChapterId !== requirements.outlineChapterId) issues.push({ code: "chapter_id", message: "返回章节 ID 与目标章节不一致" });
  if (generated.paragraphs.length !== requirements.paragraphCount) {
    issues.push({ code: "paragraph_count", message: `段落数量应为 ${requirements.paragraphCount}，实际 ${generated.paragraphs.length}` });
  }

  const slotEntries = [
    ...generated.slots.optionCloze.map((slot) => ({ kind: "optionCloze" as const, slot })),
    ...generated.slots.wordForm.map((slot) => ({ kind: "wordForm" as const, slot })),
    ...generated.slots.vocabulary.map((slot) => ({ kind: "vocabulary" as const, slot })),
  ];
  const actualSlotIds = slotEntries.map(({ slot }) => slot.id);
  const requiredSlotIds = requiredChapterSlotIds(requirements);
  if (!sameSet(actualSlotIds, requiredSlotIds) || new Set(actualSlotIds).size !== actualSlotIds.length) {
    issues.push({ code: "slot_set", message: `题目槽位必须恰好为 ${requiredSlotIds.join("、")}` });
  }

  const markerLocations = generated.paragraphs.flatMap(({ template }, paragraphIndex) => [...template.matchAll(markerPattern)].map((match) => ({ id: match[1], paragraphIndex })));
  const markers = markerLocations.map((marker) => marker.id);
  if (!sameSet(markers, requiredSlotIds) || new Set(markers).size !== markers.length) {
    issues.push({ code: "marker_set", message: "正文模板必须恰好引用每个要求槽位一次" });
  }

  const pointsByKey = new Map(requirements.grammarPoints.map((point) => [point.key, point]));
  const grammarSlots = slotEntries.filter((entry) => entry.kind !== "vocabulary");
  for (const { slot } of grammarSlots) {
    if (!("knowledgePointKey" in slot) || !pointsByKey.has(slot.knowledgePointKey)) {
      issues.push({ code: "knowledge_point", target: slot.id, message: `${slot.id} 使用了未允许的知识点` });
    }
  }
  const coveredKnowledgePoints = new Set(grammarSlots.flatMap(({ slot }) => "knowledgePointKey" in slot ? [slot.knowledgePointKey] : []));
  const missingKnowledgePoints = requirements.grammarPoints.filter((point) => !coveredKnowledgePoints.has(point.key));
  if (missingKnowledgePoints.length) {
    issues.push({ code: "knowledge_point_coverage", message: `未覆盖知识点：${missingKnowledgePoints.map((point) => point.label).join("、")}` });
  }

  const slotMap = new Map(slotEntries.map((entry) => [entry.slot.id, entry]));
  const paragraphs = generated.paragraphs.map(({ template }, paragraphIndex): CourseContentParagraph => {
    const parts: CourseContentPart[] = [];
    let cursor = 0;
    for (const match of template.matchAll(markerPattern)) {
      const markerStart = match.index ?? 0;
      const text = template.slice(cursor, markerStart);
      if (text) parts.push({ type: "text", text });
      const slotId = match[1];
      const entry = slotMap.get(slotId);
      if (entry?.kind === "optionCloze") {
        const id = `grammar-${requirements.outlineChapterId}-${slotId}`;
        parts.push({ type: "grammar", id, exerciseType: "optionCloze", knowledgePointId: entry.slot.knowledgePointKey, answer: entry.slot.answer, options: stableShuffle([entry.slot.answer, ...entry.slot.distractors], id) });
      } else if (entry?.kind === "wordForm") {
        parts.push({ type: "grammar", id: `grammar-${requirements.outlineChapterId}-${slotId}`, exerciseType: "wordForm", knowledgePointId: entry.slot.knowledgePointKey, answer: entry.slot.answer, baseForm: entry.slot.cue });
      } else if (entry?.kind === "vocabulary") {
        parts.push({ type: "vocabulary", id: `vocabulary-${requirements.outlineChapterId}-${slotId}`, answer: entry.slot.answer, canonicalForm: entry.slot.canonicalForm, meaningZh: entry.slot.meaningZh });
      } else {
        parts.push({ type: "text", text: match[0] });
      }
      cursor = markerStart + match[0].length;
    }
    const tail = template.slice(cursor);
    if (tail) parts.push({ type: "text", text: tail });
    return { id: `paragraph-${requirements.outlineChapterId}-${paragraphIndex + 1}`, parts };
  });

  for (const paragraph of paragraphs) {
    for (const message of validateParagraphParts(paragraph)) issues.push({ code: "part_structure", target: paragraph.id, message });
  }

  const resolvedParagraphs = paragraphs.map(buildCleanParagraphText);
  for (const { slot } of grammarSlots) {
    if (!("knowledgePointKey" in slot) || !("evidenceExcerpt" in slot)) continue;
    const point = pointsByKey.get(slot.knowledgePointKey);
    const location = markerLocations.find((marker) => marker.id === slot.id);
    if (!point || !location || !resolvedParagraphs[location.paragraphIndex]) continue;
    const evidenceIssue = validateGrammarEvidence(point.label, slot.evidenceExcerpt, resolvedParagraphs[location.paragraphIndex], slot.answer);
    if (evidenceIssue) issues.push({ code: "knowledge_point_evidence", target: slot.id, message: `${slot.id}：${evidenceIssue}` });
  }

  const paragraphWordCounts = resolvedParagraphs.map(englishWordCount);
  const budgets = paragraphWordBudgets(requirements.targetWordCount, requirements.paragraphCount);
  paragraphWordCounts.forEach((count, index) => {
    const budget = budgets[index];
    if (budget && (count < budget.acceptedRange[0] || count > budget.acceptedRange[1])) {
      issues.push({ code: "paragraph_word_count", target: paragraphs[index]?.id, message: `第 ${index + 1} 段词数应为 ${budget.acceptedRange[0]}–${budget.acceptedRange[1]}，实际 ${count}` });
    }
  });
  const cleanText = resolvedParagraphs.join(" ");
  const wordCount = englishWordCount(cleanText);
  const [minimumWords, maximumWords] = readingWordCountPolicy(requirements.targetWordCount).acceptedRange;
  if (wordCount < minimumWords || wordCount > maximumWords) {
    issues.push({ code: "word_count", message: `正文词数应为 ${minimumWords}–${maximumWords}，实际 ${wordCount}` });
  }

  return {
    paragraphs,
    cleanText,
    wordCount,
    paragraphWordCounts,
    issues: [...new Map(issues.map((issue) => [issueKey(issue), issue])).values()],
  };
}

export function compileReadingTemplate(generated: GeneratedReadingTemplate, requirements: ChapterTemplateRequirements[]) {
  const generatedById = new Map(generated.chapters.map((chapter) => [chapter.outlineChapterId, chapter]));
  const expectedIds = requirements.map((requirement) => requirement.outlineChapterId);
  const actualIds = generated.chapters.map((chapter) => chapter.outlineChapterId);
  return {
    chapterSetValid: sameSet(actualIds, expectedIds) && new Set(actualIds).size === actualIds.length,
    chapters: requirements.map((requirement) => {
      const chapter = generatedById.get(requirement.outlineChapterId);
      return chapter
        ? { outlineChapterId: requirement.outlineChapterId, result: compileChapterTemplate(chapter, requirement) }
        : { outlineChapterId: requirement.outlineChapterId, result: null };
    }),
  };
}

export function parseAndCompileReadingTemplate(payload: unknown, requirements: ChapterTemplateRequirements[]) {
  const envelope = z.object({ chapters: z.array(z.unknown()) }).strict().safeParse(payload);
  if (!envelope.success) {
    return {
      envelopeValid: false,
      chapterSetValid: false,
      chapters: requirements.map((requirement) => ({ outlineChapterId: requirement.outlineChapterId, result: null, parseError: "整课响应外层结构无效" })),
    };
  }

  const parsedById = new Map<string, GeneratedChapterTemplate>();
  const parseErrorsById = new Map<string, string>();
  const returnedIds: string[] = [];
  for (const candidate of envelope.data.chapters) {
    const id = typeof candidate === "object" && candidate !== null && "outlineChapterId" in candidate && typeof candidate.outlineChapterId === "string"
      ? candidate.outlineChapterId
      : null;
    if (id) returnedIds.push(id);
    const parsed = generatedChapterTemplateSchema.safeParse(candidate);
    if (parsed.success) parsedById.set(parsed.data.outlineChapterId, parsed.data);
    else if (id) parseErrorsById.set(id, "章节模板结构无效");
  }

  const expectedIds = requirements.map((requirement) => requirement.outlineChapterId);
  return {
    envelopeValid: true,
    chapterSetValid: sameSet(returnedIds, expectedIds) && new Set(returnedIds).size === returnedIds.length,
    chapters: requirements.map((requirement) => {
      const chapter = parsedById.get(requirement.outlineChapterId);
      return chapter
        ? { outlineChapterId: requirement.outlineChapterId, result: compileChapterTemplate(chapter, requirement), parseError: null }
        : { outlineChapterId: requirement.outlineChapterId, result: null, parseError: parseErrorsById.get(requirement.outlineChapterId) ?? "章节缺失" };
    }),
  };
}
