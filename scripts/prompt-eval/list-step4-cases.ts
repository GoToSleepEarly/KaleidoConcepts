import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const courses = await prisma.course.findMany({
      where: { teachingPlan: { is: { status: "confirmed" } }, storyOutline: { isNot: null } },
      select: {
        id: true,
        title: true,
        englishLevel: true,
        grammarBookEditionId: true,
        grammarBookEdition: { select: { title: true, edition: true, officialLevel: true } },
        knowledgePointIds: true,
        teachingPlan: { select: { chapters: true, afterClassPractice: true } },
        storyOutline: { select: { chapters: { select: { id: true } } } },
        lessonContent: { select: { status: true, contentVersion: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    console.log(JSON.stringify(courses.map((course) => ({
      id: course.id,
      title: course.title,
      englishLevel: course.englishLevel,
      grammarBookEditionId: course.grammarBookEditionId,
      grammarBookEdition: course.grammarBookEdition,
      knowledgePointIds: course.knowledgePointIds,
      outlineChapterCount: course.storyOutline?.chapters.length ?? 0,
      planChapters: course.teachingPlan?.chapters,
      afterClassPractice: course.teachingPlan?.afterClassPractice,
      lessonContent: course.lessonContent,
    })), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
