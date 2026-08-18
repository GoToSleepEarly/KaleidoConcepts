import { describe, expect, test } from "vitest";

import type { TeachingPlanState } from "@/lib/contracts/api";
import {
  buildExercisePromptContext,
  buildModificationPromptContext,
  buildPromptParts,
  buildPromptQuestions,
  buildReadingPromptContext,
  buildReadingRepairRequirements,
  buildReadingRepairPromptContext,
  cefrWritingProfile,
  cefrWritingQualityRules,
  contentReadingTimeoutMs,
  courseContentFormatRepairAttempts,
  courseContentPromptExamples,
  readingGrammarCoherenceRules,
  readingStoryQualityRules,
  readingWordCountPolicy,
} from "@/lib/server/ai/course-content-deps";

const input = {
  course: { id: "c1", title: "李老师和小明的故事", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp1"] },
  outline: { id: "o1", title: "小明的冒险", summary: "小明必须找回地图，才能带大家安全回家。", chapters: [{ id: "ch1", order: 1, title: "小明出发", summary: "李老师帮助小明。", recommendedKnowledgePointIds: ["kp1"], knowledgePointRecommendationSummary: "一般过去时：用于描述Milo已经完成的开门动作。" }] },
  knowledgePoints: [{ id: "kp1", label: "一般过去时" }],
  plan: {
    courseId: "c1", status: "confirmed", englishLevel: "A2",
    mainIdeaTargetWordCount: 120,
    chapters: [{ outlineChapterId: "ch1", targetWordCount: 90, paragraphCount: 2, knowledgePointIds: ["kp1"], readingExerciseMode: "interactive", readingExercises: { enabled: true, grammar: { optionCloze: 2, wordForm: 1 }, vocabulary: { chineseHint: 2 } }, chapterPractice: { enabled: true, grammar: { optionCloze: 3, wordForm: 2 } }, touched: { targetWordCount: true, paragraphCount: false, knowledgePointIds: true, readingExerciseMode: true, readingExercises: true, chapterPractice: true } }],
    afterClassPractice: { enabled: true, vocabularyReviewEnabled: true, knowledgePointIds: ["kp1"], practice: { enabled: true, grammar: { optionCloze: 2, wordForm: 2 } }, touched: { knowledgePointIds: true, practice: true } },
    updatedAt: "", confirmedAt: "",
  },
  promptPeople: [
    { role: "teacher", chineseName: "李老师", englishName: "Linda" },
    { role: "student", chineseName: "小明", englishName: "Milo" },
  ],
  promptCharacters: [{ displayName: "地图守护者", englishName: "Map Guardian", roleInStory: "阻止小明找到地图", shortDescription: "守护错误路线的角色" }],
} as TeachingPlanState & {
  promptPeople: Array<{ role: "teacher" | "student"; chineseName: string; englishName: string }>;
  promptCharacters: Array<{ displayName: string; englishName: string; roleInStory: string; shortDescription: string }>;
};

describe("course content prompt contexts", () => {
  test("defines distinct CEFR writing profiles and preserves story facts across levels", () => {
    expect(cefrWritingProfile("Starter")).toContain("Pre-A1/Starter");
    expect(cefrWritingProfile("A2")).toContain("基础从句");
    expect(cefrWritingProfile("B2")).toContain("多层从句");
    expect(cefrWritingProfile("C2")).toContain("文体控制力");
    expect(cefrWritingQualityRules.join("\n")).toContain("不得因此删除、增加、重排或改变上游核心事件");
    expect(cefrWritingQualityRules.join("\n")).toContain("禁止用互不衔接的电报式短句");
  });

  test("provides minimal unambiguous examples for every generated exercise shape", () => {
    expect(courseContentPromptExamples.reading).toContain('"exerciseType":"optionCloze"');
    expect(courseContentPromptExamples.reading).toContain('"exerciseType":"wordForm"');
    expect(courseContentPromptExamples.reading).toContain('"type":"vocabulary"');
    expect(courseContentPromptExamples.questions).toContain('"before":"Yesterday, Mia "');
    expect(courseContentPromptExamples.questions).toContain('"after":" the hidden door."');
    expect(courseContentPromptExamples.questions).toContain('"distractors":["finds","will find"]');
    expect(courseContentPromptExamples.questions).toContain('"baseForm":"find"');
    expect(courseContentPromptExamples.questions).not.toContain('"options"');
  });

  test("makes whole-text grammar coherence higher priority than inserting knowledge points", () => {
    const rules = readingGrammarCoherenceRules.join(" ");
    expect(rules).toContain("不得为了覆盖知识点");
    expect(rules).toContain("叙事基准时态");
    expect(rules).toContain("时间线");
    expect(rules).toContain("先在内部形成");
    expect(rules).toContain("禁止先指定知识点答案或词形");
    expect(rules).toContain("主谓一致");
    expect(rules).toContain("拼接完整 clean text");
  });

  test("makes story continuity and readable prose higher priority than exercise placement", () => {
    const rules = readingStoryQualityRules.join(" ");
    expect(rules).toContain("上游故事");
    expect(rules).toContain("前一段的结果");
    expect(rules).toContain("不能为了安放题目");
    expect(rules).toContain("不要用旁白宣布成长");
  });

  test("uses a longer timeout for the joint reading generation request", () => {
    expect(contentReadingTimeoutMs(undefined)).toBe(600_000);
    expect(contentReadingTimeoutMs("420000")).toBe(420_000);
  });

  test("allows only one paid format-repair attempt after deterministic normalization", () => {
    expect(courseContentFormatRepairAttempts).toBe(1);
  });

  test("gives generation and repair a safe word-count range instead of an ambiguous exact target", () => {
    expect(readingWordCountPolicy(100)).toEqual({ acceptedRange: [88, 130], aimRange: [92, 100] });
    const requirements = buildReadingRepairRequirements(input, [{
      id: "chapter-ch1", outlineChapterId: "ch1", order: 1, title: "Milo出发", targetWordCount: 90, readingExerciseMode: "interactive",
      paragraphs: [{ id: "paragraph-ch1-1", parts: [{ type: "text", text: `${Array(70).fill("story").join(" ")} ` }, { type: "grammar", id: "g1", exerciseType: "wordForm", knowledgePointId: "kp1", answer: "ended", baseForm: "end" }] }],
      chapterPractice: [], validationIssues: [],
    }]);
    expect(requirements).toEqual([{ outlineChapterId: "ch1", currentWordCount: 71, targetWordCount: 90, acceptedRange: [79, 120], aimRange: [83, 90], minimumNetWordsToAdd: 8, recommendedNetWordsToAddRange: [12, 19] }]);
  });

  test("builds a minimal joint reading and Main Idea context with English names only", () => {
    const context = buildReadingPromptContext(input);

    expect(context).toEqual({
      storyTitle: "Milo的冒险",
      storySummary: "Milo必须找回地图，才能带大家安全回家。",
      englishLevel: "A2",
      cefrWritingProfile: cefrWritingProfile("A2"),
      people: [{ role: "teacher", englishName: "Linda" }, { role: "student", englishName: "Milo" }],
      storyCharacters: [{ displayName: "Map Guardian", storyRole: "阻止Milo找到地图；守护错误路线的角色" }],
      chapters: [{
        id: "ch1", order: 1, title: "Milo出发", summary: "Linda帮助Milo。", targetWordCount: 90, acceptedWordCountRange: [79, 120], generationAimRange: [83, 90], paragraphCount: 2,
        grammarPoints: [{ key: "KP1", label: "一般过去时" }],
        knowledgePointUsagePlan: "一般过去时：用于描述Milo已经完成的开门动作。",
        exerciseCounts: { optionCloze: 2, wordForm: 1, vocabulary: 2 },
      }],
      mainIdea: { targetWordCount: 120, preferredRange: [115, 125], acceptedRange: [110, 130] },
    });
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("李老师");
    expect(serialized).not.toContain("小明");
    expect(serialized).not.toContain("touched");
    expect(serialized).not.toContain("chapterPractice");
    expect(serialized).not.toContain("afterClassPractice");
    expect(serialized).not.toContain("readingExerciseMode");
    expect(serialized).not.toContain("paragraphExerciseTargets");
    expect(serialized).toContain("已经完成的开门动作");
  });

  test("omits a stale Step 2 usage plan after the teacher changes chapter knowledge points", () => {
    const changedInput = structuredClone(input);
    changedInput.plan.chapters[0].knowledgePointIds = [];

    const context = buildReadingPromptContext(changedInput);

    expect(context.chapters[0]).not.toHaveProperty("knowledgePointUsagePlan");
  });

  test("builds exercise context without outline, people, reading settings, or touched state", () => {
    const context = buildExercisePromptContext(input, [{ outlineChapterId: "ch1", title: "Milo出发", cleanText: "Milo opened the door." }]);

    expect(context).toEqual({
      englishLevel: "A2",
      cefrWritingProfile: cefrWritingProfile("A2"),
      chapters: [{ id: "ch1", title: "Milo出发", cleanText: "Milo opened the door.", grammarPoints: [{ key: "KP1", label: "一般过去时" }], counts: { optionCloze: 3, wordForm: 2 } }],
      homework: { enabled: true, grammarPoints: [{ key: "KP1", label: "一般过去时" }], counts: { optionCloze: 2, wordForm: 2 } },
    });
    expect(JSON.stringify(context)).not.toContain("paragraphCount");
  });

  test("converts persisted failed chapters back to the clean AI reading contract before repair", () => {
    const context = buildReadingRepairPromptContext(input, [{
      id: "chapter-ch1", outlineChapterId: "ch1", order: 1, title: "Milo出发", targetWordCount: 90, readingExerciseMode: "interactive",
      paragraphs: [{ id: "paragraph-ch1-1", parts: [
        { type: "text", text: "Yesterday, Milo " },
        { type: "grammar", id: "grammar-1", exerciseType: "optionCloze", knowledgePointId: "kp1", answer: "found", options: ["finds", "found", "will find"] },
        { type: "grammar", id: "grammar-2", exerciseType: "wordForm", knowledgePointId: "kp1", answer: "opened", baseForm: "open" },
        { type: "vocabulary", id: "vocabulary-1", answer: "hidden door", canonicalForm: "hidden door", meaningZh: "隐藏的门" },
      ] }], chapterPractice: [], validationIssues: ["旧错误"],
    }]);

    expect(context).toEqual([{ outlineChapterId: "ch1", paragraphs: [{ parts: [
      { type: "text", text: "Yesterday, Milo " },
      { type: "grammar", exerciseType: "optionCloze", knowledgePointKey: "KP1", answer: "found", distractors: ["finds", "will find"] },
      { type: "grammar", exerciseType: "wordForm", knowledgePointKey: "KP1", answer: "opened", baseForm: "open" },
      { type: "vocabulary", answer: "hidden door", canonicalForm: "hidden door", meaningZh: "隐藏的门" },
    ] }] }]);
    expect(JSON.stringify(context)).not.toContain("knowledgePointId");
    expect(JSON.stringify(context)).not.toContain("validationIssues");
    expect(JSON.stringify(context)).not.toContain('"options"');
  });

  test("builds isolated modification contexts", () => {
    expect(buildModificationPromptContext("paragraph", { id: "p1" }, "改得更紧张", { anchorTypes: ["grammar"] }, { chapterText: "Full chapter" })).toEqual({
      targetType: "paragraph", target: { id: "p1" }, instruction: "改得更紧张", constraints: { anchorTypes: ["grammar"] }, chapterText: "Full chapter",
    });
    expect(buildModificationPromptContext("main_idea", { text: "Old" }, "更简洁", { acceptedRange: [130, 170] }, { cleanChapters: ["Story"] })).toEqual({
      targetType: "main_idea", target: { text: "Old" }, instruction: "更简洁", constraints: { acceptedRange: [130, 170] }, cleanChapters: ["Story"],
    });
    expect(buildModificationPromptContext("paragraph", { id: "p1" }, "改得更简单", {}, { englishLevel: "A1" })).toMatchObject({
      englishLevel: "A1",
      cefrWritingProfile: cefrWritingProfile("A1"),
    });
  });

  test("converts persisted modification targets to the same clean AI contract used for generation", () => {
    const parts = buildPromptParts(input, [
      { type: "text", text: "Yesterday, Milo " },
      { type: "grammar", id: "g1", exerciseType: "optionCloze", knowledgePointId: "kp1", answer: "found", options: ["finds", "found", "will find"] },
    ]);
    const questions = buildPromptQuestions(input, [{ id: "q1", type: "wordForm", knowledgePointId: "kp1", before: "Milo ", after: " home.", answer: "went", baseForm: "go" }]);

    expect(parts).toEqual([
      { type: "text", text: "Yesterday, Milo " },
      { type: "grammar", exerciseType: "optionCloze", knowledgePointKey: "KP1", answer: "found", distractors: ["finds", "will find"] },
    ]);
    expect(questions).toEqual([{ type: "wordForm", knowledgePointKey: "KP1", before: "Milo ", after: " home.", answer: "went", baseForm: "go" }]);
    expect(JSON.stringify({ parts, questions })).not.toContain("knowledgePointId");
    expect(JSON.stringify({ parts, questions })).not.toContain('"options"');
    expect(JSON.stringify({ parts, questions })).not.toContain('"id"');
  });
});
