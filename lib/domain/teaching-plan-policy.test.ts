import { describe, expect, it } from "vitest";

import {
  balancedPageSizes,
  defaultPracticeConfig,
  defaultReadingExerciseConfig,
  practicePageCount,
  readingPageCount,
  recommendedChapterWordCount,
} from "@/lib/domain/teaching-plan-policy";

describe("teaching plan policy", () => {
  it("reads recommendations from CEFR and story complexity without duration", () => {
    expect(recommendedChapterWordCount("A2", "clear_linear")).toBe(90);
    expect(recommendedChapterWordCount("B1", "conflict_driven")).toBe(130);
    expect(recommendedChapterWordCount("B2", "conflict_driven")).toBe(150);
    expect(recommendedChapterWordCount("C1", "layered")).toBe(180);
    expect(recommendedChapterWordCount("C2", "layered")).toBe(180);
  });

  it("starts grammar practice with five option cloze and five word-form questions", () => {
    expect(defaultPracticeConfig()).toEqual({ enabled: true, grammar: { optionCloze: 5, wordForm: 5 } });
  });

  it("starts正文 with four choice, three transformation, and three vocabulary questions", () => {
    expect(defaultReadingExerciseConfig()).toEqual({ enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } });
  });

  it("derives at most two正文 paragraphs from words alone, never exercise density", () => {
    expect(readingPageCount(90, 1)).toBe(1);
    expect(readingPageCount(100, 2)).toBe(2);
    expect(readingPageCount(180, 2)).toBe(2);
  });

  it("balances practice pages without creating a one-item tail", () => {
    expect(balancedPageSizes(6)).toEqual([3, 3]);
    expect(balancedPageSizes(9)).toEqual([5, 4]);
    expect(balancedPageSizes(11)).toEqual([4, 4, 3]);
    expect(practicePageCount({ optionCloze: 6, wordForm: 9 })).toBe(4);
  });
});
