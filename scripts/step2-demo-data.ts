import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DEMO_PREFIX = "dev-step2-demo:";
const ids = {
  initial: "step2-demo-initial",
  aligning: "step2-demo-aligning",
  clarification: "step2-demo-clarification",
  directions: "step2-demo-directions",
  outlineLoading: "step2-demo-outline-loading",
  complete: "step2-demo-complete",
  failed: "step2-demo-failed",
} as const;

const startedAt = new Date();
const operationInput = { message: "请创作一个会移动的海底图书馆故事", mode: "idea" };

function courseData(id: string, title: string) {
  return {
    id,
    title: `[Step2验收] ${title}`,
    durationMinutes: 45,
    englishLevel: "B1" as const,
    currentStage: "story_outline" as const,
    idempotencyKey: `${DEMO_PREFIX}${id}`,
  };
}

async function removeDemoCourses() {
  await prisma.course.deleteMany({ where: { id: { in: Object.values(ids) }, idempotencyKey: { startsWith: DEMO_PREFIX } } });
}

function settingData(overrides: Record<string, unknown> = {}) {
  return {
    chapterCount: 4,
    storyComplexity: "conflict_driven" as const,
    alignmentStatus: "idle" as const,
    planningMode: "explore_options" as const,
    stateRevision: 1,
    ...overrides,
  };
}

const directions = [
  {
    id: "step2-demo-direction-1",
    title: "潮汐书架 / The Tidal Shelves",
    hook: "海底图书馆会随潮汐移动。学生必须读懂地图变化，在书架消失前找到回家的航线。",
    whyFits: "任务清楚，适合四章内持续推进。",
    mainCharacters: ["Mia", "Leo", "Ms. Lin"],
    storyHighlight: "会随潮汐重组的图书馆",
    growthCore: "在变化中保持观察与合作",
    classroomValue: "练习描述位置、变化和团队决策。",
    seedPrompt: "潮汐书架",
  },
  {
    id: "step2-demo-direction-2",
    title: "沉睡的故事鲸 / The Sleeping Story Whale",
    hook: "一头巨鲸背着整座故事馆沉入深海。学生要唤醒散落的故事声音，帮助它重新找到迁徙方向。",
    whyFits: "情感线温和，角色行动容易区分。",
    mainCharacters: ["Mia", "Leo", "Ms. Lin"],
    storyHighlight: "鲸背上的流动故事馆",
    growthCore: "倾听不同声音后作出共同选择",
    classroomValue: "适合练习叙述经历与表达建议。",
    seedPrompt: "沉睡的故事鲸",
  },
  {
    id: "step2-demo-direction-3",
    title: "失落的蓝色书页 / The Lost Blue Pages",
    hook: "蓝色书页从图书馆飞向不同海域。团队沿着发光文字追踪它们，并发现每一页都在改变附近的海洋。",
    whyFits: "章节目标天然分段，结果可回扣开端。",
    mainCharacters: ["Mia", "Leo", "Ms. Lin"],
    storyHighlight: "文字会改变真实海域",
    growthCore: "理解行动会带来后果",
    classroomValue: "适合练习因果表达与过去时叙述。",
    seedPrompt: "失落的蓝色书页",
  },
];

async function createDirections(courseId: string, selected = false) {
  for (const [index, direction] of directions.entries()) {
    await prisma.courseStoryDirection.create({
      data: {
        ...direction,
        id: `${courseId}-direction-${index + 1}`,
        courseId,
        selectedAt: selected && index === 0 ? new Date("2026-08-30T08:02:00.000Z") : null,
        createdAt: new Date(`2026-08-30T08:01:0${index}.000Z`),
      },
    });
  }
}

