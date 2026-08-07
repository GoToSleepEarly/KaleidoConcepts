import type { EnglishLevel, PracticeConfig } from "@/lib/contracts/api";

const WORD_BUDGETS: Record<"basic" | "intermediate" | "advanced", Record<30 | 45 | 60, number>> = {
  basic: { 30: 200, 45: 300, 60: 400 },
  intermediate: { 30: 240, 45: 360, 60: 480 },
  advanced: { 30: 280, 45: 420, 60: 560 },
};

export function courseWordBudget(level: EnglishLevel, duration: 30 | 45 | 60) {
  const band = level === "A1" || level === "A2" ? "basic" : level === "B1" || level === "B2" ? "intermediate" : "advanced";
  return WORD_BUDGETS[band][duration];
}

export function recommendedChapterWordCount(level: EnglishLevel, duration: 30 | 45 | 60, chapterCount: number) {
  return Math.round(courseWordBudget(level, duration) / Math.max(1, chapterCount) / 10) * 10;
}

export function defaultPracticeConfig(enabled = true): PracticeConfig {
  return { enabled, countsByType: { choice: 5, blank: 5, vocab: 0, matching: 0 } };
}
