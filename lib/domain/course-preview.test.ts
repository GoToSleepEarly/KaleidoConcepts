import { describe, expect, it } from "vitest";

import type { CourseContentChapter } from "@/lib/contracts/api";
import { compilePreviewPages, pdfPagesForMode, previewPageAnswerText } from "@/lib/domain/course-preview";

const chapter: CourseContentChapter = {
  id: "chapter-1",
  outlineChapterId: "outline-1",
  order: 1,
  title: "新起点 / A New Start",
  targetWordCount: 100,
  readingExerciseMode: "interactive",
  paragraphs: [
    {
      id: "paragraph-1",
      parts: [
        { type: "text", text: "Summer " },
        { type: "grammar", id: "inline-1", exerciseType: "optionCloze", knowledgePointId: "past", answer: "went", options: ["go", "went", "gone"] },
        { type: "text", text: " home and " },
        { type: "grammar", id: "inline-2", exerciseType: "wordForm", knowledgePointId: "past", answer: "found", baseForm: "find" },
        { type: "text", text: " a " },
        { type: "vocabulary", id: "inline-3", answer: "clue", canonicalForm: "clue", meaningZh: "线索" },
        { type: "text", text: "." },
      ],
    },
  ],
  chapterPractice: [
    { id: "q1", type: "optionCloze", knowledgePointId: "past", before: "She ", after: " home.", answer: "went", options: ["go", "went"] },
    { id: "q2", type: "wordForm", knowledgePointId: "past", before: "She ", after: " it.", answer: "found", baseForm: "find" },
  ],
  validationIssues: [],
};

describe("compilePreviewPages", () => {
  it("keeps the old story slide sequence and adds each current exercise type", () => {
    const pages = compilePreviewPages({
      title: "夏天的谜题 / Summer's Mystery",
      teacherName: "Lin",
      studentNames: ["Summer"],
      knowledgePoints: [{ id: "past", label: "一般过去时" }],
      chapters: [chapter],
      mainIdea: { id: "main", title: "Main Idea", text: "Small clues can lead to big discoveries." },
      homework: {
        grammar: [
          { id: "h1", type: "optionCloze", knowledgePointId: "past", before: "They ", after: " early.", answer: "left", options: ["leave", "left"] },
          { id: "h2", type: "wordForm", knowledgePointId: "past", before: "They ", after: " a map.", answer: "made", baseForm: "make" },
        ],
        vocabularyMatching: [{ id: "v1", canonicalForm: "clue", meaningZh: "线索" }],
      },
      slots: [
        { id: "cover", slotType: "visual_cover", chapterId: null, paragraphId: null, publicUrl: "/cover.webp" },
        { id: "shot", slotType: "lesson_shot", chapterId: "chapter-1", paragraphId: "paragraph-1", publicUrl: "/shot.webp" },
      ],
    });

    expect(pages.map((page) => page.type)).toEqual([
      "cover_pure", "cover_title", "chapter_divider", "shot_image", "shot_text",
      "grammar_practice", "grammar_practice", "main_idea",
      "grammar_practice", "grammar_practice", "vocabulary_matching",
    ]);
    expect(pages.find((page) => page.type === "cover_title")).toMatchObject({ title: "夏天的谜题 / Summer's Mystery" });
    expect(pages.find((page) => page.type === "chapter_divider")).toMatchObject({ chapterTitleZh: "新起点", chapterTitleEn: "A New Start" });
    const reading = pages.find((page) => page.type === "shot_text");
    expect(reading).toMatchObject({
      type: "shot_text",
      parts: [
        { type: "text" },
        { type: "exercise", exerciseType: "optionCloze", knowledgePointLabel: "一般过去时", options: ["go", "went", "gone"] },
        { type: "text" },
        { type: "exercise", exerciseType: "wordForm", knowledgePointLabel: "一般过去时", hint: "find" },
        { type: "text" },
        { type: "exercise", exerciseType: "vocabulary", knowledgePointLabel: "词汇", hint: "线索，4个字母", meaningZh: "线索" },
        { type: "text" },
      ],
    });
    expect(reading ? previewPageAnswerText(reading) : null).toBe("1. went；2. found；3. clue");
    expect(pages.filter((page) => page.type === "grammar_practice").map((page) => [page.scope, page.exerciseType])).toEqual([
      ["chapter", "optionCloze"], ["chapter", "wordForm"],
      ["homework", "optionCloze"], ["homework", "wordForm"],
    ]);
    expect(pdfPagesForMode(pages, "content_and_exercises").map((page) => page.type)).toEqual([
      "shot_text",
      "grammar_practice",
      "grammar_practice",
      "main_idea",
      "grammar_practice",
      "grammar_practice",
      "vocabulary_matching",
    ]);
    expect(pdfPagesForMode(pages, "all")).toEqual(pages);
  });

  it("renders complete reading as plain text and uses the shared Step 4/Step 6 page limits", () => {
    const completeChapter = { ...chapter, readingExerciseMode: "complete" as const, chapterPractice: Array.from({ length: 9 }, (_, index) => ({ id: `q-${index}`, type: "optionCloze" as const, knowledgePointId: "past", before: "She ", after: ".", answer: "went", options: ["go", "went"] })) };
    const pages = compilePreviewPages({ title: "Course", teacherName: null, studentNames: [], knowledgePoints: [{ id: "past", label: "一般过去时" }], chapters: [completeChapter], mainIdea: null, homework: { grammar: [], vocabularyMatching: Array.from({ length: 6 }, (_, index) => ({ id: `v-${index}`, canonicalForm: `word-${index}`, meaningZh: `释义-${index}` })) }, slots: [] });
    const reading = pages.find((page) => page.type === "shot_text");
    expect(reading).toMatchObject({ type: "shot_text", readingExerciseMode: "complete" });
    expect(reading?.type === "shot_text" ? reading.parts.find((part) => part.type === "exercise" && part.answer === "went") : null).toMatchObject({ type: "exercise", answer: "went" });
    expect(pages.filter((page) => page.type === "grammar_practice").map((page) => [page.questions.length, page.questionStartNumber])).toEqual([[5, 1], [4, 6]]);
    expect(pages.filter((page) => page.type === "vocabulary_matching").map((page) => page.items.length)).toEqual([3, 3]);
  });
});
