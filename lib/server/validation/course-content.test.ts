import { describe, expect, test } from "vitest";

import { generatedExercisesSchema, generatedQuestionSchema, generatedReadingBundleSchema, parseAiJson } from "@/lib/server/validation/course-content";

describe("course content AI schema", () => {
  test("requires chapters and Main Idea in the same initial response", () => {
    const chapters = [{ outlineChapterId: "ch1", title: "One", paragraphs: [{ parts: [{ type: "text", text: "Story." }] }] }];
    expect(generatedReadingBundleSchema.safeParse({ chapters, mainIdea: { title: "Main Idea", text: "Summary." } }).success).toBe(true);
    expect(generatedReadingBundleSchema.safeParse({ chapters }).success).toBe(false);
  });

  test("enforces a distinct required output contract for each grammar exercise type", () => {
    const optionQuestion = { type: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", distractors: ["goes", "going"] };
    const wordFormQuestion = { type: "wordForm", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", baseForm: "go" };

    expect(generatedQuestionSchema.safeParse(optionQuestion).success).toBe(true);
    expect(generatedQuestionSchema.safeParse(wordFormQuestion).success).toBe(true);
    expect(generatedQuestionSchema.safeParse({ ...optionQuestion, distractors: ["went", "going"] }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...optionQuestion, distractors: ["going", "going"] }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...wordFormQuestion, baseForm: undefined }).success).toBe(false);
  });

  test("normalizes common legacy option output without spending an AI repair call", () => {
    const parsed = generatedQuestionSchema.parse({
      type: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", options: ["going", "went", "goes"],
    });

    expect(parsed).toEqual({ type: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", distractors: ["going", "goes"] });
  });

  test("normalizes safe exercise aliases and removes extra metadata locally", () => {
    const parsed = generatedExercisesSchema.parse({
      chapters: [{ outlineChapterId: "ch1", title: "extra", exercises: [
        { exerciseType: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: ".", answer: "went", distractors: ["went", "goes", "going"], explanation: "extra" },
        { exerciseType: "wordForm", knowledgePointKey: "KP1", before: "Mia ", after: ".", answer: "went", baseWord: "(go)", options: [] },
      ] }],
      homework: [],
      explanation: "extra",
    });

    expect(parsed).toEqual({
      chapters: [{ outlineChapterId: "ch1", questions: [
        { type: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: ".", answer: "went", distractors: ["goes", "going"] },
        { type: "wordForm", knowledgePointKey: "KP1", before: "Mia ", after: ".", answer: "went", baseForm: "go" },
      ] }],
      homeworkGrammar: [],
    });
  });

  test("extracts one complete JSON object from harmless surrounding prose locally", () => {
    const text = 'Here is the result:\n{"chapters":[],"homeworkGrammar":[]}\nDone.';
    expect(parseAiJson(text, generatedExercisesSchema, "failed")).toEqual({ chapters: [], homeworkGrammar: [] });
  });
});
