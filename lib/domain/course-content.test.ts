import { describe, expect, test } from "vitest";

import {
  balancedPageSizes,
  buildCleanParagraphText,
  buildInteractiveParagraphText,
  collectVocabularyMatching,
  englishWordCount,
  vocabularyExerciseHint,
  validateGrammarCoverage,
  validateParagraphParts,
  stableShuffle,
} from "@/lib/domain/course-content";
import type { CourseContentChapter, CourseContentParagraph, CourseGrammarQuestion } from "@/lib/contracts/api";

const paragraph: CourseContentParagraph = {
  id: "p1",
  parts: [
    { type: "text", text: "Yesterday, Mia " },
    { type: "grammar", id: "g1", exerciseType: "wordForm", knowledgePointId: "kp1", answer: "found", baseForm: "find" },
    { type: "text", text: " the hidden door and decided to " },
    { type: "vocabulary", id: "v1", answer: "look after", canonicalForm: "look after", meaningZh: "照顾" },
    { type: "text", text: " the fox." },
  ],
};

describe("course content domain", () => {
  test("counts standard hyphenated compounds as one English word", () => {
    expect(englishWordCount("The star-map lesson wasn't ready.")).toBe(5);
  });

  test("compiles the same parts into clean and interactive reading", () => {
    expect(buildCleanParagraphText(paragraph)).toBe("Yesterday, Mia found the hidden door and decided to look after the fox.");
    expect(buildInteractiveParagraphText(paragraph)).toBe("Yesterday, Mia ______ (find) the hidden door and decided to ____ ____ (照顾，4+5个字母) the fox.");
  });

  test("rejects malformed choice and vocabulary anchors", () => {
    expect(validateParagraphParts({ ...paragraph, parts: [{ type: "grammar", id: "g", exerciseType: "optionCloze", knowledgePointId: "kp1", answer: "found", options: ["found", "lost"] }] })).toContain("选项填空必须包含 3 个不重复选项");
    expect(validateParagraphParts({ ...paragraph, parts: [{ type: "vocabulary", id: "v", answer: "look-after", canonicalForm: "look-after", meaningZh: "照顾" }] })).toContain("词汇答案暂不支持连字符或缩写");
  });

  test("allows a word-form answer to stay in its base form when the sentence requires it", () => {
    expect(validateParagraphParts({ ...paragraph, parts: [{ type: "grammar", id: "g", exerciseType: "wordForm", knowledgePointId: "infinitive", answer: "look", baseForm: "look" }] })).toEqual([]);
    expect(validateParagraphParts({ ...paragraph, parts: [{ type: "grammar", id: "g", exerciseType: "wordForm", knowledgePointId: "modal", answer: "should look", baseForm: "look" }] })).toEqual([]);
  });

  test("formats vocabulary blanks from the actual answer", () => {
    expect(vocabularyExerciseHint("hidden door", "隐藏的门")).toBe("隐藏的门，6+4个字母");
  });

  test("repairs missing spaces at structured part boundaries without spacing punctuation", () => {
    const compact = { ...paragraph, parts: [{ type: "text" as const, text: "Summer" }, { type: "grammar" as const, id: "g", exerciseType: "wordForm" as const, knowledgePointId: "past", answer: "found", baseForm: "find" }, { type: "text" as const, text: "a clue." }] };
    expect(buildCleanParagraphText(compact)).toBe("Summer found a clue.");
    expect(buildInteractiveParagraphText(compact)).toBe("Summer ______ (find) a clue.");
  });

  test("requires every grammar knowledge point to be covered independently", () => {
    const questions: CourseGrammarQuestion[] = [{ id: "q1", type: "wordForm", knowledgePointId: "kp1", before: "Mia ", after: " home.", answer: "went", baseForm: "go" }];
    expect(validateGrammarCoverage(["kp1", "kp2"], questions)).toEqual(["kp2"]);
  });

  test("deduplicates chapter vocabulary for homework matching", () => {
    const chapter = { id: "c1", outlineChapterId: "o1", order: 1, title: "One", targetWordCount: 90, readingExerciseMode: "interactive", paragraphs: [paragraph, { ...paragraph, id: "p2" }], chapterPractice: [], validationIssues: [] } satisfies CourseContentChapter;
    expect(collectVocabularyMatching([chapter])).toEqual([{ id: "v1", canonicalForm: "look after", meaningZh: "照顾" }]);
  });

  test("balances pages without exceeding five items", () => {
    expect(balancedPageSizes(6)).toEqual([3, 3]);
    expect(balancedPageSizes(9)).toEqual([5, 4]);
    expect(balancedPageSizes(11)).toEqual([4, 4, 3]);
  });

  test("shuffles options deterministically for persisted rendering", () => {
    expect(stableShuffle(["found", "lost", "painted"], "q1")).toEqual(stableShuffle(["found", "lost", "painted"], "q1"));
    expect(stableShuffle(["found", "lost", "painted"], "q1")).toHaveLength(3);
  });
});
