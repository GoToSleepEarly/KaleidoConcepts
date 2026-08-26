import { describe, expect, test, vi } from "vitest";

import { resolveGrammarKnowledgePoints } from "./grammar-context";

describe("grammar prompt context", () => {
  test("keeps selected order and includes authoritative source metadata", async () => {
    const points = await resolveGrammarKnowledgePoints({
      knowledgePoint: { findMany: async () => [
        { id: "kp-2", title: "Present perfect and past", section: { officialTitle: "Present perfect and past" }, bookEdition: { title: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2" }, units: [{ unitNumber: 14, officialTitle: "Present perfect and past 2" }, { unitNumber: 13, officialTitle: "Present perfect and past 1" }] },
        { id: "kp-1", title: "Past simple", units: [{ unitNumber: 5, officialTitle: "Past simple" }] },
      ] },
    }, ["kp-1", "kp-2"]);

    expect(points.map((point) => point.id)).toEqual(["kp-1", "kp-2"]);
    expect(points[1]).toMatchObject({ bookTitle: "English Grammar in Use", edition: "5th Edition", officialLevel: "B1–B2", unitStart: 13, unitEnd: 14 });
  });

  test("uses the original preset metadata for migrated legacy knowledge points", async () => {
    const presetFindMany = vi.fn(async () => [
      { id: "legacy-1", label: "Present perfect", labelZh: "现在完成时", category: "时态" },
    ]);

    const points = await resolveGrammarKnowledgePoints({
      knowledgePoint: { findMany: async () => [
        { id: "legacy-1", title: "Present perfect", source: "legacy", units: [] },
      ] },
      presetOption: { findMany: presetFindMany },
    }, ["legacy-1"]);

    expect(points).toEqual([
      { id: "legacy-1", label: "Present perfect", labelZh: "现在完成时", category: "时态" },
    ]);
    expect(presetFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["legacy-1"] }, kind: "grammar" },
    });
  });

  test("keeps migrated legacy data as a fallback when its original preset is unavailable", async () => {
    const points = await resolveGrammarKnowledgePoints({
      knowledgePoint: { findMany: async () => [
        { id: "legacy-1", title: "Present perfect", source: "legacy", units: [] },
      ] },
      presetOption: { findMany: async () => [] },
    }, ["legacy-1"]);

    expect(points).toEqual([{ id: "legacy-1", label: "Present perfect", units: [] }]);
  });
});
