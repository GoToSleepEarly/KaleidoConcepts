import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getCourseVisualResources } from "../lib/server/repositories/visual-resources";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const COURSE_ID = "step5-demo-loading";
const DEMO_KEY = "dev-step5-demo:loading";
const REQUEST_ID = "dev-step5-demo:visual-plan-loading";
const SOURCE_REVISION = "step5-demo-loading:1";

async function removeDemoCourse() {
  await prisma.course.deleteMany({ where: { idempotencyKey: DEMO_KEY } });
}

async function createRunningOperation() {
  await prisma.aiGenerationLog.deleteMany({
    where: {
      courseId: COURSE_ID,
      stage: "visual_resources",
      operation: "visual_generate_resource_plan",
    },
  });
  await prisma.aiGenerationLog.create({
    data: {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      stage: "visual_resources",
      operation: "visual_generate_resource_plan",
      status: "running",
      writingProvider: "gpt-5.6-sol",
      activeScope: `visual-plan:${COURSE_ID}`,
      inputSnapshot: {
        sourceRevision: SOURCE_REVISION,
        characterCount: 2,
        paragraphCount: 4,
      },
    },
  });
}

async function seedDemoCourse() {
  await removeDemoCourse();
  await prisma.course.create({
    data: {
      id: COURSE_ID,
      title: "[Step5验收] 视觉方案 Loading",
      durationMinutes: 45,
      englishLevel: "B1",
      knowledgePointIds: [],
      currentStage: "visual_resources",
      idempotencyKey: DEMO_KEY,
      characters: {
        create: [
          {
            id: `${COURSE_ID}-character-mia`,
            displayName: "米娅",
            englishName: "Mia",
            sourceType: "original",
            roleInStory: "负责观察线索的学生",
            shortDescription: "冷静、细心，善于发现环境中的细节。",
            shouldAppearInImages: true,
          },
          {
            id: `${COURSE_ID}-character-leo`,
            displayName: "里奥",
            englishName: "Leo",
            sourceType: "original",
            roleInStory: "负责动手解决问题的学生",
            shortDescription: "行动积极，擅长把线索转化为解决方案。",
            shouldAppearInImages: true,
          },
        ],
      },
      lessonContent: {
        create: {
          status: "confirmed",
          sourceRevision: "step5-demo-loading",
          contentVersion: 1,
          confirmedAt: new Date(),
          chapters: [1, 2].map((chapterOrder) => ({
            id: `${COURSE_ID}-chapter-${chapterOrder}`,
            order: chapterOrder,
            title: chapterOrder === 1 ? "The Hidden Signal" : "The Safe Path",
            targetWordCount: 100,
            readingExerciseMode: "interactive",
            validationIssues: [],
            paragraphs: [1, 2].map((paragraphOrder) => ({
              id: `${COURSE_ID}-paragraph-${chapterOrder}-${paragraphOrder}`,
              parts: [{ type: "text", text: `Demo paragraph ${chapterOrder}-${paragraphOrder} for the Step 5 loading state.` }],
            })),
            chapterPractice: [],
          })),
        },
      },
    },
  });
  await createRunningOperation();
  console.log("Step 5 Loading 验收课程已创建：");
  console.log(`http://localhost:3000/courses/${COURSE_ID}/create/visual-resources`);
  console.log("该真实运行态会在 12 分钟后自动恢复为失败；超时后可运行 pnpm demo:step5:refresh-loading。 ");
}

async function refreshLoading() {
  const course = await prisma.course.findUnique({ where: { id: COURSE_ID }, select: { id: true } });
  if (!course) throw new Error("Step 5 验收课程不存在，请先运行 pnpm demo:step5");
  await createRunningOperation();
  console.log("Step 5 Loading 的开始时间已刷新，请重新打开或刷新验收页面。");
}

async function validateDemoCourse() {
  const state = await getCourseVisualResources(prisma as unknown as Parameters<typeof getCourseVisualResources>[0], COURSE_ID);
  if (state.planOperation?.status !== "running") throw new Error("Step 5 验收课程未处于视觉方案运行态");
  console.log(JSON.stringify({
    courseId: state.course.id,
    title: state.course.title,
    currentStage: state.course.currentStage,
    planOperation: state.planOperation,
  }, null, 2));
}

async function main() {
  const command = process.argv[2] ?? "seed";
  if (command === "seed") await seedDemoCourse();
  else if (command === "refresh-loading") await refreshLoading();
  else if (command === "validate") await validateDemoCourse();
  else if (command === "cleanup") {
    await removeDemoCourse();
    console.log("Step 5 Loading 验收课程已清理。");
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().finally(() => prisma.$disconnect());
