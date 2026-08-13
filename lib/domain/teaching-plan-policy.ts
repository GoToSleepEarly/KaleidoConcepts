import type { EnglishLevel, GrammarExerciseCounts, GrammarPracticeConfig, ReadingExerciseConfig } from "@/lib/contracts/api";

const WORD_BUDGETS: Record<"starter" | "basic" | "intermediate" | "advanced", Record<30 | 45 | 60, number>> = {
  starter: { 30: 160, 45: 240, 60: 320 },
  basic: { 30: 200, 45: 300, 60: 400 },
  intermediate: { 30: 240, 45: 360, 60: 480 },
  advanced: { 30: 280, 45: 420, 60: 560 },
};

export function courseWordBudget(level: EnglishLevel, duration: 30 | 45 | 60) {
  const band = level === "Starter" ? "starter" : level === "A1" || level === "A2" ? "basic" : level === "B1" || level === "B2" ? "intermediate" : "advanced";
  return WORD_BUDGETS[band][duration];
}

export function recommendedChapterWordCount(level: EnglishLevel, duration: 30 | 45 | 60, chapterCount: number) {
  return Math.round(courseWordBudget(level, duration) / Math.max(1, chapterCount) / 10) * 10;
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
  const wordPages = targetWordCount <= 90 ? 1 : targetWordCount <= 150 ? 2 : 3;
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
