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
  chapterTemplateRepairBundleSchema,
  readingGenerationEnvelopeSchema,
  requiredChapterSlotIds,
  type ChapterTemplateRequirements,
  type GeneratedChapterTemplate,
} from "./course-content-template";

const requirements: ChapterTemplateRequirements = {
  outlineChapterId: "chapter-1",
  narrativeTense: "past",
  paragraphCount: 2,
  targetWordCount: 120,
  grammarCount: 2,
  enabledGrammarTypes: ["optionCloze", "wordForm"],
  vocabularyCount: 1,
  grammarPoints: [
    { key: "KP1", label: "Future with Will", unitStart: 19, unitEnd: 19, sourceUnits: [{ unitNumber: 19, officialTitle: "Present tenses (I am doing / I do) for the future" }] },
    { key: "KP2", label: "Must", unitStart: 31, unitEnd: 31, sourceUnits: [{ unitNumber: 31, officialTitle: "must and have to" }] },
  ],
};

test("allows a small natural imbalance between two paragraphs while keeping the chapter total strict", () => {
  expect(paragraphWordBudgets(150, 2)).toEqual([
    { paragraphIndex: 0, preferredRange: [67, 75], acceptedRange: [60, 95] },
    { paragraphIndex: 1, preferredRange: [67, 75], acceptedRange: [60, 95] },
  ]);
});

