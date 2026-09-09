import { describe, expect, test } from "vitest";

import { readingCandidateEnvelopeSchema } from "@/lib/server/ai/course-content-template";
import { AiJsonResponseError, generatedExercisesSchema, generatedQuestionSchema, generatedReadingBundleSchema, parseAiJson } from "@/lib/server/validation/course-content";

describe("course content AI schema", () => {
  test("requires chapters and Main Idea in the same initial response while discarding redundant generated titles", () => {
    const chapters = [{ outlineChapterId: "ch1", title: "One", paragraphs: [{ parts: [{ type: "text", text: "Story." }] }] }];
    expect(generatedReadingBundleSchema.parse({ chapters, mainIdea: { title: "Main Idea", text: "Summary." } })).toEqual({
      chapters: [{ outlineChapterId: "ch1", paragraphs: [{ parts: [{ type: "text", text: "Story." }] }] }],
      mainIdea: { text: "Summary." },
    });
    expect(generatedReadingBundleSchema.safeParse({ chapters }).success).toBe(false);
  });

  test("drops empty text separators without weakening required semantic fields", () => {
    const result = generatedReadingBundleSchema.parse({
      chapters: [{ outlineChapterId: "ch1", paragraphs: [{ parts: [
        { type: "text", text: "" },
        { type: "text", text: "Mia " },
        { type: "grammar", exerciseType: "wordForm", knowledgePointKey: "KP1", answer: "went", baseForm: "go" },
        { type: "text", text: " home." },
      ] }] }],
      mainIdea: { text: "Mia went home." },
    });

    expect(result.chapters[0]?.paragraphs[0]?.parts).toEqual([
      { type: "text", text: "Mia " },
      { type: "grammar", exerciseType: "wordForm", knowledgePointKey: "KP1", answer: "went", baseForm: "go" },
      { type: "text", text: " home." },
    ]);
    expect(generatedReadingBundleSchema.safeParse({
      chapters: [{ outlineChapterId: "ch1", paragraphs: [{ parts: [{ type: "grammar", exerciseType: "wordForm", knowledgePointKey: "", answer: "went", baseForm: "go" }] }] }],
      mainIdea: { text: "Mia went home." },
    }).success).toBe(false);
  });

  test("enforces a distinct required output contract for each grammar exercise type", () => {
    const optionQuestion = { type: "optionCloze", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", distractors: ["goes", "going"] };
    const wordFormQuestion = { type: "wordForm", knowledgePointKey: "KP1", before: "Mia ", after: " home.", answer: "went", baseForm: "go" };

    expect(generatedQuestionSchema.safeParse(optionQuestion).success).toBe(true);
    expect(generatedQuestionSchema.safeParse(wordFormQuestion).success).toBe(true);
    expect(generatedQuestionSchema.safeParse({ ...optionQuestion, distractors: ["went", "going"] }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...optionQuestion, distractors: ["going", "going"] }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...wordFormQuestion, baseForm: undefined }).success).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...wordFormQuestion, answer: "go", baseForm: "go" }).success).toBe(true);
  });

  test("normalizes common alternate option output without spending an AI repair call", () => {
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

  test("removes an unequivocally unmatched closing bracket outside JSON strings", () => {
    const text = '我正在逐章检查，最终只返回 JSON。\n{"chapters":[],"homeworkGrammar":[]]}';

    expect(parseAiJson(text, generatedExercisesSchema, "failed")).toEqual({ chapters: [], homeworkGrammar: [] });
  });

  test("preserves actionable schema paths and a bounded raw response when AI JSON has the wrong shape", () => {
    const raw = JSON.stringify({ candidateVersion: "wrong", chapters: [{ outlineChapterId: "chapter-1" }], mainIdea: { text: "" } });

    try {
      parseAiJson(raw, readingCandidateEnvelopeSchema, "正文候选结构无效");
      throw new Error("expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AiJsonResponseError);
      expect((error as AiJsonResponseError).diagnostics).toMatchObject({
        failureType: "schema_mismatch",
        rawResponsePreview: raw,
        rawResponseLength: raw.length,
        rawResponseTruncated: false,
      });
      expect((error as AiJsonResponseError).diagnostics.schemaIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "candidateVersion" }),
        expect.objectContaining({ path: "chapters.0.paragraphs" }),
        expect.objectContaining({ path: "mainIdea.text" }),
      ]));
    }
  });

  test("keeps both ends of an oversized invalid response for truncation diagnosis", () => {
    const raw = `response-start-${"x".repeat(21_000)}-response-end`;

    try {
      parseAiJson(raw, generatedExercisesSchema, "练习结构解析失败");
      throw new Error("expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AiJsonResponseError);
      const diagnostics = (error as AiJsonResponseError).diagnostics;
      expect(diagnostics.rawResponseTruncated).toBe(true);
      expect(diagnostics.rawResponsePreview.length).toBeLessThanOrEqual(20_000);
      expect(diagnostics.rawResponsePreview).toContain("response-start");
      expect(diagnostics.rawResponsePreview).toContain("response-end");
      expect(diagnostics.rawResponsePreview).toContain("响应日志中间已省略");
    }
  });
});
