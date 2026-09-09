import { describe, expect, it } from "vitest";

import {
  balancedPageSizes,
  defaultPracticeConfig,
  defaultReadingExerciseConfig,
  practicePageCount,
  readingPageCount,
  readingPageDensity,
  recommendedChapterWordCount,
  recommendedReadingPageCount,
} from "@/lib/domain/teaching-plan-policy";

describe("teaching plan policy", () => {
  it("reads recommendations from CEFR and story complexity without duration", () => {
    expect(recommendedChapterWordCount("A2", "clear_linear")).toBe(90);
    expect(recommendedChapterWordCount("B1", "conflict_driven")).toBe(130);
    expect(recommendedChapterWordCount("B2", "conflict_driven")).toBe(150);
    expect(recommendedChapterWordCount("C1", "layered")).toBe(180);
    expect(recommendedChapterWordCount("C2", "layered")).toBe(180);
  });

  it("starts grammar practice with both types and one total", () => {
    expect(defaultPracticeConfig()).toEqual({ enabled: true, grammar: { enabledTypes: ["optionCloze", "wordForm"], total: 10 } });
  });

  it("starts正文 with all types and independent grammar and vocabulary totals", () => {
    expect(defaultReadingExerciseConfig()).toEqual({ enabled: true, grammar: { enabledTypes: ["optionCloze", "wordForm"], total: 7 }, vocabulary: { enabledTypes: ["chineseHint"], total: 3 } });
  });

  it("recommends正文 pages from CEFR reading density", () => {
    expect(readingPageDensity("A2")).toEqual({ min: 45, ideal: 60, max: 70 });
    expect(recommendedReadingPageCount("A2", 90)).toBe(2);
    expect(recommendedReadingPageCount("B2", 180)).toBe(2);
    expect(recommendedReadingPageCount("C1", 200)).toBe(2);
  });

  it("preserves an explicit one-to-three page choice", () => {
    expect(readingPageCount(90, 1)).toBe(1);
    expect(readingPageCount(100, 2)).toBe(2);
    expect(readingPageCount(180, 3)).toBe(3);
  });

  it("balances practice pages without creating a one-item tail", () => {
    expect(balancedPageSizes(6)).toEqual([3, 3]);
    expect(balancedPageSizes(9)).toEqual([5, 4]);
    expect(balancedPageSizes(11)).toEqual([4, 4, 3]);
    expect(practicePageCount({ enabledTypes: ["optionCloze", "wordForm"], total: 15 })).toBe(3);
  });
});