async function createOutline(courseId: string) {
  await prisma.courseStoryOutline.create({
    data: {
      id: `${courseId}-outline`,
      courseId,
      chapterCount: 4,
      title: "潮汐书架 / The Tidal Shelves",
      summary: "海底图书馆随潮汐不断移动。Mia、Leo 和林老师必须观察书架变化，收集四块地图线索，并在最后一次潮汐到来前找到回家的航线。",
      chapters: {
        create: [
          { order: 1, title: "会移动的入口 / The Moving Entrance", storyGoal: "团队进入图书馆后发现出口已经消失。他们观察潮汐钟，确认书架会按固定顺序移动。", keyEvents: [], characterIds: [], setting: "海底图书馆入口", endingHook: "第一排书架开始发光。" },
          { order: 2, title: "倒转的地图 / The Reversed Map", storyGoal: "Mia 发现地图方向与真实海流相反。团队用窗外鱼群的移动重新判断方向，得到第一条可靠航线。", keyEvents: [], characterIds: [], setting: "地图阅览室", endingHook: "地图上出现一扇新的门。" },
          { order: 3, title: "最后一块线索 / The Final Clue", storyGoal: "Leo 在不断缩小的书架间找到最后一块地图。团队必须选择先保护地图还是帮助被困的小海龟。", keyEvents: [], characterIds: [], setting: "潮汐书架区", endingHook: "潮汐钟只剩最后一格。" },
          { order: 4, title: "回家的潮汐 / The Tide Home", storyGoal: "团队把地图与海龟提供的海流信息合在一起，打开正确出口，并在图书馆再次移动前回到岸边。", keyEvents: [], characterIds: [], setting: "中央航线厅", endingHook: "图书馆在远处亮起蓝光。" },
        ],
      },
    },
  });
}

async function seedDemoCourses() {
  await removeDemoCourses();

  await prisma.course.create({ data: { ...courseData(ids.initial, "01 初始入口"), storySetting: { create: settingData() } } });

  await prisma.course.create({
    data: {
      ...courseData(ids.aligning, "02 需求对齐 Loading"),
      storySetting: { create: settingData({ operationRequestId: "demo-aligning-request", operationAction: "idea", operationPhase: "aligning", operationStatus: "running", operationInput, operationStartedAt: startedAt }) },
      storyMessages: { create: [{ role: "teacher", content: "我的故事想法：\n请创作一个会移动的海底图书馆故事" }] },
    },
  });

  const clarificationQuestion = {
    id: "source_scope",
    label: "你希望重点探索哪一种海底图书馆？",
    impact: "这会决定故事的核心任务和章节推进方式。",
    answerMode: "single_choice",
    allowCustom: true,
    recommendedOptionId: "moving_library",
    recommendationReason: "移动图书馆的规则直观，四章内容更容易形成连续变化。",
    options: [
      { id: "moving_library", label: "会随潮汐移动的图书馆" },
      { id: "whale_library", label: "建在巨鲸背上的图书馆" },
      { id: "ruin_library", label: "沉没遗迹中的古老图书馆" },
    ],
  };
  await prisma.course.create({
    data: {
      ...courseData(ids.clarification, "03 等待澄清"),
      storySetting: { create: settingData({ alignmentStatus: "needs_clarification", alignmentDetails: { resolvedUnderstanding: ["海底图书馆冒险"], questions: [clarificationQuestion] } }) },
      storyMessages: { create: [
        { role: "teacher", content: "我的故事想法：\n请创作一个海底图书馆故事" },
        { role: "assistant", content: "我已经理解了大方向，还需要你确认一个会改变故事主线的选择。", actions: [{ id: "demo-question", label: "提交回答", action: "submit_alignment_answers", questions: [clarificationQuestion] }] },
      ] },
    },
  });

  await prisma.course.create({
    data: {
      ...courseData(ids.directions, "04 方向待选择"),
      storySetting: { create: settingData({ alignmentStatus: "confirmed" }) },
      storyMessages: { create: [
        { role: "teacher", content: "我确认这份创作理解。" },
        { role: "assistant", content: "已生成 3 个故事方向，请在右侧选择一个继续。" },
      ] },
    },
  });
  await createDirections(ids.directions);

  await prisma.course.create({
    data: {
      ...courseData(ids.outlineLoading, "05 大纲生成 Loading"),
      storySetting: { create: settingData({ alignmentStatus: "confirmed", operationRequestId: "demo-outline-request", operationAction: "confirm_direction", operationPhase: "generating_outline", operationStatus: "running", operationInput: { message: "", mode: "idea", action: "confirm_direction", targetId: `${ids.outlineLoading}-direction-1` }, operationStartedAt: startedAt }) },
      storyMessages: { create: [{ role: "teacher", content: "我选择并生成故事大纲：潮汐书架" }] },
    },
  });
  await createDirections(ids.outlineLoading, true);

  await prisma.course.create({
    data: {
      ...courseData(ids.complete, "06 大纲完成"),
      storySetting: { create: settingData({ alignmentStatus: "confirmed", operationRequestId: "demo-complete-request", operationAction: "confirm_direction", operationPhase: "generating_outline", operationStatus: "succeeded", operationInput, operationStartedAt: startedAt }) },
      storyMessages: { create: [
        { role: "teacher", content: "我选择并生成故事大纲：潮汐书架" },
        { role: "assistant", content: "故事大纲已生成，右侧显示的是最新版本。" },
      ] },
    },
  });
  await createDirections(ids.complete, true);
  await createOutline(ids.complete);

  await prisma.course.create({
    data: {
      ...courseData(ids.failed, "07 失败可重试"),
      storySetting: { create: settingData({ alignmentStatus: "confirmed", operationRequestId: "demo-failed-request", operationAction: "confirm_requirements", operationPhase: "generating_directions", operationStatus: "failed", operationError: "故事方向生成失败，请重试本步。", operationInput, operationStartedAt: startedAt }) },
      storyMessages: { create: [
        { role: "teacher", content: "我确认这份创作理解。" },
        { role: "assistant", content: "故事方向生成失败，请重试本步。你可以重试本步，或修改要求后重新提交。", actions: [{ id: "retry-demo-failed-request", label: "重试本步", action: "retry_operation", targetId: "demo-failed-request" }] },
      ] },
    },
  });
}

