import { describe, expect, test, vi } from "vitest";

import type { CourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { exerciseQuestionIssues, generateCourseExercises, generateCourseReading, requiresExerciseAi, resetCourseContent, type CourseContentDb } from "@/lib/server/repositories/course-content";

describe("course content repository", () => {
  test("skips the exercise AI stage when Step 3 has no grammar exercises", () => {
    const plan = {
      chapters: [{ chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } } }],
      afterClassPractice: { enabled: false, practice: { grammar: { optionCloze: 0, wordForm: 0 } } },
    };

    expect(requiresExerciseAi(plan as never)).toBe(false);
    expect(requiresExerciseAi({
      ...plan,
      chapters: [{ chapterPractice: { enabled: true, grammar: { optionCloze: 1, wordForm: 0 } } }],
    } as never)).toBe(true);
  });

  test("describes exercise validation issues with teacher-facing labels and exact counts", () => {
    const issues = exerciseQuestionIssues(
      [{ id: "kp-1", label: "一般过去时" }, { id: "kp-2", label: "现在进行时" }],
      ["kp-1", "kp-2"],
      { optionCloze: 2, wordForm: 1 },
      [{ id: "q1", type: "optionCloze", knowledgePointId: "kp-1", before: "Mia ", after: " home.", answer: "went", options: ["went", "goes", "going"] }],
    );

    expect(issues).toEqual([
      "未覆盖知识点：现在进行时",
      "选项填空数量应为 2，实际 1",
      "给词变形数量应为 1，实际 0",
    ]);
    expect(issues.join(" ")).not.toContain("kp-2");
    expect(issues.join(" ")).not.toContain("optionCloze");
    expect(issues.join(" ")).not.toContain("wordForm");
  });

  test("aggregates repeated malformed exercise issues instead of printing one per question", () => {
    const issues = exerciseQuestionIssues(
      [{ id: "kp-1", label: "一般过去时" }],
      ["kp-1"],
      { optionCloze: 2, wordForm: 2 },
      [
        { id: "q1", type: "optionCloze", knowledgePointId: "kp-1", before: "A ", after: ".", answer: "went", options: ["went"] },
        { id: "q2", type: "optionCloze", knowledgePointId: "kp-1", before: "B ", after: ".", answer: "saw" },
        { id: "q3", type: "wordForm", knowledgePointId: "kp-1", before: "C ", after: ".", answer: "found" },
        { id: "q4", type: "wordForm", knowledgePointId: "kp-1", before: "D ", after: ".", answer: "made" },
      ],
    );

    expect(issues).toEqual([
      "2 道选项填空的选项结构无效",
      "2 道给词变形缺少原形提示",
    ]);
  });

  test("keeps the Prisma transaction method bound while resetting Step 4", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 45, currentStage: "content", englishLevel: "B1", knowledgePointIds: ["kp-1"] };
    const emptyContent = {
      id: "content-2", courseId: "course-1", status: "empty", phase: null, writingProvider: "quickrouter_gpt",
      sourceRevision: "r2", contentVersion: 0, chapters: [], mainIdea: null, homework: null, exercisesStale: false,
      errorMessage: null, updatedAt: now,
    };
    const deleteMessages = vi.fn(async () => ({ count: 1 }));
    const deleteGenerations = vi.fn(async () => ({ count: 1 }));
    const deleteContent = vi.fn(async () => ({ count: 1 }));
    const db = {
      _engineConfig: "available",
      course: { findUnique: vi.fn(async () => course), update: vi.fn(async () => course) },
      courseStoryOutline: { findUnique: vi.fn(async () => ({ id: "outline-1", title: "Hidden Door", chapters: [{ id: "chapter-1", order: 1, title: "The Map", storyGoal: "Find it", keyEvents: ["Find it"], recommendedKnowledgePointIds: ["kp-1"] }] })) },
      courseTeachingPlan: { findUnique: vi.fn(async () => ({ id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "B1", chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 90, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 1, wordForm: 0 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { targetWordCount: false, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false } }], afterClassPractice: { enabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { knowledgePointIds: false, practice: false } }, updatedAt: now, confirmedAt: now })) },
      presetOption: { findMany: vi.fn(async () => [{ id: "kp-1", kind: "grammar", label: "Past Simple", category: "时态", archivedAt: null }]) },
      courseLessonContent: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => emptyContent), deleteMany: deleteContent },
      courseContentGeneration: { findUnique: vi.fn(async () => null), deleteMany: deleteGenerations },
      courseContentChatMessage: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []), deleteMany: deleteMessages },
      $transaction: vi.fn(function (this: { _engineConfig: string }, callback: (tx: CourseContentDb) => Promise<unknown>) {
        if (!this._engineConfig) throw new TypeError("Cannot read properties of undefined (reading '_engineConfig')");
        return callback(db as unknown as CourseContentDb);
      }),
    };

    const result = await resetCourseContent(db as unknown as CourseContentDb, "course-1");

    expect(result.status).toBe("empty");
    expect(deleteMessages).toHaveBeenCalled();
    expect(deleteGenerations).toHaveBeenCalled();
    expect(deleteContent).toHaveBeenCalled();
  });

  test("generates chapters and Main Idea together, then repairs only an invalid Main Idea", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp-1"] };
    const outline = { id: "outline-1", title: "隐藏的门 / The Hidden Door", chapters: [{ id: "chapter-1", order: 1, title: "发光地图 / The Glowing Map", storyGoal: "Find it", keyEvents: ["Find it"], recommendedKnowledgePointIds: ["kp-1"] }] };
    const plan = { id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "A2", chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 50, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 0, wordForm: 1 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { targetWordCount: false, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false } }], afterClassPractice: { enabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { knowledgePointIds: false, practice: false } }, updatedAt: now, confirmedAt: now };
    let content = { id: "content-1", courseId: "course-1", status: "empty", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "", contentVersion: 0, chapters: [] as unknown[], mainIdea: null as unknown, homework: null, exercisesStale: false, errorMessage: null as string | null, updatedAt: now };
    let generation: Record<string, unknown> | null = null;
    const applyData = (current: Record<string, unknown>, data: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...current, ...data }).map(([key, value]) => [key, typeof value === "object" && value && "increment" in value ? Number(current[key] ?? 0) + Number(Reflect.get(value, "increment")) : value]));
    const messages: Array<{ id: string; role: "teacher" | "assistant" | "system"; content: string; createdAt: Date }> = [];
    const db = {
      course: { findUnique: vi.fn(async () => course), update: vi.fn(async () => course) },
      courseStoryOutline: { findUnique: vi.fn(async () => outline) },
      courseTeachingPlan: { findUnique: vi.fn(async () => plan) },
      presetOption: { findMany: vi.fn(async () => [{ id: "kp-1", kind: "grammar", label: "Past Simple", category: "时态", archivedAt: null }]) },
      courseLessonContent: {
        findUnique: vi.fn(async () => content),
        upsert: vi.fn(async () => content),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { content = applyData(content, data) as typeof content; content.updatedAt = now; return content; }),
      },
      courseContentGeneration: {
        findUnique: vi.fn(async () => generation),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { id: "generation-1", status: "running", ...data }; return generation; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { ...generation, ...data }; return generation; }),
      },
      courseContentChatMessage: {
        findUnique: vi.fn(async () => null),
        findMany: vi.fn(async () => messages),
        create: vi.fn(async ({ data }: { data: Omit<(typeof messages)[number], "id" | "createdAt"> }) => { const message = { id: `m${messages.length + 1}`, createdAt: now, ...data }; messages.push(message); return message; }),
      },
    } as unknown as CourseContentDb;
    const generatedText = `${Array.from({ length: 48 }, (_, index) => `word${index + 1}`).join(" ")} `;
    const generateReading = vi.fn(async () => ({
      chapters: [{ outlineChapterId: "chapter-1", title: "Chapter 1", paragraphs: [{ parts: [{ type: "text" as const, text: generatedText }, { type: "grammar" as const, exerciseType: "wordForm" as const, knowledgePointKey: "KP1", answer: "found", baseForm: "find" }] }] }],
      mainIdea: { title: "Main Idea", text: Array(178).fill("summary").join(" ") },
    }));
    const repairMainIdea = vi.fn(async () => ({ title: "Main Idea", text: Array(120).fill("summary").join(" ") }));
    const generateExercises = vi.fn();
    const deps = { generateReading, repairMainIdea, generateExercises } as unknown as CourseContentGenerationDeps;

    const result = await generateCourseReading(db, "course-1", "request-1", deps);
    const exerciseResult = await generateCourseExercises(db, "course-1", "request-2", deps);

    expect(result.status).toBe("ready");
    expect(result.chapters[0]?.title).toBe("发光地图 / The Glowing Map");
    expect(exerciseResult.status).toBe("ready");
    expect(generateReading).toHaveBeenCalledTimes(1);
    expect(generateExercises).not.toHaveBeenCalled();
    expect(repairMainIdea).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)?.content).toContain("单独修复 Main Idea");
  });
});
