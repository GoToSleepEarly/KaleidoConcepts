import { describe, expect, it } from "vitest";

import {
  defaultStoryComplexity,
  storyLengthPolicy,
  validateTeacherChapterWordCount,
} from "@/lib/domain/story-length-policy";

describe("story length policy", () => {
  it("uses an A2 clear-linear fallback for legacy records without an English level", () => {
    expect(storyLengthPolicy(undefined, undefined)).toMatchObject({
      englishLevel: "A2",
      storyComplexity: "clear_linear",
      english: { chapterTargetWords: 120 },
    });
  });

  it("maps CEFR to the confirmed default complexity without course duration", () => {
    expect(defaultStoryComplexity("Starter")).toBe("clear_linear");
    expect(defaultStoryComplexity("A2")).toBe("clear_linear");
    expect(defaultStoryComplexity("B1")).toBe("conflict_driven");
    expect(defaultStoryComplexity("B2")).toBe("conflict_driven");
    expect(defaultStoryComplexity("C1")).toBe("layered");
    expect(defaultStoryComplexity("C2")).toBe("layered");
  });

  it("calibrates one shared English target from CEFR and complexity", () => {
    expect(storyLengthPolicy("Starter", "clear_linear").english.chapterTargetWords).toBe(80);
    expect(storyLengthPolicy("A2", "clear_linear").english.chapterTargetWords).toBe(120);
    expect(storyLengthPolicy("B1", "conflict_driven").english.chapterTargetWords).toBe(170);
    expect(storyLengthPolicy("C1", "layered").english.chapterTargetWords).toBe(240);
    expect(storyLengthPolicy("C2", "layered").english.chapterTargetWords).toBe(260);
  });

  it("lets complexity raise capacity without forcing it to be used", () => {
    const clear = storyLengthPolicy("A2", "clear_linear");
    const layered = storyLengthPolicy("A2", "layered");
    expect(layered.english.chapterTargetWords).toBeGreaterThan(clear.english.chapterTargetWords);
    expect(layered.chinese.directionOverview.recommendedMax).toBeGreaterThan(clear.chinese.directionOverview.recommendedMax);
    expect(clear.chinese.directionOverview).not.toHaveProperty("minimum");
  });

  it("provides recommended, generation, teacher-adjustment, and hard boundaries", () => {
    const policy = storyLengthPolicy("B2", "conflict_driven");
    expect(policy.english).toMatchObject({
      chapterTargetWords: 190,
      generationRange: [170, 220],
      teacherRecommendedRange: [160, 230],
      hardRange: [60, 360],
    });
    expect(policy.chinese).toEqual({
      directionOverview: { recommendedMax: 95, hardMax: 140 },
      outlineSummary: { recommendedMax: 130, hardMax: 190 },
      chapterOverview: { recommendedMax: 80, hardMax: 120 },
    });
  });

  it("warns outside the recommended range and only blocks extreme values", () => {
    expect(validateTeacherChapterWordCount(159, "B2", "conflict_driven")).toEqual({ status: "warning_low", recommendedRange: [160, 230], hardRange: [60, 360] });
    expect(validateTeacherChapterWordCount(231, "B2", "conflict_driven")).toEqual({ status: "warning_high", recommendedRange: [160, 230], hardRange: [60, 360] });
    expect(validateTeacherChapterWordCount(190, "B2", "conflict_driven")).toEqual({ status: "ok", recommendedRange: [160, 230], hardRange: [60, 360] });
    expect(validateTeacherChapterWordCount(59, "B2", "conflict_driven").status).toBe("blocked");
    expect(validateTeacherChapterWordCount(361, "B2", "conflict_driven").status).toBe("blocked");
  });

  it("does not vary per-chapter capacity with chapter count", () => {
    const oneChapter = storyLengthPolicy("C1", "layered", { chapterCount: 1 });
    const eightChapters = storyLengthPolicy("C1", "layered", { chapterCount: 8 });
    expect(oneChapter.english).toEqual(eightChapters.english);
  });
});
