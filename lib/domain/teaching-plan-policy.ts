import type { EnglishLevel, GrammarExerciseCounts, GrammarPracticeConfig, ReadingExerciseConfig, StoryComplexity } from "@/lib/contracts/api";
import { STORY_CHAPTER_WORD_HARD_RANGE, storyLengthPolicy } from "@/lib/domain/story-length-policy";

export const MIN_CHAPTER_TARGET_WORD_COUNT = STORY_CHAPTER_WORD_HARD_RANGE[0];
export const MAX_CHAPTER_TARGET_WORD_COUNT = 200;
export const MIN_READING_PAGE_COUNT = 1;
export const MAX_READING_PAGE_COUNT = 3;

const READING_PAGE_DENSITY: Record<EnglishLevel, { min: number; ideal: number; max: number }> = {
  Starter: { min: 35, ideal: 45, max: 55 },
  A1: { min: 35, ideal: 45, max: 55 },
  A2: { min: 45, ideal: 60, max: 70 },
  B1: { min: 60, ideal: 75, max: 85 },
  B2: { min: 75, ideal: 90, max: 105 },
  C1: { min: 90, ideal: 105, max: 120 },
  C2: { min: 90, ideal: 105, max: 120 },
};

export function recommendedChapterWordCount(level: EnglishLevel, storyComplexity: StoryComplexity) {
  return storyLengthPolicy(level, storyComplexity).english.chapterTargetWords;
}

export function defaultPracticeConfig(enabled = true): GrammarPracticeConfig {
  return { enabled, grammar: { optionCloze: 5, wordForm: 5 } };
}

export function defaultReadingExerciseConfig(): ReadingExerciseConfig {
  return { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } };
}

export function readingExerciseTotal(config: ReadingExerciseConfig) {
  return config.grammar.optionCloze + config.grammar.wordForm + config.vocabulary.chineseHint;
}

export function grammarExerciseTotal(counts: GrammarExerciseCounts) {
  return counts.optionCloze + counts.wordForm;
}

export function readingPageDensity(level: EnglishLevel) {
  return READING_PAGE_DENSITY[level];
}

export function recommendedReadingPageCount(level: EnglishLevel, targetWordCount: number) {
  const recommended = Math.round(targetWordCount / readingPageDensity(level).ideal);
  return Math.min(MAX_READING_PAGE_COUNT, Math.max(MIN_READING_PAGE_COUNT, recommended));
}

export function readingPageCount(targetWordCount: number, paragraphCount?: number) {
  const fallback = targetWordCount <= 90 ? 1 : 2;
  const requested = Number.isInteger(paragraphCount) ? paragraphCount! : fallback;
  return Math.min(MAX_READING_PAGE_COUNT, Math.max(MIN_READING_PAGE_COUNT, requested));
}

export function balancedPageSizes(total: number, pageCapacity = 5) {
  if (total <= 0) return [];
  const pageCount = Math.ceil(total / pageCapacity);
  const base = Math.floor(total / pageCount);
  const remainder = total % pageCount;
  return Array.from({ length: pageCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function practicePageCount(counts: GrammarExerciseCounts) {
  return balancedPageSizes(counts.optionCloze).length + balancedPageSizes(counts.wordForm).length;
}
