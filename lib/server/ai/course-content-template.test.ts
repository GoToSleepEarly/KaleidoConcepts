import { describe, expect, test } from "vitest";

import {
  STEP4_CONTENT_CONTRACT_VERSION,
  applyChapterTemplateRepairs,
  buildReadingTemplatePrompt,
  compileChapterTemplate,
  parseReadingTemplatePayload,
  repairFullyResolvesChapter,
  requiredChapterSlotIds,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
} from "./course-content-template";

const requirements: ChapterTemplateRequirements = {
  outlineChapterId: "chapter-1",
  paragraphCount: 2,
  targetWordCount: 120,
  optionClozeCount: 1,
  wordFormCount: 1,
  vocabularyCount: 1,
  grammarPoints: [
    { key: "KP1", label: "Future with Will" },
    { key: "KP2", label: "Must" },
  ],
};

function validChapter(): GeneratedChapterTemplate {
  return {
    outlineChapterId: "chapter-1",
    paragraphs: [
      { template: "Tomorrow, Mia {{OC1}} open the old gate with her team. They check the map, carry the box, and wait beside the quiet wall until sunrise. Everyone knows the careful plan and stays calm. Before they move, Mia reads each note aloud, while her friends compare every symbol with the drawing on the wall." },
      { template: "The students must {{WF1}} together when the bell rings. They follow {{VOC1}}, protect the people nearby, and bring every missing sound back to the city before the final celebration begins. At the last corner, they hear a soft song, choose the safest path, and tell the waiting families that the danger has finally passed." },
    ],
    slots: [
      { id: "OC1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "will", distractors: ["did", "has"] },
      { id: "WF1", kind: "wordForm", knowledgePointKey: "KP2", answer: "stay", cue: "stay" },
      { id: "VOC1", kind: "vocabulary", answer: "a useful clue", canonicalForm: "useful clue", meaningZh: "有用的线索" },
    ],
  };
}

describe("Step4 fixed-slot production contract", () => {
  test("lets AI assign knowledge points while program closes exact typed slots", () => {
    const result = compileChapterTemplate(validChapter(), requirements);

    expect(requiredChapterSlotIds(requirements)).toEqual(["OC1", "WF1", "VOC1"]);
    expect(result.issues).toEqual([]);
    expect(result.paragraphs.flatMap((paragraph) => paragraph.parts).filter((part) => part.type !== "text")).toHaveLength(3);
    expect(result.cleanText).toContain("Mia will open the old gate");
    expect(result.cleanText).toContain("must stay together");
  });

  test("passes the Step 2 usage plan and a compact valid JSON example to the model", () => {
    const prompt = buildReadingTemplatePrompt({
      storyTitle: "A Door",
      storySummary: "Mia opens a door.",
      englishLevel: "A2",
      cefrWritingProfile: "Use short sentences.",
      people: [],
      storyCharacters: [],
      chapters: [{ id: "chapter-1", order: 1, title: "The Gate", summary: "Mia reaches the gate.", requirements, knowledgePointUsagePlan: "Future with Will：用于描述 Mia 的计划。" }],
      mainIdea: { targetWordCount: 20, preferredRange: [18, 22], acceptedRange: [15, 25] },
      qualityRules: [],
    });

    expect(prompt).toContain("knowledgePointUsagePlan");
    expect(prompt).toContain("用于描述 Mia 的计划");
    expect(prompt).toContain("<formatExample>");
  });

  test("reports a named missing slot instead of accepting an anonymous count", () => {
    const generated = validChapter();
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("{{WF1}}", "stay");

    expect(compileChapterTemplate(generated, requirements).issues).toContainEqual(expect.objectContaining({ code: "marker_set" }));
  });

  test("parses chapters independently by exact ID and never falls back to array position", () => {
    const chapter2 = { ...validChapter(), outlineChapterId: "chapter-2" };
    const result = parseReadingTemplatePayload({
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [chapter2, { outlineChapterId: "chapter-1", paragraphs: "broken", slots: [] }],
      mainIdea: { text: "A valid independent summary." },
    }, [requirements, { ...requirements, outlineChapterId: "chapter-2" }]);

    expect(result.envelopeError).toBeNull();
    expect(result.mainIdea).toEqual({ text: "A valid independent summary." });
    expect(result.chapters[0]).toMatchObject({ outlineChapterId: "chapter-1", generated: null, parseError: "章节模板结构无效" });
    expect(result.chapters[1].generated?.outlineChapterId).toBe("chapter-2");
  });

  test("rejects late payloads produced by another contract version", () => {
    const result = parseReadingTemplatePayload({ contractVersion: "step4.content.v1", chapters: [validChapter()], mainIdea: { text: "Summary" } }, [requirements]);

    expect(result.envelopeError).toContain("协议版本");
    expect(result.chapters[0].generated).toBeNull();
  });

  test("applies a paragraph repair without changing untouched paragraphs or slots", () => {
    const current = validChapter();
    const repaired = applyChapterTemplateRepairs(current, [{
      kind: "paragraph",
      outlineChapterId: "chapter-1",
      paragraphIndex: 1,
      template: current.paragraphs[1].template,
      slots: [{ id: "WF1", kind: "wordForm", knowledgePointKey: "KP2", answer: "stay", cue: "stay" }],
    }]);

    expect(repaired.paragraphs[0]).toEqual(current.paragraphs[0]);
    expect(repaired.slots.find((slot) => slot.id === "OC1")).toEqual(current.slots.find((slot) => slot.id === "OC1"));
    expect(repaired.slots.find((slot) => slot.id === "VOC1")).toEqual(current.slots.find((slot) => slot.id === "VOC1"));
  });

  test("accepts an automatic repair only when the whole failed chapter becomes valid", () => {
    const broken = validChapter();
    broken.paragraphs[1].template = broken.paragraphs[1].template.replace("{{WF1}}", "stay");
    const previous = compileChapterTemplate(broken, requirements).issues;

    expect(repairFullyResolvesChapter(previous, compileChapterTemplate(validChapter(), requirements).issues)).toBe(true);
    expect(repairFullyResolvesChapter(previous, [{ code: "word_count", message: "仍然过长" }])).toBe(false);
    expect(repairFullyResolvesChapter(previous, [...previous, { code: "part_structure", message: "新增错误" }])).toBe(false);
  });
});
