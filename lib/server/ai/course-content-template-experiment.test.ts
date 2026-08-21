import { describe, expect, test } from "vitest";

import {
  applyChapterTemplatePatch,
  applyChapterTemplatePatches,
  buildChapterTemplateExperimentPrompt,
  buildChapterTemplateRepairPrompt,
  buildReadingTemplateExperimentPrompt,
  compileChapterTemplate,
  compileReadingTemplate,
  chapterTemplateRepairMode,
  generatedChapterTemplateSchema,
  isMonotonicTemplateRepair,
  paragraphWordBudgets,
  parseAndCompileReadingTemplate,
  requiredChapterSlotIds,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
  type ReadingTemplatePromptContext,
} from "./course-content-template-experiment";

const requirements: ChapterTemplateRequirements = {
  outlineChapterId: "chapter-1",
  paragraphCount: 2,
  targetWordCount: 120,
  optionClozeCount: 1,
  wordFormCount: 1,
  vocabularyCount: 1,
  grammarPoints: [
    { key: "KP1", label: "Future with Will", category: "时态" },
    { key: "KP2", label: "Must", category: "情态动词" },
  ],
};

function validTemplate(): GeneratedChapterTemplate {
  return {
    outlineChapterId: "chapter-1",
    paragraphs: [
      { template: "Tomorrow, Mia {{OC1}} open the old gate with her team. They check the map, carry the box, and wait beside the quiet wall until sunrise. Everyone knows the careful plan and stays calm. Before they move, Mia reads each note aloud, while her friends compare every symbol with the drawing on the wall." },
      { template: "The students must {{WF1}} together when the bell rings. They follow {{VOC1}}, protect the people nearby, and bring every missing sound back to the city before the final celebration begins. At the last corner, they hear a soft song, choose the safest path, and tell the waiting families that the danger has finally passed." },
    ],
    slots: {
      optionCloze: [{ id: "OC1", knowledgePointKey: "KP1", answer: "will", distractors: ["did", "has"], evidenceExcerpt: "will open the old gate" }],
      wordForm: [{ id: "WF1", knowledgePointKey: "KP2", answer: "stay", cue: "stay", evidenceExcerpt: "must stay together" }],
      vocabulary: [{ id: "VOC1", answer: "a useful clue", canonicalForm: "useful clue", meaningZh: "有用的线索" }],
    },
  };
}

function batchContext(): ReadingTemplatePromptContext {
  return {
    storyTitle: "The Hidden Door",
    storySummary: "Mia and her friends protect the city and recover its missing sounds.",
    englishLevel: "A2",
    people: [{ englishName: "Mia", role: "student" }],
    storyCharacters: [{ displayName: "Mohong", storyRole: "the monster who stole the sounds" }],
    chapters: [1, 2, 3, 4, 5].map((order) => ({
      id: `chapter-${order}`,
      order,
      title: `Chapter ${order}`,
      summary: `The team completes story event ${order}.`,
      requirements: { ...requirements, outlineChapterId: `chapter-${order}` },
    })),
  };
}

