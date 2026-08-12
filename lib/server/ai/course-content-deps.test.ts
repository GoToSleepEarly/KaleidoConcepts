import { describe, expect, test } from "vitest";

import type { TeachingPlanState } from "@/lib/contracts/api";
import {
  buildExercisePromptContext,
  buildModificationPromptContext,
  buildReadingPromptContext,
  buildReadingRepairRequirements,
  buildReadingRepairPromptContext,
  contentReadingTimeoutMs,
  courseContentPromptExamples,
  readingGrammarCoherenceRules,
  readingWordCountPolicy,
} from "@/lib/server/ai/course-content-deps";

const input = {
  course: { id: "c1", title: "李老师和小明的故事", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp1"] },
  outline: { id: "o1", title: "小明的冒险", chapters: [{ id: "ch1", order: 1, title: "小明出发", summary: "李老师帮助小明。", recommendedKnowledgePointIds: ["kp1"], knowledgePointRecommendationSummary: "推荐原因" }] },
  knowledgePoints: [{ id: "kp1", label: "一般过去时" }],
  plan: {
    courseId: "c1", status: "confirmed", englishLevel: "A2",
    mainIdeaTargetWordCount: 120,
    chapters: [{ outlineChapterId: "ch1", targetWordCount: 90, paragraphCount: 2, knowledgePointIds: ["kp1"], readingExerciseMode: "interactive", readingExercises: { enabled: true, grammar: { optionCloze: 2, wordForm: 1 }, vocabulary: { chineseHint: 2 } }, chapterPractice: { enabled: true, grammar: { optionCloze: 3, wordForm: 2 } }, touched: { targetWordCount: true, paragraphCount: false, knowledgePointIds: true, readingExerciseMode: true, readingExercises: true, chapterPractice: true } }],
    afterClassPractice: { enabled: true, knowledgePointIds: ["kp1"], practice: { enabled: true, grammar: { optionCloze: 2, wordForm: 2 } }, touched: { knowledgePointIds: true, practice: true } },
    updatedAt: "", confirmedAt: "",
  },
  promptPeople: [
    { role: "teacher", chineseName: "李老师", englishName: "Linda" },
    { role: "student", chineseName: "小明", englishName: "Milo" },
  ],
} as TeachingPlanState & { promptPeople: Array<{ role: "teacher" | "student"; chineseName: string; englishName: string }> };

describe("course content prompt contexts", () => {
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
    expect(rules).toContain("主谓一致");
    expect(rules).toContain("拼接完整 clean text");
  });

  test("uses a longer timeout for the joint reading generation request", () => {
    expect(contentReadingTimeoutMs(undefined)).toBe(600_000);
    expect(contentReadingTimeoutMs("420000")).toBe(420_000);
  });

  test("gives generation and repair a safe word-count range instead of an ambiguous exact target", () => {
    expect(readingWordCountPolicy(100)).toEqual({ acceptedRange: [88, 112], aimRange: [105, 110] });
    const requirements = buildReadingRepairRequirements(input, [{
      id: "chapter-ch1", outlineChapterId: "ch1", order: 1, title: "Milo出发", targetWordCount: 90, readingExerciseMode: "interactive",
      paragraphs: [{ id: "paragraph-ch1-1", parts: [{ type: "text", text: `${Array(70).fill("story").join(" ")} ` }, { type: "grammar", id: "g1", exerciseType: "wordForm", knowledgePointId: "kp1", answer: "ended", baseForm: "end" }] }],
      chapterPractice: [], validationIssues: [],
    }]);
    expect(requirements).toEqual([{ outlineChapterId: "ch1", currentWordCount: 71, targetWordCount: 90, acceptedRange: [79, 101], aimRange: [95, 99], minimumNetWordsToAdd: 8, recommendedNetWordsToAddRange: [24, 28] }]);
  });

  test("builds a minimal joint reading and Main Idea context with English names only", () => {
    const context = buildReadingPromptContext(input);

    expect(context).toEqual({
      storyTitle: "Milo的冒险",
      englishLevel: "A2",
      people: [{ role: "teacher", englishName: "Linda" }, { role: "student", englishName: "Milo" }],
      chapters: [{
        id: "ch1", order: 1, title: "Milo出发", summary: "Linda帮助Milo。", targetWordCount: 90, acceptedWordCountRange: [79, 101], generationAimRange: [95, 99], paragraphCount: 2,
        grammarPoints: [{ key: "KP1", label: "一般过去时" }],
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
    expect(serialized).not.toContain("推荐原因");
  });

  test("builds exercise context without outline, people, reading settings, or touched state", () => {
    const context = buildExercisePromptContext(input, [{ outlineChapterId: "ch1", title: "Milo出发", cleanText: "Milo opened the door." }]);

    expect(context).toEqual({
      englishLevel: "A2",
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

    expect(context).toEqual([{ outlineChapterId: "ch1", title: "Milo出发", paragraphs: [{ parts: [
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
  });
});
