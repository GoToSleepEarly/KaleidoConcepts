import { describe, expect, test } from "vitest";

import {
  STEP4_CONTENT_CONTRACT_VERSION,
  applyReadingReview,
  applyChapterTemplateRepairs,
  buildReadingTemplateFinalizationPrompt,
  buildReadingTemplatePrompt,
  buildReadingTemplateRepairPrompt,
  compileChapterTemplate,
  paragraphWordBudgets,
  parseReadingTemplatePayload,
  repairFullyResolvesChapter,
  requiredChapterSlotIds,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
} from "./course-content-template";

const requirements: ChapterTemplateRequirements = {
  outlineChapterId: "chapter-1",
  narrativeTense: "past",
  paragraphCount: 2,
  targetWordCount: 120,
  optionClozeCount: 1,
  wordFormCount: 1,
  vocabularyCount: 1,
  grammarPoints: [
    { key: "KP1", label: "Future with Will", unitStart: 19, unitEnd: 19, sourceUnits: [{ unitNumber: 19, officialTitle: "Present tenses (I am doing / I do) for the future" }] },
    { key: "KP2", label: "Must", unitStart: 31, unitEnd: 31, sourceUnits: [{ unitNumber: 31, officialTitle: "must and have to" }] },
  ],
};

test("allows a small natural imbalance between two paragraphs while keeping the chapter total strict", () => {
  expect(paragraphWordBudgets(150, 2)).toEqual([
    { paragraphIndex: 0, preferredRange: [67, 83], acceptedRange: [60, 95] },
    { paragraphIndex: 1, preferredRange: [67, 83], acceptedRange: [60, 95] },
  ]);
});

