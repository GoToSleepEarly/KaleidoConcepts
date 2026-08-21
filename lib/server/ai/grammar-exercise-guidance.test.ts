import presetData from "@/prisma/preset-data.json";
import { describe, expect, test } from "vitest";

import { grammarExerciseFamily, grammarExerciseGuidance, validateGrammarEvidence } from "./grammar-exercise-guidance";

describe("grammar exercise guidance", () => {
  test("classifies every active grammar preset without excluding any exercise type", () => {
    const grammarPoints = presetData.presetOptions.filter((preset) => preset.kind === "grammar" && !preset.archivedAt);

    expect(grammarPoints).toHaveLength(57);
    expect(grammarPoints.filter((point) => !grammarExerciseFamily(point.label))).toEqual([]);
    expect(grammarPoints.every((point) => Boolean(grammarExerciseGuidance(point.label)?.guidance))).toBe(true);
  });

  test("accepts modal and tense evidence when the construction is visible around the answer", () => {
    expect(validateGrammarEvidence("Must", "must stay together", "The students must stay together near the gate.")).toBeNull();
    expect(validateGrammarEvidence("Future with Will", "will open the door", "Tomorrow, Mia will open the door.")).toBeNull();
    expect(validateGrammarEvidence("Present Continuous", "is watching Mohong", "Summer is watching Mohong carefully.")).toBeNull();
  });

  test("rejects the semantic false positives observed in the paid experiment", () => {
    expect(validateGrammarEvidence("Future with Will", "Summer watched Mohong", "Summer watched Mohong closely.")).toContain("必要结构");
    expect(validateGrammarEvidence("Must", "Lanlan shouted loudly", "Lanlan shouted loudly.")).toContain("必要结构");
  });

  test("requires auditable local context even for points without a mechanical pattern", () => {
    expect(validateGrammarEvidence("Reason Clauses", "because the gate was closed", "They waited because the gate was closed.")).toBeNull();
    expect(validateGrammarEvidence("Reason Clauses", "because", "They waited because the gate was closed.")).toContain("至少包含两个词");
    expect(validateGrammarEvidence("Reason Clauses", "because it rained", "They left after lunch.")).toContain("逐字出现在");
    expect(validateGrammarEvidence("Must", "must leave now", "They must leave now, but Mia must stay here.", "stay")).toContain("实际答案");
  });
});
