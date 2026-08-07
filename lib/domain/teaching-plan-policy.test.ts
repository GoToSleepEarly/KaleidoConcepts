import { describe, expect, it } from "vitest";

import { courseWordBudget, defaultPracticeConfig, recommendedChapterWordCount } from "@/lib/domain/teaching-plan-policy";

describe("teaching plan policy", () => {
  it("uses stable word budgets from difficulty and duration", () => {
    expect(courseWordBudget("A2", 30)).toBe(200);
    expect(courseWordBudget("B1", 45)).toBe(360);
    expect(courseWordBudget("C2", 60)).toBe(560);
  });

  it("splits the course budget evenly and rounds to the nearest ten", () => {
    expect(recommendedChapterWordCount("A2", 30, 3)).toBe(70);
    expect(recommendedChapterWordCount("B1", 45, 4)).toBe(90);
    expect(recommendedChapterWordCount("C1", 60, 5)).toBe(110);
  });

  it("starts practice with five choice and five blank questions", () => {
    expect(defaultPracticeConfig()).toEqual({ enabled: true, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } });
  });
});
