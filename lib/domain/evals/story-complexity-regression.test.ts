import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { storyLengthPolicy } from "@/lib/domain/story-length-policy";
import {
  historicalStoryRegressionLabels,
  storyComplexityRegressionCases,
} from "@/lib/domain/evals/story-complexity-regression.fixture";

function visibleLength(value: string) {
  return Array.from(value.replace(/\s/g, "")).length;
}

describe("story complexity regression fixture", () => {
  test("contains every historical case and at least twelve constructed cases", () => {
    const historical = storyComplexityRegressionCases.filter((item) => item.origin === "historical");
    const constructed = storyComplexityRegressionCases.filter((item) => item.origin === "constructed");

    expect(historical.map((item) => item.label).sort()).toEqual([...historicalStoryRegressionLabels].sort());
    expect(constructed).toHaveLength(13);
    expect(new Set(storyComplexityRegressionCases.map((item) => item.id)).size).toBe(storyComplexityRegressionCases.length);
  });

  test("covers all content modes, requested CEFR bands, complexity levels, people patterns, and chapter edges", () => {
    const values = <K extends "contentMode" | "englishLevel" | "storyComplexity" | "participantPattern">(key: K) =>
      new Set(storyComplexityRegressionCases.map((item) => item[key]));

    expect(values("contentMode")).toEqual(new Set(["narrative", "concept", "factual", "faithful"]));
    expect(values("englishLevel")).toEqual(new Set(["Starter", "A1", "A2", "B1", "B2", "C1"]));
    expect(values("storyComplexity")).toEqual(new Set(["clear_linear", "conflict_driven", "layered"]));
    expect(values("participantPattern")).toEqual(new Set(["single", "ensemble", "eight_students"]));
    expect(storyComplexityRegressionCases.some((item) => item.chapterCount === 1)).toBe(true);
    expect(storyComplexityRegressionCases.some((item) => item.chapterCount === 8)).toBe(true);

    const tags = new Set(storyComplexityRegressionCases.flatMap((item) => item.tags));
    for (const requiredTag of ["gravity", "photosynthesis", "emotion_regulation", "peer_conflict", "failure_recovery", "self_efficacy", "information_heavy", "event_light", "many_events", "simple_mainline", "abstract_emotion", "real_history", "multi_perspective", "each_contributes"]) {
      expect(tags.has(requiredTag), `missing tag ${requiredTag}`).toBe(true);
    }
  });

  test("keeps named hard requirements visible in the auditable samples", () => {
    for (const item of storyComplexityRegressionCases) {
      const sampleText = [item.label, ...Object.values(item.sample).filter((value): value is string => typeof value === "string")].join("\n");
      for (const requirement of item.hardRequirements) {
        expect(sampleText, `${item.id} lost ${requirement}`).toContain(requirement);
      }
    }
  });

  test("keeps Chinese samples below hard caps without imposing a minimum", () => {
    for (const item of storyComplexityRegressionCases) {
      const policy = storyLengthPolicy(item.englishLevel, item.storyComplexity);
      expect(visibleLength(item.sample.hook), `${item.id} hook`).toBeLessThanOrEqual(policy.chinese.directionOverview.hardMax);
      expect(visibleLength(item.sample.summary), `${item.id} summary`).toBeLessThanOrEqual(policy.chinese.outlineSummary.hardMax);
      expect(visibleLength(item.sample.chapterWhatHappens), `${item.id} chapter`).toBeLessThanOrEqual(policy.chinese.chapterOverview.hardMax);
    }
  });

  test("uses the same per-chapter English capacity for one and eight chapters", () => {
    for (const item of storyComplexityRegressionCases) {
      const policy = storyLengthPolicy(item.englishLevel, item.storyComplexity);
      expect(item.sample.estimatedEnglishWordsPerChapter, item.id).toBeGreaterThanOrEqual(policy.english.generationRange[0] - 20);
      expect(item.sample.estimatedEnglishWordsPerChapter, item.id).toBeLessThanOrEqual(policy.english.generationRange[1]);
    }
    expect(storyLengthPolicy("B1", "conflict_driven").english.chapterTargetWords).toBe(170);
  });

  test("records a separate task-local semantic review for every auditable sample", () => {
    for (const item of storyComplexityRegressionCases) {
      expect(item.semanticReview.reviewedBy).toBe("codex_task_semantic_review_2026-08-27");
      expect(Object.values(item.semanticReview).filter((value) => typeof value === "boolean").every(Boolean), item.id).toBe(true);
      expect(item.semanticReview.note.length, item.id).toBeGreaterThan(12);
    }
  });

  test("demonstrates increasing structure without treating a level as a mandatory twist quota", () => {
    const trio = ["n-gravity-one", "n-gravity-conflict", "n-gravity-layered"].map((id) =>
      storyComplexityRegressionCases.find((item) => item.id === id)!,
    );
    expect(trio.map((item) => item.storyComplexity)).toEqual(["clear_linear", "conflict_driven", "layered"]);
    expect(trio[0].sample.summary).toContain("落到地面");
    expect(trio[1].sample.summary).toContain("结果与预测不符");
    expect(trio[2].sample.summary).toContain("回收早先忽略的数据");
    expect(trio.every((item) => item.semanticReview.noMechanicalTwist)).toBe(true);
  });

  test("keeps historical fixture names out of production story prompts", () => {
    const promptSources = [
      "lib/server/ai/story-outline-deps.ts",
      "lib/server/ai/course-content-deps.ts",
      "lib/server/ai/course-content-template.ts",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

    for (const label of historicalStoryRegressionLabels) {
      expect(promptSources, label).not.toContain(label);
    }
  });
});
