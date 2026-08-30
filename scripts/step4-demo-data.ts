import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getCourseContentState } from "../lib/server/repositories/course-content";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DEMO_PREFIX = "dev-step4-demo:";
const BOOK_EDITION_ID = "english-grammar-in-use-5";
const scenarios = ["empty", "reading-ready", "ready", "failed", "loading"] as const;
type Scenario = (typeof scenarios)[number];

const courseId = (scenario: Scenario) => `step4-demo-${scenario}`;
const outlineId = (scenario: Scenario) => `${courseId(scenario)}-outline`;
const chapterId = (scenario: Scenario, order: number) => `${courseId(scenario)}-outline-${order}`;

async function removeDemoCourses() {
  await prisma.course.deleteMany({ where: { idempotencyKey: { startsWith: DEMO_PREFIX } } });
}

function planChapters(scenario: Scenario, knowledgePointIds: string[]) {
  return [1, 2].map((order) => ({
    outlineChapterId: chapterId(scenario, order),
    targetWordCount: 100,
    paragraphCount: 2,
    knowledgePointIds: [knowledgePointIds[(order - 1) % knowledgePointIds.length]],
    readingExerciseMode: "interactive",
    readingExercises: { enabled: true, grammar: { optionCloze: 1, wordForm: 1 }, vocabulary: { chineseHint: 1 } },
    chapterPractice: { enabled: true, grammar: { optionCloze: 1, wordForm: 0 } },
    touched: { targetWordCount: false, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: false },
  }));
}

function generatedChapters(scenario: Scenario, knowledgePointIds: string[]) {
  return [1, 2].map((order) => ({
    id: `${courseId(scenario)}-content-${order}`,
    outlineChapterId: chapterId(scenario, order),
    order,
    title: order === 1 ? "The Silent Signal" : "The Safe Route",
    targetWordCount: 100,
    readingExerciseMode: "interactive",
    validationIssues: [],
    paragraphs: [1, 2].map((page) => ({
      id: `${courseId(scenario)}-paragraph-${order}-${page}`,
      parts: page === 1
        ? [
            { type: "text", text: `Mia and Leo reached signal tower ${order}. They ` },
            { type: "grammar", id: `g-${order}-${page}`, exerciseType: "wordForm", knowledgePointId: knowledgePointIds[(order - 1) % knowledgePointIds.length], answer: "found", baseForm: "find" },
            { type: "text", text: " a damaged " },
            { type: "vocabulary", id: `v-${order}-${page}`, answer: "warning light", canonicalForm: "warning light", meaningZh: "警示灯" },
            { type: "text", text: ". The clue pointed toward the foggy harbor." },
          ]
        : [{ type: "text", text: "They compared the old map with the flashing pattern, corrected the route, and sent a clear signal to the boat before it reached the rocks." }],
    })),
    chapterPractice: [{ id: `q-${order}`, type: "optionCloze", knowledgePointId: knowledgePointIds[(order - 1) % knowledgePointIds.length], before: "They ", after: " the correct switch.", answer: "found", options: ["found", "find", "finding"] }],
  }));
}

async function createBaseCourse(scenario: Scenario, knowledgePointIds: string[]) {
  const titles: Record<Scenario, string> = {
    empty: "[Step4验收] 01 初始待生成",
    "reading-ready": "[Step4验收] 02 正文待确认",
    ready: "[Step4验收] 03 完整内容与全部记录",
    failed: "[Step4验收] 04 失败恢复",
    loading: "[Step4验收] 05 刷新后加载中",
  };
  await prisma.course.create({
    data: {
      id: courseId(scenario),
      title: titles[scenario],
      durationMinutes: 45,
      englishLevel: "B1",
      grammarBookEditionId: BOOK_EDITION_ID,
      knowledgePointIds,
      currentStage: "content",
      idempotencyKey: `${DEMO_PREFIX}${scenario}`,
      storySetting: { create: { chapterCount: 2, storyComplexity: "conflict_driven", alignmentStatus: "confirmed", planningMode: "follow_defined_plot", alignmentSummary: "学生修复海港信号，引导返航船避开礁石。", alignmentConfirmedAt: new Date(), stateRevision: 1 } },
      storyOutline: {
        create: {
          id: outlineId(scenario),
          chapterCount: 2,
          title: "雾港信号 / The Signal in the Fog",
          summary: "Mia 和 Leo 发现海港返航信号被暴风雨破坏，必须在浓雾封锁航道前修好线路。",
          chapters: { create: [1, 2].map((order) => ({
            id: chapterId(scenario, order),
            order,
            title: order === 1 ? "沉默的信号 / The Silent Signal" : "安全航线 / The Safe Route",
            storyGoal: order === 1 ? "找到信号中断的原因并取得第一条线索。" : "修复航线并引导船只安全返航。",
            keyEvents: order === 1 ? ["抵达信号塔", "发现损坏线路", "找到旧地图"] : ["核对闪灯规律", "修复线路", "船只安全返航"],
            characterIds: [],
            setting: order === 1 ? "海港信号塔" : "雾中的海湾",
            endingHook: order === 1 ? "远处出现一艘正驶向礁石的船。" : "清晨的第一束光照亮了安全航线。",
            recommendedKnowledgePointIds: [knowledgePointIds[(order - 1) % knowledgePointIds.length]],
            knowledgePointRecommendationSummary: "用于描述已经发生的行动和发现。",
          })) },
        },
      },
      teachingPlan: {
        create: {
          status: "confirmed",
          englishLevel: "B1",
          mainIdeaTargetWordCount: 130,
          chapters: planChapters(scenario, knowledgePointIds),
          afterClassPractice: { enabled: true, vocabularyReviewEnabled: true, knowledgePointIds, practice: { enabled: true, grammar: { optionCloze: 1, wordForm: 1 } }, touched: { knowledgePointIds: false, practice: false } },
          confirmedAt: new Date(),
        },
      },
    },
  });
}

