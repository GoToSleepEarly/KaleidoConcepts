import { describe, expect, test } from "vitest";

import type { CourseContentChapter, CourseGrammarQuestion, TeachingPlan } from "@/lib/contracts/api";
import { exerciseContentSatisfiesPlan, visibleExerciseContent } from "@/lib/domain/course-exercises";

const question = (id: string, knowledgePointId: string): CourseGrammarQuestion => ({
  id,
  type: "optionCloze",
  knowledgePointId,
  before: "Before",
  after: "after.",
  answer: "went",
  options: ["went", "go", "going"],
});

const chapter = (practice: CourseGrammarQuestion[]): CourseContentChapter => ({
  id: "chapter-1",
  outlineChapterId: "outline-chapter-1",
  order: 1,
  title: "Chapter 1",
  targetWordCount: 90,
  readingExerciseMode: "interactive",
  paragraphs: [],
  chapterPractice: practice,
  validationIssues: [],
});

const plan = (chapterEnabled: boolean, homeworkEnabled: boolean): TeachingPlan => ({
  courseId: "course-1",
  status: "confirmed",
  englishLevel: "B1",
  updatedAt: "2026-09-20T00:00:00.000Z",
  confirmedAt: "2026-09-20T00:00:00.000Z",
  chapters: [{
    outlineChapterId: "outline-chapter-1",
    targetWordCount: 90,
    paragraphCount: 2,
    knowledgePointIds: ["grammar-1"],
    readingExerciseMode: "interactive",
    readingExercises: { enabled: true, grammar: { enabledTypes: ["optionCloze"], total: 1 }, vocabulary: { enabledTypes: ["chineseHint"], total: 0 } },
    chapterPractice: { enabled: chapterEnabled, grammar: { enabledTypes: ["optionCloze"], total: 1 } },
    touched: { targetWordCount: true, paragraphCount: true, readingExerciseMode: true, readingExercises: true, chapterPractice: true },
  }],
  afterClassPractice: {
    enabled: homeworkEnabled,
    vocabularyReviewEnabled: false,
    knowledgePointIds: ["grammar-1"],
    practice: { enabled: homeworkEnabled, enabledTypes: ["optionCloze"], questionsPerKnowledgePoint: 1 },
    touched: { knowledgePointIds: true, practice: true },
  },
});

describe("course exercise reuse", () => {
  test("disabled chapter and homework exercises need no regeneration and are hidden without deleting the cache", () => {
    const chapters = [chapter([question("chapter-question", "grammar-1")])];
    const homework = { grammar: [question("homework-question", "grammar-1")], vocabularyMatching: [] };

    expect(exerciseContentSatisfiesPlan(plan(false, false), chapters, homework)).toBe(true);
    expect(visibleExerciseContent(plan(false, false), chapters, homework)).toEqual({
      chapters: [expect.objectContaining({ chapterPractice: [] })],
      homework: null,
    });
    expect(chapters[0].chapterPractice).toHaveLength(1);
    expect(homework.grammar).toHaveLength(1);
  });

  test("reuses cached chapter and homework exercises when they still match the enabled plan", () => {
    const chapters = [chapter([question("chapter-question", "grammar-1")])];
    const homework = { grammar: [question("homework-question", "grammar-1")], vocabularyMatching: [] };

    expect(exerciseContentSatisfiesPlan(plan(true, true), chapters, homework)).toBe(true);
  });

  test("requires regeneration when an enabled chapter exercise cache no longer matches", () => {
    const changed = plan(true, false);
    changed.chapters[0].chapterPractice.grammar.total = 2;

    expect(exerciseContentSatisfiesPlan(changed, [chapter([question("chapter-question", "grammar-1")])], null)).toBe(false);
  });
});
