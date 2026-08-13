import { describe, expect, it } from "vitest";

import {
  balancedPageSizes,
  courseWordBudget,
  defaultPracticeConfig,
  defaultReadingExerciseConfig,
  practicePageCount,
  readingPageCount,
  recommendedChapterWordCount,
} from "@/lib/domain/teaching-plan-policy";

describe("teaching plan policy", () => {
  it("uses stable word budgets from difficulty and duration", () => {
    expect(courseWordBudget("Starter", 60)).toBe(320);
    expect(courseWordBudget("A2", 30)).toBe(200);
    expect(courseWordBudget("B1", 45)).toBe(360);
    expect(courseWordBudget("C2", 60)).toBe(560);
  });

  it("splits the course budget evenly and rounds to the nearest ten", () => {
    expect(recommendedChapterWordCount("A2", 30, 3)).toBe(70);
    expect(recommendedChapterWordCount("B1", 45, 4)).toBe(90);
    expect(recommendedChapterWordCount("C1", 60, 5)).toBe(110);
  });

  it("starts grammar practice with five option cloze and five word-form questions", () => {
    expect(defaultPracticeConfig()).toEqual({ enabled: true, grammar: { optionCloze: 5, wordForm: 5 } });
  });

  it("starts正文 with four choice, three transformation, and three vocabulary questions", () => {
    expect(defaultReadingExerciseConfig()).toEqual({ enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } });
  });

  it("derives transparent正文 page counts from both words and exercise density", () => {
    expect(readingPageCount(90, defaultReadingExerciseConfig())).toBe(2);
    expect(readingPageCount(120, defaultReadingExerciseConfig())).toBe(2);
    expect(readingPageCount(180, defaultReadingExerciseConfig())).toBe(3);
    expect(readingPageCount(90, { enabled: true, grammar: { optionCloze: 2, wordForm: 1 }, vocabulary: { chineseHint: 2 } })).toBe(1);
  });

  it("balances practice pages without creating a one-item tail", () => {
    expect(balancedPageSizes(6)).toEqual([3, 3]);
    expect(balancedPageSizes(9)).toEqual([5, 4]);
    expect(balancedPageSizes(11)).toEqual([4, 4, 3]);
    expect(practicePageCount({ optionCloze: 6, wordForm: 9 })).toBe(4);
  });
});