async function seedDemoCourses() {
  await removeDemoCourses();
  const points = await prisma.knowledgePoint.findMany({ where: { bookEditionId: BOOK_EDITION_ID, source: "grammar_in_use" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 2, select: { id: true } });
  if (points.length < 2) throw new Error("语法知识点不足，请先运行 pnpm prisma:seed");
  const knowledgePointIds = points.map((point) => point.id);
  for (const scenario of scenarios) await createBaseCourse(scenario, knowledgePointIds);

  const content = (scenario: Scenario) => ({
    courseId: courseId(scenario),
    writingProvider: "quickrouter_gpt" as const,
    sourceRevision: `step4-demo-${scenario}`,
    contentVersion: 2,
    chapters: generatedChapters(scenario, knowledgePointIds),
    mainIdea: { id: "main-idea", title: "Main Idea Reading Practice", text: "Mia and Leo use evidence, teamwork, and careful communication to repair the harbor signal and guide a boat home safely." },
    homework: { grammar: [{ id: "hq-1", type: "wordForm", knowledgePointId: knowledgePointIds[0], before: "They ", after: " the route in time.", answer: "fixed", baseForm: "fix" }], vocabularyMatching: [{ id: "v-1-1", canonicalForm: "warning light", meaningZh: "警示灯" }] },
  });

  await prisma.courseLessonContent.create({ data: { courseId: courseId("empty"), status: "empty", sourceRevision: "step4-demo-empty" } });
  await prisma.courseLessonContent.create({ data: { ...content("reading-ready"), status: "reading_ready", homework: undefined } });
  await prisma.courseLessonContent.create({ data: { ...content("ready"), status: "ready" } });
  await prisma.courseLessonContent.create({ data: { ...content("failed"), status: "failed", errorMessage: "课后阅读检查未通过；已有正文已保留，可直接重试。" } });
  const generationId = `${courseId("loading")}-generation`;
  await prisma.courseContentGeneration.create({ data: { id: generationId, courseId: courseId("loading"), operation: "modify", sourceRevision: "step4-demo-loading", idempotencyKey: `${DEMO_PREFIX}loading-operation`, status: "running", attempt: 1, baseContentVersion: 2, previousStatus: "ready", leaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"), startedAt: new Date() } });
  await prisma.courseLessonContent.create({ data: { ...content("loading"), status: "ready", activeGenerationId: generationId } });
  await prisma.courseContentChatMessage.createMany({ data: [
    { courseId: courseId("ready"), role: "teacher", content: "保留故事转折，但让第二页更适合课堂朗读。", kind: "message", requestId: `${DEMO_PREFIX}ready-modify`, eventKey: `${DEMO_PREFIX}ready-modify:teacher`, targetType: "paragraph", targetId: `${courseId("ready")}-paragraph-1-2` },
    { courseId: courseId("ready"), role: "assistant", content: "系统正在按指定范围修改，原内容会保留到新版本通过检查。", kind: "operation", status: "running", operation: "modify", requestId: `${DEMO_PREFIX}ready-modify`, title: "正在修改课程内容", eventKey: `${DEMO_PREFIX}ready-modify:running`, targetType: "paragraph", targetId: `${courseId("ready")}-paragraph-1-2` },
    { courseId: courseId("ready"), role: "system", content: "检测到第 1 章篇幅需要修复。正在统一修复。", kind: "repair", status: "running", operation: "modify", requestId: `${DEMO_PREFIX}ready-modify`, title: "自动检查与修复", eventKey: `${DEMO_PREFIX}ready-modify:repair:1` },
    { courseId: courseId("ready"), role: "system", content: "检测到课后阅读需要修复。正在单独修复。", kind: "repair", status: "running", operation: "modify", requestId: `${DEMO_PREFIX}ready-modify`, title: "自动检查与修复", eventKey: `${DEMO_PREFIX}ready-modify:repair:2` },
    { courseId: courseId("ready"), role: "assistant", content: "已按指定范围完成修改并通过检查，其他内容未变。", kind: "operation", status: "succeeded", operation: "modify", requestId: `${DEMO_PREFIX}ready-modify`, title: "修改已完成", eventKey: `${DEMO_PREFIX}ready-modify:succeeded`, targetType: "paragraph", targetId: `${courseId("ready")}-paragraph-1-2` },
    { courseId: courseId("loading"), role: "teacher", content: "让第一章第一页的冲突更明确。", kind: "message", requestId: `${DEMO_PREFIX}loading-operation`, eventKey: `${DEMO_PREFIX}loading-operation:teacher`, targetType: "paragraph", targetId: `${courseId("loading")}-paragraph-1-1` },
    { courseId: courseId("loading"), role: "assistant", content: "系统正在按指定范围修改，原内容会保留到新版本通过检查。", kind: "operation", status: "running", operation: "modify", requestId: `${DEMO_PREFIX}loading-operation`, title: "正在修改课程内容", eventKey: `${DEMO_PREFIX}loading-operation:running`, targetType: "paragraph", targetId: `${courseId("loading")}-paragraph-1-1` },
  ] });

  // TODO: Step 4 视觉验收结束后运行 pnpm demo:step4:cleanup，避免测试课程长期留在本地库。
  console.log("Step 4 验收课程已创建：");
  console.log("统一入口      http://localhost:3002/courses");
  for (const scenario of scenarios) console.log(`${scenario.padEnd(13)} http://localhost:3002/courses/${courseId(scenario)}/create/content`);
}

async function validateDemoCourses() {
  const results = [];
  for (const scenario of scenarios) {
    const state = await getCourseContentState(prisma as unknown as Parameters<typeof getCourseContentState>[0], courseId(scenario));
    results.push({ scenario, courseId: state.course.id, status: state.status, chapters: state.chapters.length, operation: state.operation?.type ?? null, messages: state.messages.length });
  }
  if (results.find((item) => item.scenario === "ready")?.status !== "ready") throw new Error("ready 场景异常");
  if (results.find((item) => item.scenario === "loading")?.operation !== "modify") throw new Error("loading 场景未恢复运行态");
  console.log(JSON.stringify(results, null, 2));
}

async function completeLoadingDemo() {
  const id = courseId("loading");
  await prisma.$transaction(async (tx) => {
    await tx.courseContentGeneration.updateMany({ where: { courseId: id, status: "running" }, data: { status: "succeeded" } });
    await tx.courseLessonContent.update({ where: { courseId: id }, data: { status: "ready", phase: null, activeGenerationId: null, errorMessage: null, contentVersion: { increment: 1 } } });
    await tx.courseContentChatMessage.create({ data: { courseId: id, role: "assistant", content: "已按指定范围完成修改并通过检查，其他内容未变。", kind: "operation", status: "succeeded", operation: "modify", requestId: `${DEMO_PREFIX}loading-operation`, title: "修改已完成", eventKey: `${DEMO_PREFIX}loading-operation:succeeded`, targetType: "paragraph", targetId: `${courseId("loading")}-paragraph-1-1` } });
  });
  console.log("Step 4 加载场景已切换为完成态；打开中的页面将在下一次轮询后更新。");
}

async function main() {
  const command = process.argv[2] ?? "seed";
  if (command === "seed") await seedDemoCourses();
  else if (command === "validate") await validateDemoCourses();
  else if (command === "complete-loading") await completeLoadingDemo();
  else if (command === "cleanup") { await removeDemoCourses(); console.log("Step 4 验收课程已清理。"); }
  else throw new Error(`Unknown command: ${command}`);
}

main().finally(() => prisma.$disconnect());
