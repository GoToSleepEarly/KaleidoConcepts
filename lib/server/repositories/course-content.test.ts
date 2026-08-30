import { describe, expect, test, vi } from "vitest";

import type { CourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { CourseContentConflictError, courseContentSemanticRepairAttempts, exerciseQuestionIssues, generateCourseExercises, generateCourseReading, modifyCourseContent, recoverStaleCourseContentOperation, requiresExerciseAi, resetCourseContent, type CourseContentDb } from "@/lib/server/repositories/course-content";

describe("course content repository", () => {
  test("allows at most one semantic repair per generation stage", () => {
    expect(courseContentSemanticRepairAttempts).toBe(1);
  });
  test("skips the exercise AI stage when Step 3 has no grammar exercises", () => {
    const plan = {
      chapters: [{ chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } } }],
      afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } } },
    };

    expect(requiresExerciseAi(plan as never)).toBe(false);
    expect(requiresExerciseAi({ ...plan, afterClassPractice: { ...plan.afterClassPractice, enabled: true, vocabularyReviewEnabled: true } } as never)).toBe(false);
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

  test("releases an expired generation lease instead of leaving the stage locked", async () => {
    const now = new Date("2026-08-15T06:00:00.000Z");
    let content = {
      id: "content-1", courseId: "course-1", status: "generating_reading", phase: "generating_chapters",
      writingProvider: "quickrouter_gpt", sourceRevision: "r1", contentVersion: 0, chapters: [], mainIdea: null,
      homework: null, exercisesStale: false, errorMessage: null, activeGenerationId: "generation-1", updatedAt: now,
    };
    let generation = {
      id: "generation-1", courseId: "course-1", operation: "reading", status: "running", baseContentVersion: 0,
      previousStatus: "empty", leaseExpiresAt: new Date("2026-08-15T05:59:00.000Z"), startedAt: new Date("2026-08-15T05:50:00.000Z"), updatedAt: now,
    };
    const db = {
      courseLessonContent: {
        findUnique: vi.fn(async () => content),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (where.activeGenerationId !== content.activeGenerationId) return { count: 0 };
          content = { ...content, ...data } as typeof content;
          return { count: 1 };
        }),
      },
      courseContentGeneration: {
        findUnique: vi.fn(async () => generation),
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          generation = { ...generation, ...data } as typeof generation;
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (callback: (tx: CourseContentDb) => Promise<unknown>) => callback(db as unknown as CourseContentDb)),
    } as unknown as CourseContentDb;

    expect(await recoverStaleCourseContentOperation(db, "course-1", now)).toBe(true);
    expect(generation.status).toBe("result_unknown");
    expect(content.status).toBe("failed");
    expect(content.activeGenerationId).toBeNull();
    expect(content.errorMessage).toContain("处理已中断");
  });

  test("blocks a second write operation while a modification lease is active", async () => {
    const now = new Date("2026-08-15T06:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp-1"] };
    const outline = { id: "outline-1", title: "Hidden Door", summary: "A hidden door", chapters: [{ id: "chapter-1", order: 1, title: "The Map", storyGoal: "Find it", keyEvents: ["Find it"], recommendedKnowledgePointIds: ["kp-1"] }] };
    const plan = { id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "A2", mainIdeaTargetWordCount: 120, chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 50, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 0, wordForm: 0 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }], afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }, updatedAt: now, confirmedAt: now };
    const content = { id: "content-1", courseId: "course-1", status: "ready", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "r1", contentVersion: 1, chapters: [{ id: "chapter-chapter-1", outlineChapterId: "chapter-1", order: 1, title: "The Map", targetWordCount: 50, readingExerciseMode: "complete", paragraphs: [{ id: "p1", parts: [{ type: "text", text: "A complete paragraph." }] }], chapterPractice: [], validationIssues: [] }], mainIdea: { id: "main-idea", title: "Main Idea", text: "A summary." }, homework: null, exercisesStale: false, errorMessage: null, activeGenerationId: "generation-1", updatedAt: now };
    const activeGeneration = { id: "generation-1", courseId: "course-1", operation: "modify", status: "running", baseContentVersion: 1, previousStatus: "ready", leaseExpiresAt: new Date(Date.now() + 60_000), startedAt: now, updatedAt: now };
    const db = {
      course: { findUnique: vi.fn(async () => course), update: vi.fn(async () => course) },
      courseStoryOutline: { findUnique: vi.fn(async () => outline) },
      courseTeachingPlan: { findUnique: vi.fn(async () => plan) },
      presetOption: { findMany: vi.fn(async () => [{ id: "kp-1", kind: "grammar", label: "Past Simple", category: "时态", archivedAt: null }]) },
      courseLessonContent: { findUnique: vi.fn(async () => content), upsert: vi.fn(async () => content) },
      courseContentGeneration: { findUnique: vi.fn(async () => activeGeneration) },
      courseContentChatMessage: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback: (tx: CourseContentDb) => Promise<unknown>) => callback(db as unknown as CourseContentDb)),
    } as unknown as CourseContentDb;
    const modifyContent = vi.fn();

    await expect(modifyCourseContent(db, "course-1", { targetType: "paragraph", targetId: "p1", instruction: "写得更紧张" }, "request-2", { modifyContent } as unknown as CourseContentGenerationDeps)).rejects.toBeInstanceOf(CourseContentConflictError);
    expect(modifyContent).not.toHaveBeenCalled();
  });

  test("rejects a late modification result after reset invalidates its operation", async () => {
    const now = new Date("2026-08-15T06:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp-1"] };
    const outline = { id: "outline-1", title: "Hidden Door", summary: "A hidden door", chapters: [{ id: "chapter-1", order: 1, title: "The Map", storyGoal: "Find it", keyEvents: ["Find it"], recommendedKnowledgePointIds: ["kp-1"] }] };
    const plan = { id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "A2", mainIdeaTargetWordCount: 120, chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 50, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 0, wordForm: 0 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }], afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }, updatedAt: now, confirmedAt: now };
    let content: Record<string, unknown> = { id: "content-1", courseId: "course-1", status: "ready", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "r1", contentVersion: 1, chapters: [{ id: "chapter-chapter-1", outlineChapterId: "chapter-1", order: 1, title: "The Map", targetWordCount: 50, readingExerciseMode: "complete", paragraphs: [{ id: "p1", parts: [{ type: "text", text: "A complete paragraph." }] }], chapterPractice: [], validationIssues: [] }], mainIdea: { id: "main-idea", title: "Main Idea", text: "A summary." }, homework: null, exercisesStale: false, errorMessage: null, activeGenerationId: null, updatedAt: now };
    let generation: Record<string, unknown> | null = null;
    const applyData = (current: Record<string, unknown>, data: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...current, ...data }).map(([key, value]) => [key, typeof value === "object" && value && "increment" in value ? Number(current[key] ?? 0) + Number(Reflect.get(value, "increment")) : value]));
    const db = {
      course: { findUnique: vi.fn(async () => course), update: vi.fn(async () => course) },
      courseStoryOutline: { findUnique: vi.fn(async () => outline) },
      courseTeachingPlan: { findUnique: vi.fn(async () => plan) },
      presetOption: { findMany: vi.fn(async () => [{ id: "kp-1", kind: "grammar", label: "Past Simple", category: "时态", archivedAt: null }]) },
      courseLessonContent: {
        findUnique: vi.fn(async () => content), upsert: vi.fn(async () => content),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if ("activeGenerationId" in where && where.activeGenerationId !== content.activeGenerationId) return { count: 0 };
          if ("contentVersion" in where && where.contentVersion !== content.contentVersion) return { count: 0 };
          content = applyData(content, data); return { count: 1 };
        }),
      },
      courseContentGeneration: {
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => "id" in where ? generation : null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { id: "generation-1", status: "running", updatedAt: now, ...data }; return generation; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = generation ? { ...generation, ...data } : null; return generation; }),
        updateMany: vi.fn(async () => ({ count: generation ? 1 : 0 })),
      },
      courseContentChatMessage: { findMany: vi.fn(async () => []), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "message-1", createdAt: now, ...data })) },
      $transaction: vi.fn(async (callback: (tx: CourseContentDb) => Promise<unknown>) => callback(db as unknown as CourseContentDb)),
    } as unknown as CourseContentDb;
    let resolveModification!: (value: unknown) => void;
    const modifyContent = vi.fn(() => new Promise((resolve) => { resolveModification = resolve; }));

    const pending = modifyCourseContent(db, "course-1", { targetType: "paragraph", targetId: "p1", instruction: "写得更紧张" }, "request-1", { modifyContent } as unknown as CourseContentGenerationDeps);
    await vi.waitFor(() => expect(modifyContent).toHaveBeenCalled());
    expect((modifyContent.mock.calls as unknown[][])[0]?.[5]).toMatchObject({ englishLevel: "A2" });
    content = { ...content, status: "empty", contentVersion: 0, chapters: [], mainIdea: null, activeGenerationId: null };
    generation = null;
    resolveModification({ kind: "paragraph", paragraph: { parts: [{ type: "text", text: "A tense new paragraph." }] } });

    await expect(pending).rejects.toMatchObject({ name: "CourseContentSupersededError" });
    expect(content.chapters).toEqual([]);
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
      courseTeachingPlan: { findUnique: vi.fn(async () => ({ id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "B1", chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 90, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 1, wordForm: 0 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { targetWordCount: false, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false } }], afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { knowledgePointIds: false, practice: false } }, updatedAt: now, confirmedAt: now })) },
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

  test("generates chapters and Main Idea together, then uses the one shared repair budget for an invalid Main Idea", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp-1"], storySetting: { storyComplexity: "clear_linear", alignmentDetails: { schemaVersion: 2, requirement: { kind: "resolved", storyMode: "new_story", classroomPresence: "participant", brief: { kind: "concept", objective: "理解重力", learningTargets: [{ concept: "重力", expectedUnderstanding: "物体之间会相互吸引" }], assumedPriorKnowledge: [], sourceRequirements: [], requiredNamedCharacters: [], fixedPlot: null, additionalConstraints: { required: [], preferred: [], excluded: [] } } } } } };
    const outline = { id: "outline-1", title: "隐藏的门 / The Hidden Door", chapters: [{ id: "chapter-1", order: 1, title: "发光地图 / The Glowing Map", storyGoal: "Find it", keyEvents: ["Find it"], recommendedKnowledgePointIds: ["kp-1"] }] };
    const plan = { id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "A2", chapters: [{ outlineChapterId: "chapter-1", targetWordCount: 50, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 0, wordForm: 1 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { targetWordCount: false, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false } }], afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: { knowledgePointIds: false, practice: false } }, updatedAt: now, confirmedAt: now };
    let content = { id: "content-1", courseId: "course-1", status: "empty", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "", contentVersion: 0, chapters: [] as unknown[], mainIdea: null as unknown, homework: null, exercisesStale: false, errorMessage: null as string | null, updatedAt: now };
    let generation: Record<string, unknown> | null = null;
    const applyData = (current: Record<string, unknown>, data: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...current, ...data }).map(([key, value]) => [key, typeof value === "object" && value && "increment" in value ? Number(current[key] ?? 0) + Number(Reflect.get(value, "increment")) : value]));
    const messages: Array<{ id: string; role: "teacher" | "assistant" | "system"; content: string; kind?: string; status?: string; operation?: string; requestId?: string; title?: string; eventKey?: string; createdAt: Date }> = [];
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
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if ("id" in where) return generation;
          const requestedOperation = Reflect.get(Reflect.get(where, "courseId_sourceRevision_operation") ?? {}, "operation");
          return generation && generation.operation === requestedOperation ? generation : null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { id: "generation-1", status: "running", ...data }; return generation; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { ...generation, ...data }; return generation; }),
      },
      courseContentChatMessage: {
        findUnique: vi.fn(async () => null),
        findMany: vi.fn(async () => messages),
        create: vi.fn(async ({ data }: { data: Omit<(typeof messages)[number], "id" | "createdAt"> }) => { const message = { id: `m${messages.length + 1}`, createdAt: now, ...data }; messages.push(message); return message; }),
      },
    } as unknown as CourseContentDb;
    const generatedText = `${Array.from({ length: 49 }, (_, index) => `word${index + 1}`).join(" ")} `;
    const generateReading = vi.fn(async () => ({
      envelopeError: null,
      chapters: [{ outlineChapterId: "chapter-1", generated: { outlineChapterId: "chapter-1", paragraphs: [{ template: `${generatedText}{{WF1}}` }], slots: [{ id: "WF1", kind: "wordForm" as const, knowledgePointKey: "G1", answer: "found", cue: "find" }] }, parseError: null }],
      mainIdea: { title: "Main Idea", text: Array(178).fill("summary").join(" ") },
      mainIdeaError: null,
    }));
    const repairReading = vi.fn(async () => ({ contractVersion: "step4.content.v4" as const, repairs: [], mainIdea: { text: Array(120).fill("summary").join(" ") } }));
    const generateExercises = vi.fn();
    const deps = { generateReading, repairReading, generateExercises } as unknown as CourseContentGenerationDeps;

    const result = await generateCourseReading(db, "course-1", "request-1", deps, { writingProvider: "quickrouter_deepseek" });
    const exerciseResult = await generateCourseExercises(db, "course-1", "request-2", deps);

    expect(result.status).toBe("ready");
    expect(result.chapters[0]?.title).toBe("发光地图 / The Glowing Map");
    expect(exerciseResult.status).toBe("ready");
    expect(generateReading).toHaveBeenCalledTimes(1);
    expect((generateReading.mock.calls as unknown[][])[0]?.[1]).toBe("quickrouter_deepseek");
    expect(result.writingProvider).toBe("quickrouter_deepseek");
    expect((generateReading.mock.calls as unknown[][])[0]?.[0]).toMatchObject({ contentIntent: { kind: "concept", objective: "理解重力", learningTargets: [{ expectedUnderstanding: "物体之间会相互吸引" }] } });
    expect(generateExercises).not.toHaveBeenCalled();
    expect(repairReading).toHaveBeenCalledTimes(1);
    expect((repairReading.mock.calls as unknown[][])[0]?.[2]).toEqual([]);
    expect((repairReading.mock.calls as unknown[][])[0]?.[3]).toMatchObject({ issues: [expect.stringContaining("Main Idea")] });
    expect(result.mainIdea?.title).toBe("Main Idea Reading Practice");
    expect(messages.some((message) => message.content.includes("一次统一修复全部失败位置"))).toBe(true);
    expect(messages.map((message) => message.content)).toContain("我确认阅读内容，请生成章节与课后练习。");
    expect(messages.filter((message) => message.requestId === "request-1" && message.kind === "operation").map((message) => message.status)).toEqual(["running", "succeeded"]);
    expect(messages.filter((message) => message.requestId === "request-2" && message.kind === "operation").map((message) => message.status)).toEqual(["running", "succeeded"]);
    expect(messages.find((message) => message.requestId === "request-1" && message.kind === "repair")).toMatchObject({ operation: "reading", title: "自动检查与修复" });
    expect(exerciseResult.messages.map((message) => message.content)).toEqual(messages.map((message) => message.content));
  });

  test("repairs one failed fixed-slot chapter once without replacing a successful chapter", async () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    const course = { id: "course-1", title: "Hidden Door", durationMinutes: 30, currentStage: "content", englishLevel: "A2", knowledgePointIds: ["kp-1"] };
    const outlineChapters = [1, 2].map((order) => ({ id: `chapter-${order}`, order, title: `Chapter ${order}`, summary: `Story event ${order}`, storyGoal: `Goal ${order}`, keyEvents: [`Event ${order}`], recommendedKnowledgePointIds: ["kp-1"], knowledgePointRecommendationSummary: "" }));
    const outline = { id: "outline-1", title: "Hidden Door", summary: "A team finds the door.", chapters: outlineChapters };
    const planChapters = outlineChapters.map((chapter) => ({ outlineChapterId: chapter.id, targetWordCount: 50, paragraphCount: 1, knowledgePointIds: ["kp-1"], readingExerciseMode: "complete", readingExercises: { enabled: true, grammar: { optionCloze: 0, wordForm: 1 }, vocabulary: { chineseHint: 0 } }, chapterPractice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }));
    const plan = { id: "plan-1", courseId: "course-1", status: "confirmed", englishLevel: "A2", mainIdeaTargetWordCount: 120, chapters: planChapters, afterClassPractice: { enabled: false, vocabularyReviewEnabled: false, knowledgePointIds: [], practice: { enabled: false, grammar: { optionCloze: 0, wordForm: 0 } }, touched: {} }, updatedAt: now, confirmedAt: now };
    let content = { id: "content-1", courseId: "course-1", status: "empty", phase: null, writingProvider: "quickrouter_gpt", sourceRevision: "", contentVersion: 0, chapters: [] as unknown[], mainIdea: null as unknown, homework: null, exercisesStale: false, errorMessage: null as string | null, updatedAt: now };
    let generation: Record<string, unknown> | null = null;
    const applyData = (current: Record<string, unknown>, data: Record<string, unknown>) => Object.fromEntries(Object.entries({ ...current, ...data }).map(([key, value]) => [key, typeof value === "object" && value && "increment" in value ? Number(current[key] ?? 0) + Number(Reflect.get(value, "increment")) : value]));
    const db = {
      course: { findUnique: vi.fn(async () => course), update: vi.fn(async () => course) },
      courseStoryOutline: { findUnique: vi.fn(async () => outline) },
      courseTeachingPlan: { findUnique: vi.fn(async () => plan) },
      presetOption: { findMany: vi.fn(async () => [{ id: "kp-1", kind: "grammar", label: "Past Simple", category: "时态", archivedAt: null }]) },
      courseLessonContent: { findUnique: vi.fn(async () => content), upsert: vi.fn(async () => content), update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { content = applyData(content, data) as typeof content; return content; }) },
      courseContentGeneration: {
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => "id" in where ? generation : null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { id: "generation-1", status: "running", ...data }; return generation; }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { generation = { ...generation, ...data }; return generation; }),
      },
      courseContentChatMessage: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "message-1", createdAt: now, ...data })) },
      aiGenerationLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "ai-log", ...data })) },
    } as unknown as CourseContentDb;
    const words = Array.from({ length: 49 }, (_, index) => `word${index + 1}`).join(" ");
    const generatedChapter = (id: string, template: string) => ({ outlineChapterId: id, paragraphs: [{ template }], slots: [{ id: "WF1", kind: "wordForm" as const, knowledgePointKey: "G1", answer: "found", cue: "find" }] });
    const chapter1 = generatedChapter("chapter-1", `${words} {{WF1}}`);
    const chapter2 = generatedChapter("chapter-2", `${words} stayed`);
    const generateReading = vi.fn(async () => ({ envelopeError: null, chapters: [
      { outlineChapterId: "chapter-1", generated: chapter1, parseError: null },
      { outlineChapterId: "chapter-2", generated: chapter2, parseError: null },
    ], mainIdea: { text: Array(120).fill("summary").join(" ") }, mainIdeaError: null, candidateUsage: { inputTokens: 70, outputTokens: 50, visibleOutputTokens: 45, reasoningTokens: 5, totalTokens: 120 }, usage: { inputTokens: 100, outputTokens: 80, visibleOutputTokens: 60, reasoningTokens: 20, totalTokens: 180 } }));
    const repairReading = vi.fn(async () => ({ contractVersion: "step4.content.v4" as const, repairs: [{ kind: "paragraph" as const, outlineChapterId: "chapter-2", paragraphIndex: 0, template: `${words} {{WF1}}`, slots: [] }], usage: { inputTokens: 40, outputTokens: 20, visibleOutputTokens: 15, reasoningTokens: 5, totalTokens: 60 } }));
    const deps = { generateReading, repairReading } as unknown as CourseContentGenerationDeps;

    const result = await generateCourseReading(db, "course-1", "request-1", deps);

    expect(result.status).toBe("ready");
    expect(repairReading).toHaveBeenCalledTimes(1);
    expect((repairReading.mock.calls as unknown[][])[0]?.[2]).toHaveLength(1);
    expect(Reflect.get((repairReading.mock.calls as unknown[][])[0]?.[2] as object, "0")).toMatchObject({ requirements: { outlineChapterId: "chapter-2" } });
    expect(result.chapters[0]?.paragraphs.flatMap((paragraph) => paragraph.parts).some((part) => part.type === "grammar" && part.answer === "found")).toBe(true);
    expect(result.chapters[1]?.validationIssues).toEqual([]);
    expect(db.aiGenerationLog?.create).toHaveBeenCalledTimes(3);
    expect(db.aiGenerationLog?.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "reading_v2_candidate", outputSnapshot: expect.objectContaining({ tokenUsage: expect.objectContaining({ totalTokens: 120 }), phase: "candidate_positions" }) }) });
    expect(db.aiGenerationLog?.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "reading_v2_final", outputSnapshot: expect.objectContaining({ tokenUsage: expect.objectContaining({ totalTokens: 180 }), firstPassReady: false }) }) });
    expect(db.aiGenerationLog?.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "reading_v2_repair", outputSnapshot: expect.objectContaining({ tokenUsage: expect.objectContaining({ totalTokens: 60 }), resolvedChapterCount: 1 }) }) });
  });
});
