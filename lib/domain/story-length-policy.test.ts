import { describe, expect, it } from "vitest";

import {
  chineseDisplayLength,
  chineseValidationMax,
  defaultStoryComplexity,
  englishWordRangesForTarget,
  normalizeStoryChapterCount,
  storyLengthPolicy,
  validateTeacherChapterWordCount,
} from "@/lib/domain/story-length-policy";

describe("story length policy", () => {
  it("uses an A2 clear-linear fallback for legacy records without an English level", () => {
    expect(storyLengthPolicy(undefined, undefined)).toMatchObject({
      englishLevel: "A2",
      storyComplexity: "clear_linear",
      english: { chapterTargetWords: 90 },
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

  it("normalizes legacy chapter counts only when starting a new operation", () => {
    expect(normalizeStoryChapterCount(1)).toBe(3);
    expect(normalizeStoryChapterCount(4)).toBe(4);
    expect(normalizeStoryChapterCount(8)).toBe(5);
  });

  it("calibrates one shared English target from CEFR and complexity", () => {
    expect(storyLengthPolicy("Starter", "clear_linear").english.chapterTargetWords).toBe(70);
    expect(storyLengthPolicy("A2", "clear_linear").english.chapterTargetWords).toBe(90);
    expect(storyLengthPolicy("B1", "conflict_driven").english.chapterTargetWords).toBe(130);
    expect(storyLengthPolicy("B2", "conflict_driven").english.chapterTargetWords).toBe(150);
    expect(storyLengthPolicy("C1", "layered").english.chapterTargetWords).toBe(180);
    expect(storyLengthPolicy("C2", "layered").english.chapterTargetWords).toBe(180);
  });

  it("separates the AI expected range from the wider deterministic acceptance range", () => {
    for (const [level, complexity, target, generationRange, validationRange] of [
      ["Starter", "clear_linear", 70, [60, 80], [60, 85]],
      ["B2", "conflict_driven", 150, [135, 165], [130, 180]],
      ["C2", "layered", 180, [160, 200], [155, 210]],
    ] as const) {
      expect(storyLengthPolicy(level, complexity).english).toMatchObject({ chapterTargetWords: target, generationRange, validationRange });
      expect(englishWordRangesForTarget(target)).toMatchObject({ generationRange, validationRange });
    }
  });

  it("measures mixed Chinese copy by approximate display width", () => {
    expect(chineseDisplayLength("开端。\n 结果方向")).toBe(7);
    expect(chineseDisplayLength("冰桥 Ms. Lin")).toBe(5);
    expect(chineseDisplayLength("Ms. Lin核对港口方向，Summer和Dawn依次发出最后指令。冰桥抵达船队，引导船只安全回港。")).toBe(41);
    expect(chineseDisplayLength("听见前方港口钟声，Ms. Lin请孩子确认。两人决定直行，Anna引船跟随，Elsa将冰桥接上港口。")).toBe(42);
  });

  it("keeps a small deterministic validation margin outside the model generation target", () => {
    expect(chineseValidationMax(45)).toBe(51);
    expect(chineseValidationMax(90)).toBe(101);
    expect(chineseValidationMax(105)).toBe(118);
  });

  it("lets complexity raise capacity without exceeding the two-paragraph ceiling", () => {
    const clear = storyLengthPolicy("A2", "clear_linear");
    const layered = storyLengthPolicy("A2", "layered");
    expect(layered.english.chapterTargetWords).toBeGreaterThan(clear.english.chapterTargetWords);
    expect(layered.english.chapterTargetWords).toBeLessThanOrEqual(180);
    expect(clear.chinese.directionOverview).not.toHaveProperty("minimum");
  });

  it("derives Chinese capacity from the English target and the confirmed three-to-five chapter count", () => {
    const policy = storyLengthPolicy("B2", "conflict_driven", 5);
    expect(policy.english).toMatchObject({
      chapterTargetWords: 150,
      generationRange: [135, 165],
      validationRange: [130, 180],
      teacherRecommendedRange: [130, 170],
      hardRange: [60, 180],
    });
    expect(policy.chinese).toEqual({
      directionOverview: { recommendedMax: 70, hardMax: 90 },
      outlineSummary: { recommendedMax: 90, hardMax: 115 },
      chapterOverview: { recommendedMax: 55, hardMax: 70 },
    });
    expect(storyLengthPolicy("A2", "clear_linear", 3).chinese.outlineSummary).toEqual({ recommendedMax: 70, hardMax: 95 });
  });

  it("warns outside the recommended target range and blocks configuration above 180", () => {
    expect(validateTeacherChapterWordCount(129, "B2", "conflict_driven")).toEqual({ status: "warning_low", recommendedRange: [130, 170], hardRange: [60, 180] });
    expect(validateTeacherChapterWordCount(171, "B2", "conflict_driven")).toEqual({ status: "warning_high", recommendedRange: [130, 170], hardRange: [60, 180] });
    expect(validateTeacherChapterWordCount(150, "B2", "conflict_driven")).toEqual({ status: "ok", recommendedRange: [130, 170], hardRange: [60, 180] });
    expect(validateTeacherChapterWordCount(59, "B2", "conflict_driven").status).toBe("blocked");
    expect(validateTeacherChapterWordCount(181, "B2", "conflict_driven").status).toBe("blocked");
  });

});
