import type { EnglishLevel, GrammarExerciseCounts, GrammarPracticeConfig, ReadingExerciseConfig, StoryComplexity } from "@/lib/contracts/api";
import { STORY_CHAPTER_WORD_HARD_RANGE, storyLengthPolicy } from "@/lib/domain/story-length-policy";

export const MIN_CHAPTER_TARGET_WORD_COUNT = STORY_CHAPTER_WORD_HARD_RANGE[0];
export const MAX_CHAPTER_TARGET_WORD_COUNT = STORY_CHAPTER_WORD_HARD_RANGE[1];

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

export function minimumReadingParagraphCount(targetWordCount: number, config: ReadingExerciseConfig) {
  const wordPages = targetWordCount <= 90 ? 1 : targetWordCount <= 150 ? 2 : targetWordCount <= 200 ? 3 : targetWordCount <= 260 ? 4 : targetWordCount <= 320 ? 5 : 6;
  return Math.max(wordPages, Math.ceil(readingExerciseTotal(config) / 5));
}

export function readingPageCount(targetWordCount: number, config: ReadingExerciseConfig, paragraphCount?: number) {
  return Math.max(minimumReadingParagraphCount(targetWordCount, config), paragraphCount ?? 0);
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