describe("course content template experiment", () => {
  test("compiles fixed slots into the existing ordered parts contract", () => {
    const result = compileChapterTemplate(validTemplate(), requirements);

    expect(result.issues).toEqual([]);
    expect(result.wordCount).toBeGreaterThanOrEqual(106);
    expect(result.wordCount).toBeLessThanOrEqual(150);
    expect(result.cleanText).toContain("Mia will open the old gate");
    expect(result.cleanText).toContain("must stay together");
    expect(result.paragraphs.flatMap((paragraph) => paragraph.parts).filter((part) => part.type !== "text")).toHaveLength(3);
  });

  test("allocates explicit paragraph budgets whose totals match chapter policy", () => {
    const budgets = paragraphWordBudgets(120, 2);

    expect(budgets).toEqual([
      { paragraphIndex: 0, preferredRange: [55, 60], acceptedRange: [53, 75] },
      { paragraphIndex: 1, preferredRange: [55, 60], acceptedRange: [53, 75] },
    ]);
  });

  test("detects the paid experiment's overlong paragraphs independently of total length", () => {
    const generated = validTemplate();
    generated.paragraphs[0].template += " The team repeats the same explanation many times because everyone wants to describe every small detail before moving forward with the plan. They also stop to discuss the color, shape, age, and history of every stone around them.";

    const result = compileChapterTemplate(generated, requirements);

    expect(result.issues).toContainEqual(expect.objectContaining({ code: "paragraph_word_count", target: "paragraph-chapter-1-1" }));
  });

  test("detects missing markers and semantic knowledge-point false positives", () => {
    const generated = validTemplate();
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("must {{WF1}} together", "{{WF1}} loudly");
    generated.slots.wordForm[0] = { id: "WF1", knowledgePointKey: "KP2", answer: "shouted", cue: "shout", evidenceExcerpt: "shouted loudly" };

    const result = compileChapterTemplate(generated, requirements);

    expect(result.issues).toContainEqual(expect.objectContaining({ code: "knowledge_point_evidence", target: "WF1" }));
  });

  test("detects a missing named slot even when the remaining JSON is valid", () => {
    const generated = validTemplate();
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("{{WF1}}", "stay");

    expect(compileChapterTemplate(generated, requirements).issues).toContainEqual(expect.objectContaining({ code: "marker_set" }));
  });

  test("applies isolated template and grammar-slot patches without replacing other content", () => {
    const generated = validTemplate();
    const compressed = applyChapterTemplatePatch(generated, {
      kind: "templates",
      outlineChapterId: "chapter-1",
      paragraphs: generated.paragraphs.map((paragraph) => ({ ...paragraph })),
    });
    const repaired = applyChapterTemplatePatch(compressed, {
      kind: "grammar_slot",
      outlineChapterId: "chapter-1",
      paragraphIndex: 1,
      template: compressed.paragraphs[1].template,
      slotType: "wordForm",
      slot: { ...compressed.slots.wordForm[0], evidenceExcerpt: "must stay together" },
    });

    expect(repaired.slots.optionCloze).toEqual(generated.slots.optionCloze);
    expect(repaired.slots.vocabulary).toEqual(generated.slots.vocabulary);
    expect(repaired.paragraphs[0]).toEqual(generated.paragraphs[0]);
  });

  test("accepts only repairs that remove issues without introducing regressions", () => {
    const previous = [
      { code: "knowledge_point_evidence" as const, target: "WF1", message: "wrong evidence" },
      { code: "word_count" as const, message: "too long" },
    ];

    expect(isMonotonicTemplateRepair(previous, [{ code: "word_count", message: "too long" }])).toBe(true);
    expect(isMonotonicTemplateRepair(previous, [{ code: "part_structure", message: "new failure" }])).toBe(false);
    expect(isMonotonicTemplateRepair(previous, [{ code: "word_count", message: "much worse" }])).toBe(false);
  });

  test("routes ordinary failures to minimal patches and structural corruption to one-chapter regeneration", () => {
    const localIssues = [
      { code: "paragraph_word_count" as const, target: "paragraph-chapter-1-1", message: "too long" },
      { code: "knowledge_point_evidence" as const, target: "WF1", message: "wrong evidence" },
    ];
    expect(chapterTemplateRepairMode(localIssues)).toBe("patch");
    const prompt = buildChapterTemplateRepairPrompt(validTemplate(), requirements, localIssues);
    expect(prompt).toContain("{patches:[...]}");
    expect(prompt).not.toContain("Chapter 2");
    expect(chapterTemplateRepairMode([{ code: "slot_set", message: "missing slot" }])).toBe("regenerate_chapter");
  });

  test("rejects conflicting grammar patches for the same paragraph", () => {
    const current = validTemplate();
    const slot = current.slots.wordForm[0];
    expect(() => applyChapterTemplatePatches(current, [
      { kind: "grammar_slot", outlineChapterId: "chapter-1", paragraphIndex: 1, template: "The students must {{WF1}} together.", slotType: "wordForm", slot },
      { kind: "grammar_slot", outlineChapterId: "chapter-1", paragraphIndex: 1, template: "The students must {{WF1}} now.", slotType: "wordForm", slot },
    ])).toThrow("冲突正文");

    expect(() => applyChapterTemplatePatches(current, [
      { kind: "templates", outlineChapterId: "chapter-1", paragraphs: current.paragraphs },
      { kind: "grammar_slot", outlineChapterId: "chapter-1", paragraphIndex: 1, template: "The students must {{WF1}} now.", slotType: "wordForm", slot },
    ])).toThrow("正文模板补丁冲突");
  });

  test("builds one compact batch prompt with shared context instead of five repeated prompts", () => {
    const context = batchContext();
    const batchPrompt = buildReadingTemplateExperimentPrompt(context);
    const singlePrompt = buildChapterTemplateExperimentPrompt({
      storyTitle: context.storyTitle,
      storySummary: context.storySummary,
      englishLevel: context.englishLevel,
      chapter: context.chapters[0],
      surroundingChapters: context.chapters.slice(1),
      grammarPoints: requirements.grammarPoints,
      people: context.people,
      storyCharacters: context.storyCharacters,
      requirements,
    });

    expect(batchPrompt).toContain('"preferredRange":[55,60]');
    expect(batchPrompt).toContain("must {{WF}} (stay)");
    expect((batchPrompt.match(/<context>/g) ?? [])).toHaveLength(1);
    expect(batchPrompt.length).toBeLessThan(singlePrompt.length * 3);
  });

  test("compiles a batch by exact chapter IDs and reports missing chapters without positional fallback", () => {
    const chapter1 = validTemplate();
    const chapter2 = { ...validTemplate(), outlineChapterId: "chapter-2" };
    const batch = compileReadingTemplate(
      { chapters: [chapter2, chapter1] },
      [requirements, { ...requirements, outlineChapterId: "chapter-2" }],
    );

    expect(batch.chapterSetValid).toBe(true);
    expect(batch.chapters.map((chapter) => chapter.outlineChapterId)).toEqual(["chapter-1", "chapter-2"]);
    expect(compileReadingTemplate({ chapters: [chapter1] }, [requirements, { ...requirements, outlineChapterId: "chapter-2" }]).chapterSetValid).toBe(false);
  });

  test("keeps valid chapters when another chapter in the same response has an invalid schema", () => {
    const payload = {
      chapters: [
        validTemplate(),
        { outlineChapterId: "chapter-2", paragraphs: "broken", slots: {} },
      ],
    };
    const result = parseAndCompileReadingTemplate(payload, [requirements, { ...requirements, outlineChapterId: "chapter-2" }]);

    expect(result.envelopeValid).toBe(true);
    expect(result.chapterSetValid).toBe(true);
    expect(result.chapters[0].result?.issues).toEqual([]);
    expect(result.chapters[1]).toMatchObject({ outlineChapterId: "chapter-2", result: null, parseError: "章节模板结构无效" });
  });

  test("keeps the schema and generated requirement IDs deterministic", () => {
    expect(generatedChapterTemplateSchema.parse(validTemplate())).toEqual(validTemplate());
    expect(requiredChapterSlotIds(requirements)).toEqual(["OC1", "WF1", "VOC1"]);
  });
});
