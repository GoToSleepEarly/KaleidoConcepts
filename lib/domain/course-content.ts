import type { CourseContentChapter, CourseContentParagraph, CourseContentPart, CourseGrammarQuestion, CourseVocabularyMatchingItem } from "@/lib/contracts/api";

function wordBlank(answer: string) {
  return answer.trim().split(/\s+/).map(() => "____").join(" ");
}

function letterPattern(answer: string) {
  return answer.trim().split(/\s+/).map((word) => word.length).join("+");
}

export function renderPart(part: CourseContentPart, interactive: boolean) {
  if (part.type === "text") return part.text;
  if (!interactive) return part.answer;
  if (part.type === "vocabulary") return `${wordBlank(part.answer)} (${part.meaningZh}，${letterPattern(part.answer)}个字母)`;
  if (part.exerciseType === "wordForm") return `______ (${part.baseForm ?? part.answer})`;
  return `______ (${(part.options ?? []).join(" / ")})`;
}

function needsBoundarySpace(left: string, right: string) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return false;
  return /[\p{L}\p{N})\]]$/u.test(left) && /^(?:[\p{L}\p{N}_]|[([])/u.test(right);
}

export function joinEnglishFragments(fragments: string[]) {
  return fragments.reduce((result, fragment) => `${result}${needsBoundarySpace(result, fragment) ? " " : ""}${fragment}`, "");
}

export function buildCleanParagraphText(paragraph: CourseContentParagraph) {
  return joinEnglishFragments(paragraph.parts.map((part) => renderPart(part, false)));
}

export function buildInteractiveParagraphText(paragraph: CourseContentParagraph) {
  return joinEnglishFragments(paragraph.parts.map((part) => renderPart(part, true)));
}

export function validateParagraphParts(paragraph: CourseContentParagraph) {
  const issues: string[] = [];
  for (const part of paragraph.parts) {
    if (part.type === "grammar" && part.exerciseType === "optionCloze") {
      const options = part.options ?? [];
      if (options.length !== 3 || new Set(options.map((option) => option.trim().toLowerCase())).size !== 3 || !options.includes(part.answer)) issues.push("选项填空必须包含 3 个不重复选项");
    }
    if (part.type === "grammar" && part.exerciseType === "wordForm") {
      if (!part.baseForm) issues.push("给词变形必须包含原形提示");
      else if (part.answer.trim().toLowerCase() === part.baseForm.trim().toLowerCase()) issues.push("给词变形必须发生真实词形变化");
      else if (/^(can|could|may|might|must|shall|should|will|would)\b/i.test(part.answer.trim())) issues.push("给词变形不能用情态动词代替词形变化");
    }
    if (part.type === "vocabulary" && /[-’']/.test(part.answer)) issues.push("词汇答案暂不支持连字符或缩写");
    if (part.type !== "text" && !part.answer.trim()) issues.push("题目答案不能为空");
  }
  return [...new Set(issues)];
}

export function wordFormQuestionIssue(question: CourseGrammarQuestion) {
  if (question.type !== "wordForm" || !question.baseForm) return null;
  if (question.answer.trim().toLowerCase() === question.baseForm.trim().toLowerCase()) return "给词变形必须发生真实词形变化";
  if (/^(can|could|may|might|must|shall|should|will|would)\b/i.test(question.answer.trim())) return "给词变形不能用情态动词代替词形变化";
  return null;
}

export function validateGrammarCoverage(knowledgePointIds: string[], questions: Array<CourseGrammarQuestion | Extract<CourseContentPart, { type: "grammar" }>>) {
  const covered = new Set(questions.map((question) => question.knowledgePointId));
  return [...new Set(knowledgePointIds)].filter((id) => !covered.has(id));
}

export function collectVocabularyMatching(chapters: CourseContentChapter[]): CourseVocabularyMatchingItem[] {
  const seen = new Set<string>();
  return chapters.flatMap((chapter) => chapter.paragraphs).flatMap((paragraph) => paragraph.parts).flatMap((part) => {
    if (part.type !== "vocabulary") return [];
    const key = `${part.canonicalForm.trim().toLowerCase()}\u0000${part.meaningZh.trim()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: part.id, canonicalForm: part.canonicalForm, meaningZh: part.meaningZh }];
  });
}

export function balancedPageSizes(total: number, maxPerPage = 5) {
  if (total <= 0) return [];
  const pages = Math.ceil(total / maxPerPage);
  const base = Math.floor(total / pages);
  const remainder = total % pages;
  return Array.from({ length: pages }, (_, index) => base + (index < remainder ? 1 : 0));
}

export const courseContentQuestionPageSize = 5;
export const courseContentVocabularyPageSize = 5;

export function paginateBalanced<T>(items: T[], maxPerPage = 5) {
  let offset = 0;
  return balancedPageSizes(items.length, maxPerPage).map((size) => {
    const page = items.slice(offset, offset + size);
    offset += size;
    return page;
  });
}

export function stableShuffle<T>(items: T[], seed: string) {
  const result = [...items];
  let state = [...seed].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