function validChapter(): GeneratedChapterTemplate {
  return {
    outlineChapterId: "chapter-1",
    paragraphs: [
      { template: "Mia said, “Tomorrow, I {{GR1}} open the old gate with my team.” They checked the map, carried the box, and waited beside the quiet wall until sunrise. Everyone knew the careful plan and stayed calm. Before they moved, Mia read each note aloud, while her friends compared every symbol with the drawing on the wall all day." },
      { template: "The students must {{GR2}} together when the bell rings. They follow {{VOC1}}, protect the people nearby, and bring every missing sound back to the city before the final celebration begins. At the last corner, they hear a soft song, choose the safest path, and tell the waiting families that the danger has finally passed." },
    ],
    slots: [
      { id: "GR1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "will", distractors: ["did", "has"] },
      { id: "GR2", kind: "wordForm", knowledgePointKey: "KP2", answer: "stay", cue: "stay" },
      { id: "VOC1", kind: "vocabulary", answer: "a useful clue", canonicalForm: "useful clue", meaningZh: "有用的线索" },
    ],
  };
}

describe("Step4 fixed-slot production contract", () => {
  test("lets AI assign knowledge points while program closes exact typed slots", () => {
    const result = compileChapterTemplate(validChapter(), requirements);

    expect(requiredChapterSlotIds(requirements)).toEqual(["GR1", "GR2", "VOC1"]);
    expect(result.issues).toEqual([]);
    expect(result.paragraphs.flatMap((paragraph) => paragraph.parts).filter((part) => part.type !== "text")).toHaveLength(3);
    expect(result.cleanText).toContain("I will open the old gate");
    expect(result.cleanText).toContain("must stay together");
  });

  test("reports only paragraphs that actually exceed the three-word tolerance", () => {
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

    const wholeChapterTooLong = compileChapterTemplate(generated, { ...tolerantRequirements, targetWordCount: 90 }).issues;
    expect(wholeChapterTooLong).toEqual(expect.arrayContaining([expect.objectContaining({ code: "word_count" })]));
    expect(wholeChapterTooLong).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "paragraph_word_count" })]));
  });

  test("passes explicit dynamic paragraph and slot counts without a misleading static example", () => {
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
    expect(prompt).not.toContain("<formatExample>");
    expect(prompt).toContain('"paragraphCount":2');
    expect(prompt).toContain('"grammarCount":2');
    expect(prompt).toContain('"vocabularyCount":1');
    expect(prompt).toContain('"totalSlotCount":3');
    expect(prompt).toContain("contentIntent 是已确认的最终内容目标");
    expect(prompt).toContain("faithful");
    expect(prompt).toContain("observer");
    expect(prompt).toContain('"chapterWordBudget":{"target":120,"preferredRange":[110,120],"acceptedRange":[100,145]}');
    expect(prompt).toContain("acceptedRange 仅是硬验收边界，不是生成目标");
    expect(prompt).toContain("多词 answer 的每个英文词都计入");
    expect(prompt).toContain("英语正确性最高");
    expect(prompt).toContain("不得为题量、知识点、字数或故事表达让步");
    expect(prompt).toContain('"grammarSource":{"bookTitle":"English Grammar in Use","edition":"Fifth Edition","officialLevel":"B1–B2"}');
    expect(prompt).toContain('"unitNumber":19');
    expect(prompt).toContain("Present tenses (I am doing / I do) for the future");
    expect(prompt).toContain("禁止用大纲复述、规则说明、检查过程或重复空话凑词数");
    expect(prompt).toContain("answer 选择本身必须由绑定知识点决定");
    expect(prompt).toContain("功能词、助动词或情态词必须包含在 answer 内");
    expect(prompt).toContain("优先使用当前数量较少的题型");
    expect(prompt).toContain("任意两段的题目数目标相差不超过 1");
    expect(prompt).toContain("各段完整 clean text 的词数同样围绕 paragraphBudgets.preferredRange 尽可能均衡");
    expect(prompt).toContain("answer='was waiting' 时 cue='wait'");
    expect(prompt).toContain("仅允许 optionCloze 时，把完整的 'to verb' 作为 answer");
    expect(prompt).not.toContain("若目标是 to + verb，必须让该 GR 槽位使用 wordForm");
    expect(prompt).toContain("仅在完整句其他位置出现知识点");
    expect(prompt).toContain("不再经过第二次整课 AI 审核");
    expect(prompt).toContain("不要返回 options 或 baseForm");
    expect(prompt).toContain('"distractors"');
    expect(prompt).toContain(`"contractVersion":"${STEP4_CONTENT_CONTRACT_VERSION}"`);
    expect(prompt.indexOf("最终逐章核对")).toBeGreaterThan(prompt.indexOf("</context>"));
    expect(prompt).toContain("template 中提取的全部 marker ID、slots 中的全部 ID，必须分别与 requiredSlotIds 完全一致");
    expect(prompt).not.toContain("所有 Present/Future 语法槽位必须位于直接话语的引号内");
    expect(prompt).not.toContain("禁止 will + V-ing（缺少 be）");
    expect(fixedInstructionLines.length).toBeLessThanOrEqual(18);
  });

  test("accepts harmless extra response metadata but requires the current one-pass contract", () => {
    const payload = {
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      note: "ignored",
      chapters: [{ ...validChapter(), note: "ignored", slots: validChapter().slots.map((slot) => ({ ...slot, note: "ignored" })) }],
      mainIdea: { text: "Mia follows a plan.", note: "ignored" },
    };

    expect(readingGenerationEnvelopeSchema.parse(payload)).not.toHaveProperty("note");
    expect(() => readingGenerationEnvelopeSchema.parse({ ...payload, contractVersion: undefined })).toThrow();
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
      candidateVersion: "step4.reading-candidate.v5",
      chapters: [{ outlineChapterId: "chapter-1", paragraphs: [{ template: "Mia {{GR1}} ready." }], slots: [{ id: "GR1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "is" }] }],
      mainIdea: { text: "Mia follows a plan." },
    };
    const prompt = buildReadingTemplateFinalizationPrompt(candidate, context);

    expect(prompt).toContain("第一步审核纯正文");
    expect(prompt).toContain("包括不含 marker 的句子");
    expect(prompt).toContain("候选位置、answer、cue 和 GR 槽位的 kind 均可修改");
    expect(prompt).toContain("不得预先泄露在 marker 外");
    expect(prompt).toContain("标准、完整且拼写正确的 distractors");
    expect(prompt).toContain("提供决定性线索");
    expect(prompt).toContain("优先使用当前数量较少的题型");
    expect(prompt).toContain("任意两段的题目数目标相差不超过 1");
    expect(prompt).toContain("answer='was waiting' 时 cue='wait'");
    expect(prompt).toContain("仅允许 optionCloze 时，把完整的 'to verb' 作为 answer");
    expect(prompt).not.toContain("若目标是 to + verb，必须使用 wordForm");
    expect(prompt).toContain('"candidate"');
    expect(prompt).toContain("distractors:[两个]");
    expect(prompt).toContain("paragraphPatches 只列需要修改的段落");
    expect(prompt).not.toContain('"storyTitle"');
    expect(prompt).not.toContain('"storyArc"');
  });

  test("allows candidate word-form slots to defer cue completion to the strict final review", () => {
    const candidate = {
      chapters: [{
        outlineChapterId: "chapter-1",
        paragraphs: [{ template: "Yesterday, Mia {{GR1}} home." }, { template: "She must {{GR2}} the {{VOC1}}." }],
        slots: [
          { id: "GR1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "go", distractors: ["ignored", "candidate", "options"], note: "candidate-only metadata" },
          { id: "GR2", kind: "wordForm", knowledgePointKey: "KP2", answer: "carry" },
          { id: "VOC1", kind: "vocabulary", answer: "map" },
        ],
      }],
      mainIdea: { text: "Mia follows the map.", title: "Model title is ignored" },
    };
    const result = applyReadingReview(candidate, {
      chapters: [{
        outlineChapterId: "chapter-1",
        note: "review metadata is ignored",
        slots: [
          { id: "GR1", kind: "optionCloze", knowledgePointKey: "KP1", answer: "went", distractors: ["goes", "will go"] },
          { id: "GR2", kind: "wordForm", knowledgePointKey: "KP2", answer: "carry", cue: "carry" },
          { id: "VOC1", kind: "vocabulary", answer: "map", canonicalForm: "map", meaningZh: "地图" },
        ],
      }],
      auditNote: "reviewed",
    });

    expect(result.chapters[0]?.paragraphs).toEqual(candidate.chapters[0].paragraphs);
    expect(result.chapters[0]?.slots[0]).toMatchObject({ answer: "went", distractors: ["goes", "will go"] });
    expect(result.mainIdea).toEqual({ text: "Mia follows the map." });
    expect(() => applyReadingReview(candidate, {
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [{
        outlineChapterId: "chapter-1",
        paragraphPatches: [],
        slots: [{ id: "GR2", kind: "wordForm", knowledgePointKey: "KP2", answer: "carry" }],
      }],
    })).toThrow(/cue/);
  });

  test("defaults omitted repair change lists without weakening final slot validation", () => {
    const paragraphRepair = chapterTemplateRepairBundleSchema.parse({
      repairs: [{ kind: "paragraph", outlineChapterId: "chapter-1", paragraphIndex: 0, template: "Mia waits.", explanation: "text-only repair" }],
      explanation: "repair metadata",
    });
    expect(paragraphRepair.repairs[0]).toMatchObject({ kind: "paragraph", slots: [] });

    const mainIdeaOnly = chapterTemplateRepairBundleSchema.parse({
      mainIdea: { text: "Mia follows a plan.", title: "Ignored title" },
    });
    expect(mainIdeaOnly.repairs).toEqual([]);
    expect(mainIdeaOnly.contractVersion).toBe(STEP4_CONTENT_CONTRACT_VERSION);
  });

  test("normalizes paragraph-local slots from a whole-chapter AI repair", () => {
    const parsed = chapterTemplateRepairBundleSchema.parse({
      repairs: [{
        kind: "chapter",
        outlineChapterId: "chapter-1",
        chapter: {
          outlineChapterId: "chapter-1",
          paragraphs: [
            {
              template: "Mia {{GR1}} the map.",
              slots: [{ id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "found", cue: "find" }],
            },
            {
              template: "She followed {{VOC1}}.",
              slots: [{ id: "VOC1", kind: "vocabulary", answer: "a clue", canonicalForm: "clue", meaningZh: "线索" }],
            },
          ],
        },
      }],
    });

    const repair = parsed.repairs[0];
    expect(repair).toMatchObject({ kind: "chapter" });
    if (repair?.kind !== "chapter") throw new Error("expected a whole-chapter repair");
    expect(repair.chapter.paragraphs).toEqual([
      { template: "Mia {{GR1}} the map." },
      { template: "She followed {{VOC1}}." },
    ]);
    expect(repair.chapter.slots.map((slot) => slot.id)).toEqual(["GR1", "VOC1"]);
  });

  test("normalizes paragraph-local slots from the first reading response", () => {
    const parsed = readingGenerationEnvelopeSchema.parse({
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [{
        outlineChapterId: "chapter-1",
        paragraphs: [{
          template: "Mia {{GR1}} the map.",
          slots: [{ id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "found", cue: "find" }],
        }],
      }],
      mainIdea: { text: "Mia follows the map." },
    });

    expect(parsed.chapters[0]).toEqual({
      outlineChapterId: "chapter-1",
      paragraphs: [{ template: "Mia {{GR1}} the map." }],
      slots: [{ id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "found", cue: "find" }],
    });
  });

  test("keeps conflicting duplicate slots visible for deterministic final rejection", () => {
    const parsed = chapterTemplateRepairBundleSchema.parse({
      repairs: [{
        kind: "chapter",
        outlineChapterId: "chapter-1",
        chapter: {
          outlineChapterId: "chapter-1",
          paragraphs: [{
            template: "Mia {{GR1}} the map.",
            slots: [{ id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "found", cue: "find" }],
          }],
          slots: [{ id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "lost", cue: "lose" }],
        },
      }],
    });

    const repair = parsed.repairs[0];
    if (repair?.kind !== "chapter") throw new Error("expected a whole-chapter repair");
    expect(repair.chapter.slots).toHaveLength(2);
    expect(compileChapterTemplate(repair.chapter, requirements).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "slot_set" }),
    ]));
  });

  test("deduplicates only the same slot repeated across root and paragraph placement", () => {
    const slot = { id: "GR1", kind: "wordForm", knowledgePointKey: "KP1", answer: "found", cue: "find" } as const;
    const crossLevel = readingGenerationEnvelopeSchema.parse({
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [{ outlineChapterId: "chapter-1", paragraphs: [{ template: "Mia {{GR1}} it.", slots: [slot] }], slots: [slot] }],
      mainIdea: { text: "Mia finds it." },
    });
    const sameLevel = readingGenerationEnvelopeSchema.parse({
      contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
      chapters: [{ outlineChapterId: "chapter-1", paragraphs: [{ template: "Mia {{GR1}} it." }], slots: [slot, slot] }],
      mainIdea: { text: "Mia finds it." },
    });

    expect(crossLevel.chapters[0]?.slots).toHaveLength(1);
    expect(sameLevel.chapters[0]?.slots).toHaveLength(2);
  });

  test("leaves uncertain grammar meaning to the model while retaining deterministic structure checks", () => {
    const generated = validChapter();
    generated.slots = generated.slots.map((slot) => slot.id === "GR2"
      ? { ...slot, knowledgePointKey: "KP1", answer: "speak", cue: "speak" }
      : slot);
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("must {{GR2}}", "asked them to {{GR2}}");

    expect(compileChapterTemplate(generated, requirements).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: expect.stringMatching(/^grammar_|^option_quality$/) }),
    ]));
  });

  test("reports a named missing slot instead of accepting an anonymous count", () => {
    const generated = validChapter();
    generated.paragraphs[1].template = generated.paragraphs[1].template.replace("{{GR2}}", "stay");

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
    expect(prompt).toContain("优先使用当前数量较少的题型");
    expect(prompt).toContain("仅允许 optionCloze 时，把完整的 'to verb' 作为 answer");
    expect(prompt).not.toContain("storyCharacters");
    expect(prompt).not.toContain('"requirements"');
    expect(prompt.match(/"paragraphBudgets"/g)).toHaveLength(1);
    expect(prompt).toContain('"repairMode":"chapter"');
    expect(prompt).toContain("chapter.slots");
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
      slots: [{ id: "GR2", kind: "wordForm", knowledgePointKey: "KP2", answer: "stay", cue: "stay" }],
    }]);

    expect(repaired.paragraphs[0]).toEqual(current.paragraphs[0]);
    expect(repaired.slots.find((slot) => slot.id === "GR1")).toEqual(current.slots.find((slot) => slot.id === "GR1"));
    expect(repaired.slots.find((slot) => slot.id === "VOC1")).toEqual(current.slots.find((slot) => slot.id === "VOC1"));
  });

  test("accepts an automatic repair only when the whole failed chapter becomes valid", () => {
    const broken = validChapter();
    broken.paragraphs[1].template = broken.paragraphs[1].template.replace("{{GR2}}", "stay");
    const previous = compileChapterTemplate(broken, requirements).issues;

    expect(repairFullyResolvesChapter(previous, compileChapterTemplate(validChapter(), requirements).issues)).toBe(true);
    expect(repairFullyResolvesChapter(previous, [{ code: "word_count", message: "仍然过长" }])).toBe(false);
    expect(repairFullyResolvesChapter(previous, [...previous, { code: "part_structure", message: "新增错误" }])).toBe(false);
  });
});