async function setAligningOutcome(outcome: "running" | "succeeded" | "failed") {
  const course = await prisma.course.findUnique({ where: { id: ids.aligning } });
  if (!course || !course.idempotencyKey.startsWith(DEMO_PREFIX)) throw new Error("请先运行 pnpm demo:step2");
  await prisma.courseStoryChatMessage.deleteMany({ where: { courseId: ids.aligning, role: "assistant" } });
  if (outcome === "running") {
    await prisma.courseStoryDirection.deleteMany({ where: { courseId: ids.aligning } });
    await prisma.courseStorySetting.update({ where: { courseId: ids.aligning }, data: { alignmentStatus: "idle", operationStatus: "running", operationError: null, operationStartedAt: new Date(), operationPhase: "aligning" } });
    return;
  }
  if (outcome === "succeeded") {
    await prisma.courseStoryDirection.deleteMany({ where: { courseId: ids.aligning } });
    await prisma.courseStorySetting.update({ where: { courseId: ids.aligning }, data: { alignmentStatus: "confirmed", operationStatus: "succeeded", operationError: null, operationPhase: "generating_directions" } });
    await createDirections(ids.aligning);
    await prisma.courseStoryChatMessage.create({ data: { courseId: ids.aligning, role: "assistant", content: "已完成故事要求对齐，并生成 3 个故事方向。请在右侧选择一个继续。" } });
    return;
  }
  await prisma.courseStorySetting.update({ where: { courseId: ids.aligning }, data: { operationStatus: "failed", operationError: "故事要求暂时没有整理完成，请重试本步。" } });
  await prisma.courseStoryChatMessage.create({ data: { courseId: ids.aligning, role: "assistant", content: "故事要求暂时没有整理完成，请重试本步。你可以重试本步，或修改要求后重新提交。", actions: [{ id: "retry-demo-aligning-request", label: "重试本步", action: "retry_operation", targetId: "demo-aligning-request" }] } });
}

async function main() {
  const command = process.argv[2] ?? "seed";
  if (command === "seed") await seedDemoCourses();
  else if (command === "cleanup") await removeDemoCourses();
  else if (command === "running" || command === "succeeded" || command === "failed") await setAligningOutcome(command);
  else throw new Error(`Unknown command: ${command}`);
  console.log(command === "cleanup" ? "Step 2 演示课程已清理。" : `Step 2 演示数据已更新：${command}`);
}

main().finally(() => prisma.$disconnect());