function validChapter(): GeneratedChapterTemplate {
  return {
    outlineChapterId: "chapter-1",
    paragraphs: [
      { template: "Mia said, “Tomorrow, I {{OC1}} open the old gate with my team.” They checked the map, carried the box, and waited beside the quiet wall until sunrise. Everyone knew the careful plan and stayed calm. Before they moved, Mia read each note aloud, while her friends compared every symbol with the drawing on the wall all day." },
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
    expect(result.cleanText).toContain("I will open the old gate");
    expect(result.cleanText).toContain("must stay together");
  });

  test("allows a three-word paragraph drift only when the whole chapter word count is valid", () => {
    const generated = validChapter();
    const baseline = compileChapterTemplate(generated, requirements);
    const secondParagraphText = baseline.cleanText.slice(baseline.cleanText.indexOf("The students"));
    const secondParagraphWords = secondParagraphText.split(/\s+/).length;
    expect(secondParagraphWords).toBeGreaterThan(0);

    const tolerantRequirements = { ...requirements, targetWordCount: baseline.wordCount };
    const budgets = paragraphWordBudgets(tolerantRequirements.targetWordCount, 2);
    const paragraphCounts = baseline.paragraphWordCounts;
    const drift = Math.max(
      budgets[0].acceptedRange[0] - paragraphCounts[0],
      paragraphCounts[0] - budgets[0].acceptedRange[1],
      budgets[1].acceptedRange[0] - paragraphCounts[1],
      paragraphCounts[1] - budgets[1].acceptedRange[1],
    );
    expect(drift).toBeLessThanOrEqual(3);
    expect(compileChapterTemplate(generated, tolerantRequirements).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "paragraph_word_count" }),
    ]));

    expect(compileChapterTemplate(generated, { ...tolerantRequirements, targetWordCount: 40 }).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "paragraph_word_count" }),
      expect.objectContaining({ code: "word_count" }),
    ]));
  });

  test("passes the Step 2 usage plan and a compact valid JSON example to the model", () => {
    const prompt = buildReadingTemplatePrompt({
      storyTitle: "A Door",
      storySummary: "Mia opens a door.",
      englishLevel: "A2",
      cefrWritingProfile: "Use short sentences.",
      storyComplexity: "clear_linear",
      storyComplexityProfile: "Use one direct mainline.",
      grammarSource: { bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2" },
      people: [],
      storyCharacters: [],
      chapters: [{ id: "chapter-1", order: 1, title: "The Gate", summary: "Mia reaches the gate.", requirements, knowledgePointUsagePlan: "Future with Will：用于描述 Mia 的计划。" }],
      mainIdea: { targetWordCount: 20, preferredRange: [18, 22], acceptedRange: [15, 25] },
    });

    const fixedInstructionLines = prompt.slice(0, prompt.indexOf("<context>")).split("\n");
    expect(prompt).toContain("knowledgePointUsagePlan");
    expect(prompt).toContain("用于描述 Mia 的计划");
    expect(prompt).toContain("<formatExample>");
    expect(prompt).toContain("上下界均为硬验收");
    expect(prompt).toContain("contentIntent 是已确认的最终内容目标");
    expect(prompt).toContain("faithful");
    expect(prompt).toContain("observer");
    expect(prompt).toContain('"chapterWordBudget":{"target":120,"preferredRange":[110,130],"acceptedRange":[100,145]}');
    expect(prompt).toContain("英语正确性最高");
    expect(prompt).toContain("不得为题量、知识点、字数或故事表达让步");
    expect(prompt).toContain('"grammarSource":{"bookTitle":"English Grammar in Use","edition":"Fifth Edition","officialLevel":"B1–B2"}');
    expect(prompt).toContain('"unitNumber":19');
    expect(prompt).toContain("Present tenses (I am doing / I do) for the future");
    expect(prompt).toContain("禁止用大纲复述、规则说明、检查过程或重复空话凑词数");
    expect(prompt).toContain("answer 选择本身必须由绑定知识点决定");
    expect(prompt).toContain("功能词、助动词或情态词必须包含在 answer 内");
    expect(prompt).toContain("仅在完整句其他位置出现知识点");
    expect(prompt).toContain("候选作答点将在下一次 AI 调用中独立审核定稿");
    expect(prompt).toContain("禁止返回 distractors 或 options");
    expect(prompt).not.toContain('"distractors"');
    expect(prompt).not.toContain("所有 Present/Future 语法槽位必须位于直接话语的引号内");
    expect(prompt).not.toContain("禁止 will + V-ing（缺少 be）");
    expect(fixedInstructionLines.length).toBeLessThanOrEqual(18);
  });

  test("separates candidate story writing from final question review", () => {
    const context = {
      storyTitle: "A Door",
      storySummary: "Mia opens a door.",
      englishLevel: "A2",
      cefrWritingProfile: "Use short sentences.",
      storyComplexity: "clear_linear",
      storyComplexityProfile: "Use one direct mainline.",
      grammarSource: { bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2" },
      people: [],
      storyCharacters: [],
      chapters: [{ id: "chapter-1", order: 1, title: "The Gate", summary: "Mia reaches the gate.", requirements, knowledgePointUsagePlan: "Future with Will：用于描述 Mia 的计划。" }],
      mainIdea: { targetWordCount: 20, preferredRange: [18, 22] as [number, number], acceptedRange: [15, 25] as [number, number] },
    };
    const candidate = {
      candidateVersion: "step4.reading-candidate.v1",
      chapters: [{ outlineChapterId: "chapter-1", paragraphs: [{ template: "Mia {{OC1}} ready." }], slots: [{ id: "OC1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "is" }] }],
      mainIdea: { text: "Mia follows a plan." },
    };
    const prompt = buildReadingTemplateFinalizationPrompt(candidate, context);

    expect(prompt).toContain("第一步审核纯正文");
    expect(prompt).toContain("包括不含 marker 的句子");
    expect(prompt).toContain("候选位置、answer、cue 均可修改");
    expect(prompt).toContain("不得预先泄露在 marker 外");
    expect(prompt).toContain("标准、完整且拼写正确的 distractors");
    expect(prompt).toContain("提供决定性线索");
    expect(prompt).toContain('"candidate"');
    expect(prompt).toContain("distractors:[两个]");
    expect(prompt).toContain("paragraphPatches 只列需要修改的段落");
    expect(prompt).not.toContain('"storyTitle"');
    expect(prompt).not.toContain('"storyArc"');
  });

  test("merges reviewed slots and only changed paragraphs into the final reading contract", () => {
    const candidate = {
      candidateVersion: "step4.reading-candidate.v1",
      chapters: [{
        outlineChapterId: "chapter-1",
        paragraphs: [{ template: "Yesterday, Mia {{OC1}} home." }, { template: "She must {{WF1}} the {{VOC1}}." }],
        slots: [
          { id: "OC1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "go" },
          { id: "WF1", kind: "wordForm", knowledgePointKey: "KP2", answer: "carry", cue: "carry" },
          { id: "VOC1", kind: "vocabulary", answer: "map", canonicalForm: "map", meaningZh: "地图" },
        ],
      }],
      mainIdea: { text: "Mia follows the map." },
    };
    const result = applyReadingReview(candidate, {
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [{
        outlineChapterId: "chapter-1",
        paragraphPatches: [{ paragraphIndex: 0, template: "Yesterday, Mia {{OC1}} home safely." }],
        slots: [
          { id: "OC1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "went", distractors: ["goes", "will go"] },
          { id: "WF1", kind: "wordForm", knowledgePointKey: "KP2", answer: "carry", cue: "carry" },
          { id: "VOC1", kind: "vocabulary", answer: "map", canonicalForm: "map", meaningZh: "地图" },
        ],
      }],
    });

    expect(result.chapters[0]?.paragraphs).toEqual([{ template: "Yesterday, Mia {{OC1}} home safely." }, { template: "She must {{WF1}} the {{VOC1}}." }]);
    expect(result.chapters[0]?.slots[0]).toMatchObject({ answer: "went", distractors: ["goes", "will go"] });
    expect(result.mainIdea).toEqual(candidate.mainIdea);
  });

  test("leaves uncertain grammar meaning to the model while retaining deterministic structure checks", () => {
    const generated = validChapter();
    generated.slots = generated.slots.map((slot) => slot.id === "WF1"
      ? { ...slot, knowledgePointKey: "KP1", answer: "speak", cue: "speak" }
      : slot);
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("must {{WF1}}", "asked them to {{WF1}}");

    expect(compileChapterTemplate(generated, requirements).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: expect.stringMatching(/^grammar_|^option_quality$/) }),
    ]));
  });

  test("reports a named missing slot instead of accepting an anonymous count", () => {
    const generated = validChapter();
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("{{WF1}}", "stay");

    expect(compileChapterTemplate(generated, requirements).issues).toContainEqual(expect.objectContaining({ code: "marker_set" }));
  });

  test("keeps full semantic context when a structurally broken chapter must be regenerated", () => {
    const prompt = buildReadingTemplateRepairPrompt([{
      current: null,
      requirements,
      issues: [{ code: "part_structure", message: "章节模板结构无效" }],
      parseError: "章节模板结构无效",
    }], {
      storyTitle: "The Time Door",
      storySummary: "Four students travel through time and must return to class.",
      contentIntent: { kind: "concept", storyMode: "new_story", classroomPresence: "participant", objective: "Understand gravity", learningTargets: [{ concept: "gravity", expectedUnderstanding: "Objects attract one another" }], assumedPriorKnowledge: [], sourceRequirements: [], required: [], excluded: [] },
      englishLevel: "A2",
      cefrWritingProfile: "Use clear A2 sentences.",
      storyComplexity: "clear_linear",
      storyComplexityProfile: "Use one direct mainline.",
      grammarSource: { bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2" },
      people: [],
      storyCharacters: [],
      chapters: [{ id: "chapter-1", order: 1, title: "The Fall", summary: "The team sees objects fall.", requirements }],
      mainIdea: { targetWordCount: 120, preferredRange: [115, 125], acceptedRange: [110, 130] },
    }, { current: null, issues: ["课后阅读结构无效"] });

    for (const expected of ["The Time Door", "Understand gravity", "Objects attract one another", "A2", "The team sees objects fall"]) expect(prompt).toContain(expected);
    expect(prompt).toContain("mainIdeaTarget");
    expect(prompt).not.toContain("storyCharacters");
    expect(prompt).not.toContain('"requirements"');
    expect(prompt.match(/"paragraphBudgets"/g)).toHaveLength(1);
  });

  test("gives a Main Idea-only repair the compact whole-story arc without successful chapter text", () => {
    const context = {
      storyTitle: "The Time Door",
      storySummary: "A short adventure.",
      englishLevel: "A2",
      cefrWritingProfile: "Use clear A2 sentences.",
      storyComplexity: "clear_linear",
      storyComplexityProfile: "Use one direct mainline.",
      grammarSource: { bookTitle: "English Grammar in Use", edition: "Fifth Edition", officialLevel: "B1–B2" },
      people: [],
      storyCharacters: [],
      chapters: [{ id: "chapter-1", order: 1, title: "The Fall", summary: "The team sees objects fall.", requirements }],
      mainIdea: { targetWordCount: 120, preferredRange: [115, 125] as [number, number], acceptedRange: [110, 130] as [number, number] },
    };

    const prompt = buildReadingTemplateRepairPrompt([], context, { current: null, issues: ["课后阅读缺失"] });

    expect(prompt).toContain('"storyArc":[{"id":"chapter-1","title":"The Fall","summary":"The team sees objects fall."}]');
    expect(prompt).not.toContain('"current":{"outlineChapterId"');
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
