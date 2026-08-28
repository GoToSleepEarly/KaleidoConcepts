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
    validationRange: [number, number];
    teacherRecommendedRange: [number, number];
    hardRange: [number, number];
  };
};

const TARGET_WORDS: Record<EnglishLevel, Record<StoryComplexity, number>> = {
  Starter: { clear_linear: 70, conflict_driven: 80, layered: 90 },
  A1: { clear_linear: 80, conflict_driven: 90, layered: 100 },
  A2: { clear_linear: 90, conflict_driven: 110, layered: 120 },
  B1: { clear_linear: 110, conflict_driven: 130, layered: 140 },
  B2: { clear_linear: 130, conflict_driven: 150, layered: 170 },
  C1: { clear_linear: 140, conflict_driven: 160, layered: 180 },
  C2: { clear_linear: 150, conflict_driven: 170, layered: 180 },
};

export const STORY_CHAPTER_WORD_HARD_RANGE = [60, 180] as const;
export const STORY_GENERATED_WORD_ABSOLUTE_RANGE = [50, 210] as const;

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

export function englishWordRangesForTarget(targetWordCount: number) {
  if (!Number.isInteger(targetWordCount) || targetWordCount < 1) throw new RangeError("英文目标词数必须是正整数");
  const generationRange: [number, number] = [
    Math.max(1, Math.min(roundToFive(targetWordCount * 0.9), targetWordCount - 10)),
    Math.max(1, Math.max(roundToFive(targetWordCount * 1.1), targetWordCount + 10)),
  ];
  const validationRange: [number, number] = [
    Math.max(STORY_GENERATED_WORD_ABSOLUTE_RANGE[0], roundToFive(targetWordCount * 0.85)),
    Math.min(STORY_GENERATED_WORD_ABSOLUTE_RANGE[1], roundToFive(targetWordCount * 1.2)),
  ];
  return { generationRange, validationRange, aimRange: generationRange };
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

export function normalizeStoryChapterCount(chapterCount: number) {
  if (!Number.isFinite(chapterCount)) return 4;
  return Math.max(3, Math.min(5, Math.round(chapterCount)));
}

export function storyLengthPolicy(
  englishLevel: EnglishLevel | null | undefined,
  storyComplexity?: StoryComplexity | null,
  chapterCount = 4,
): StoryLengthPolicy {
  englishLevel = normalizeEnglishLevel(englishLevel);
  storyComplexity = storyComplexity ?? defaultStoryComplexity(englishLevel);
  const target = TARGET_WORDS[englishLevel][storyComplexity];
  const { generationRange, validationRange } = englishWordRangesForTarget(target);
  const normalizedChapterCount = normalizeStoryChapterCount(chapterCount);
  const chapterOverview = target <= 90
    ? { recommendedMax: 35, hardMax: 45 }
    : target <= 130
      ? { recommendedMax: 45, hardMax: 55 }
      : target <= 160
        ? { recommendedMax: 55, hardMax: 70 }
        : { recommendedMax: 60, hardMax: 80 };
  return {
    englishLevel,
    storyComplexity,
    chinese: {
      directionOverview: { recommendedMax: 70, hardMax: 90 },
      outlineSummary: {
        recommendedMax: 70 + (normalizedChapterCount - 3) * 10,
        hardMax: 95 + (normalizedChapterCount - 3) * 10,
      },
      chapterOverview,
    },
    english: {
      chapterTargetWords: target,
      generationRange,
      validationRange,
      teacherRecommendedRange: [Math.max(STORY_CHAPTER_WORD_HARD_RANGE[0], target - 20), Math.min(STORY_CHAPTER_WORD_HARD_RANGE[1], target + 20)],
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
