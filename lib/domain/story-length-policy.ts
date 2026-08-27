import type { EnglishLevel, StoryComplexity } from "@/lib/contracts/api";

type ChineseLengthLimit = {
  recommendedMax: number;
  hardMax: number;
};

export type StoryLengthPolicy = {
  englishLevel: EnglishLevel;
  storyComplexity: StoryComplexity;
  chinese: {
    directionOverview: ChineseLengthLimit;
    outlineSummary: ChineseLengthLimit;
    chapterOverview: ChineseLengthLimit;
  };
  english: {
    chapterTargetWords: number;
    generationRange: [number, number];
    teacherRecommendedRange: [number, number];
    hardRange: [number, number];
  };
};

const TARGET_WORDS: Record<EnglishLevel, Record<StoryComplexity, number>> = {
  Starter: { clear_linear: 80, conflict_driven: 100, layered: 120 },
  A1: { clear_linear: 100, conflict_driven: 120, layered: 140 },
  A2: { clear_linear: 120, conflict_driven: 140, layered: 160 },
  B1: { clear_linear: 140, conflict_driven: 170, layered: 200 },
  B2: { clear_linear: 160, conflict_driven: 190, layered: 220 },
  C1: { clear_linear: 180, conflict_driven: 210, layered: 240 },
  C2: { clear_linear: 200, conflict_driven: 230, layered: 260 },
};

const CHINESE_LIMITS: Record<StoryComplexity, StoryLengthPolicy["chinese"]> = {
  clear_linear: {
    directionOverview: { recommendedMax: 80, hardMax: 120 },
    outlineSummary: { recommendedMax: 110, hardMax: 160 },
    chapterOverview: { recommendedMax: 65, hardMax: 100 },
  },
  conflict_driven: {
    directionOverview: { recommendedMax: 95, hardMax: 140 },
    outlineSummary: { recommendedMax: 130, hardMax: 190 },
    chapterOverview: { recommendedMax: 80, hardMax: 120 },
  },
  layered: {
    directionOverview: { recommendedMax: 110, hardMax: 160 },
    outlineSummary: { recommendedMax: 150, hardMax: 220 },
    chapterOverview: { recommendedMax: 95, hardMax: 140 },
  },
};

export const STORY_CHAPTER_WORD_HARD_RANGE = [60, 360] as const;

function roundRatioToTen(value: number, percentage: number) {
  return Math.round((value * percentage) / 1_000) * 10;
}

export function englishWordRangesForTarget(targetWordCount: number) {
  if (!Number.isInteger(targetWordCount) || targetWordCount < 1) throw new RangeError("英文目标词数必须是正整数");
  const generationRange: [number, number] = [
    Math.max(1, roundRatioToTen(targetWordCount, 88)),
    Math.max(1, roundRatioToTen(targetWordCount, 115)),
  ];
  const aimRange: [number, number] = [
    Math.max(generationRange[0], Math.round(targetWordCount * 0.92)),
    targetWordCount,
  ];
  return { generationRange, aimRange };
}

export function chineseTextLength(value: string) {
  return Array.from(value.replace(/\s/gu, "")).length;
}

export function normalizeEnglishLevel(level: EnglishLevel | null | undefined): EnglishLevel {
  return level && level in TARGET_WORDS ? level : "A2";
}

export function defaultStoryComplexity(level: EnglishLevel | null | undefined): StoryComplexity {
  level = normalizeEnglishLevel(level);
  if (level === "Starter" || level === "A1" || level === "A2") return "clear_linear";
  if (level === "B1" || level === "B2") return "conflict_driven";
  return "layered";
}

export function storyLengthPolicy(
  englishLevel: EnglishLevel | null | undefined,
  storyComplexity?: StoryComplexity | null,
): StoryLengthPolicy {
  englishLevel = normalizeEnglishLevel(englishLevel);
  storyComplexity = storyComplexity ?? defaultStoryComplexity(englishLevel);
  const target = TARGET_WORDS[englishLevel][storyComplexity];
  const { generationRange } = englishWordRangesForTarget(target);
  return {
    englishLevel,
    storyComplexity,
    chinese: CHINESE_LIMITS[storyComplexity],
    english: {
      chapterTargetWords: target,
      generationRange,
      teacherRecommendedRange: [Math.max(STORY_CHAPTER_WORD_HARD_RANGE[0], target - 30), Math.min(STORY_CHAPTER_WORD_HARD_RANGE[1], target + 40)],
      hardRange: [...STORY_CHAPTER_WORD_HARD_RANGE],
    },
  };
}

export function validateTeacherChapterWordCount(
  wordCount: number,
  englishLevel: EnglishLevel,
  storyComplexity: StoryComplexity,
) {
  const { teacherRecommendedRange: recommendedRange, hardRange } = storyLengthPolicy(englishLevel, storyComplexity).english;
  const shared = { recommendedRange, hardRange };
  if (!Number.isInteger(wordCount) || wordCount < hardRange[0] || wordCount > hardRange[1]) return { status: "blocked" as const, ...shared };
  if (wordCount < recommendedRange[0]) return { status: "warning_low" as const, ...shared };
  if (wordCount > recommendedRange[1]) return { status: "warning_high" as const, ...shared };
  return { status: "ok" as const, ...shared };
}

export function storyComplexityLabel(complexity: StoryComplexity) {
  return {
    clear_linear: "精简·清晰线性",
    conflict_driven: "标准·冲突推进",
    layered: "丰富·多层叙事",
  }[complexity];
}
