import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getTeachingPlanState } from "../lib/server/repositories/teaching-plan";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const COURSE_ID = "step3-demo-normal-flow";
const DEMO_PREFIX = "dev-step3-demo:";
const BOOK_EDITION_ID = "english-grammar-in-use-5";

async function removeDemoCourse() {
  await prisma.course.deleteMany({
    where: {
      id: COURSE_ID,
      idempotencyKey: { startsWith: DEMO_PREFIX },
    },
  });
}

async function seedDemoCourse() {
  await removeDemoCourse();

  const book = await prisma.grammarBookEdition.findUnique({
    where: { id: BOOK_EDITION_ID },
    select: { id: true, title: true, edition: true },
  });
  if (!book) throw new Error("缺少 English Grammar in Use 语法目录，请先运行 pnpm prisma:seed");

  const knowledgePoints = await prisma.knowledgePoint.findMany({
    where: { bookEditionId: book.id, source: "grammar_in_use" },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: 8,
    select: { id: true, title: true },
  });
  if (knowledgePoints.length < 6) throw new Error("当前语法书知识点不足，无法构造 Step 3 验收数据");

  // TODO: 本地 Step 3 验收完成后通过 pnpm demo:step3:cleanup 删除课程。
  // 第 4 个知识点保留为“第一步已选但 AI 未推荐”，用于验证待补充与额外可选的来源区分。
  const initiallySelected = knowledgePoints.slice(0, 4).map((point) => point.id);
  await prisma.course.create({
    data: {
      id: COURSE_ID,
      title: "[Step3验收] 正常教学规划流程",
      durationMinutes: 45,
      englishLevel: "B1",
      grammarBookEditionId: book.id,
      knowledgePointIds: initiallySelected,
      currentStage: "teaching_plan",
      idempotencyKey: `${DEMO_PREFIX}${COURSE_ID}`,
      storySetting: {
        create: {
          chapterCount: 3,
          storyComplexity: "conflict_driven",
          alignmentStatus: "confirmed",
          planningMode: "follow_defined_plot",
          alignmentSummary: "三名学生在雾灯岛修复失踪航线，通过观察、推理和合作帮助返航船只。",
          alignmentConfirmedAt: new Date("2026-08-30T10:00:00.000Z"),
          stateRevision: 1,
        },
      },
      storyOutline: {
        create: {
          id: `${COURSE_ID}-outline`,
          chapterCount: 3,
          title: "雾灯岛的失踪航线 / The Missing Route of Lighthouse Island",
          summary: "Mia、Leo 和 Noah 登上雾灯岛，发现引导船只返航的灯塔航线突然消失。他们需要读懂守塔日志、修复信号，并在浓雾封锁海湾前重新点亮正确航线。",
          chapters: {
            create: [
              {
                id: `${COURSE_ID}-chapter-1`,
                order: 1,
                title: "消失的灯光 / The Missing Light",
                storyGoal: "三名学生抵达雾灯岛后，发现主灯仍在运转，但海面上的航线信号全部熄灭。他们检查守塔日志和控制台，确认故障发生在前一晚的暴风雨之后，并决定沿旧航线寻找第一处中继灯。",
                keyEvents: ["抵达灯塔", "发现航线信号熄灭", "从日志确定故障时间"],
                characterIds: [],
                setting: "雾灯岛主灯塔",
                endingHook: "远处的浓雾中短暂闪过一道蓝光。",
                recommendedKnowledgePointIds: [knowledgePoints[0].id],
                knowledgePointRecommendationSummary: `适合使用 ${knowledgePoints[0].title} 描述当前观察和行动。`,
              },
              {
                id: `${COURSE_ID}-chapter-2`,
                order: 2,
                title: "暴风雨日志 / The Storm Log",
                storyGoal: "团队在旧中继站找到被雨水打湿的维修记录。他们对照日志中的时间和现场痕迹，判断哪个开关曾被误触，并尝试恢复两段航线信号。新的灯光出现了，但指向了危险的礁石区。",
                keyEvents: ["找到维修记录", "核对故障线索", "发现错误航线"],
                characterIds: [],
                setting: "废弃的海岸中继站",
                endingHook: "一艘返航船正朝错误的灯光驶来。",
                recommendedKnowledgePointIds: [knowledgePoints[1].id],
                knowledgePointRecommendationSummary: `适合使用 ${knowledgePoints[1].title} 比较日志记录与现场事实。`,
              },
              {
                id: `${COURSE_ID}-chapter-3`,
                order: 3,
                title: "最后的返航信号 / The Final Signal",
                storyGoal: "学生分工关闭错误信号、修复主控制器，并用备用灯向船只发送正确方向。浓雾最深时，三段航线依次亮起，返航船安全绕过礁石，岛上的灯塔也重新恢复完整记录。",
                keyEvents: ["关闭错误信号", "修复主控制器", "引导船只安全返航"],
                characterIds: [],
                setting: "主灯塔控制室与海湾",
                endingHook: "清晨第一束阳光照亮了重新出现的航线。",
                recommendedKnowledgePointIds: [knowledgePoints[2].id],
                knowledgePointRecommendationSummary: `适合使用 ${knowledgePoints[2].title} 组织最终行动和结果。`,
              },
            ],
          },
        },
      },
    },
  });

  console.log(`Step 3 验收课程已创建：${COURSE_ID}`);
  console.log(`语法书：${book.title} · ${book.edition}`);
  console.log(`课程初始知识点：${initiallySelected.length} 个；选择器可见知识点：${knowledgePoints.length} 个以上`);
}

async function validateDemoCourse() {
  const state = await getTeachingPlanState(prisma as unknown as Parameters<typeof getTeachingPlanState>[0], COURSE_ID);
  const selectedCount = state.course.knowledgePointIds?.length ?? 0;
  if (state.course.currentStage !== "teaching_plan") throw new Error("验收课程未落在 Step 3");
  if (state.plan.chapters.length !== 3) throw new Error("验收课程教学规划章节数异常");
  if (state.knowledgePoints.length <= selectedCount) throw new Error("知识点选择器没有可扩选的同书知识点");
  if (state.plan.chapters.some((chapter) => !chapter.knowledgePointIds.length)) throw new Error("验收课程存在未初始化知识点的章节");
  const recommendedIds = new Set(state.outline.chapters.flatMap((chapter) => chapter.recommendedKnowledgePointIds));
  const pendingCount = (state.course.knowledgePointIds ?? []).filter((id) => !recommendedIds.has(id)).length;
  if (pendingCount !== 1) throw new Error("验收课程应包含 1 个第一步已选但 AI 未推荐的知识点");
  console.log(JSON.stringify({
    courseId: state.course.id,
    currentStage: state.course.currentStage,
    chapterCount: state.plan.chapters.length,
    selectedKnowledgePointCount: selectedCount,
    pendingKnowledgePointCount: pendingCount,
    availableKnowledgePointCount: state.knowledgePoints.length,
    firstChapterTargetWords: state.plan.chapters[0].targetWordCount,
    firstChapterPageCount: state.plan.chapters[0].paragraphCount,
    grammarBook: state.knowledgePoints[0]?.bookTitle,
  }, null, 2));
}

async function main() {
  const command = process.argv[2] ?? "seed";
  if (command === "seed") await seedDemoCourse();
  else if (command === "validate") await validateDemoCourse();
  else if (command === "cleanup") {
    await removeDemoCourse();
    console.log("Step 3 验收课程已清理。");
  } else throw new Error(`Unknown command: ${command}`);
}

main().finally(() => prisma.$disconnect());
