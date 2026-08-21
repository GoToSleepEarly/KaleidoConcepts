import "dotenv/config";

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const courseId = argument("--course-id");
if (!courseId) throw new Error("Usage: pnpm step4:export-case -- --course-id <courseId> [--output /tmp/file.json]");

const safeCourseId = courseId.replace(/[^a-zA-Z0-9_-]/g, "_");
const outputFile = path.resolve(argument("--output") || path.join(tmpdir(), `pbl-step4-case-${safeCourseId}.json`));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const [course, knowledgePoints] = await prisma.$transaction([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        englishLevel: true,
        knowledgePointIds: true,
        lifecycleStatus: true,
        currentStage: true,
        createdAt: true,
        updatedAt: true,
        people: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            chineseNameSnapshot: true,
            englishNameSnapshot: true,
            ageSnapshot: true,
            genderSnapshot: true,
          },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            displayName: true,
            englishName: true,
            sourceType: true,
            roleInStory: true,
            shortDescription: true,
          },
        },
        storyOutline: {
          select: {
            id: true,
            chapterCount: true,
            title: true,
            summary: true,
            writingProvider: true,
            createdAt: true,
            updatedAt: true,
            chapters: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                order: true,
                title: true,
                storyGoal: true,
                keyEvents: true,
                characterIds: true,
                setting: true,
                endingHook: true,
                recommendedKnowledgePointIds: true,
                knowledgePointRecommendationSummary: true,
              },
            },
          },
        },
        teachingPlan: {
          select: {
            id: true,
            status: true,
            englishLevel: true,
            mainIdeaTargetWordCount: true,
            chapters: true,
            afterClassPractice: true,
            confirmedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        lessonContent: {
          select: {
            id: true,
            status: true,
            phase: true,
            writingProvider: true,
            sourceRevision: true,
            contentVersion: true,
            chapters: true,
            mainIdea: true,
            homework: true,
            exercisesStale: true,
            errorMessage: true,
            activeGenerationId: true,
            confirmedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        contentGenerations: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            operation: true,
            status: true,
            attempt: true,
            baseContentVersion: true,
            previousStatus: true,
            startedAt: true,
            leaseExpiresAt: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        contentMessages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            targetType: true,
            targetId: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.presetOption.findMany({
      where: { kind: "grammar", archivedAt: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, labelZh: true, category: true, sortOrder: true },
    }),
  ]);

  if (!course) throw new Error(`Course not found: ${courseId}`);
  if (!course.storyOutline) throw new Error("The course has no story outline to export");
  if (!course.teachingPlan) throw new Error("The course has no teaching plan to export");
  if (!course.lessonContent) throw new Error("The course has no Step 4 content to export");

  const exported = {
    format: "pbl-step4-failure-case",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    privacyNotice: "Contains course text and participant name snapshots. Does not contain passwords, cookies, API keys, provider credentials, image URLs, or database connection strings.",
    course,
    knowledgePoints,
  };
  const serialized = `${JSON.stringify(exported, null, 2)}\n`;
  await writeFile(outputFile, serialized, { encoding: "utf8", mode: 0o600 });
  const checksum = createHash("sha256").update(serialized).digest("hex");
  console.log(`Exported read-only Step 4 case to ${outputFile}`);
  console.log(`SHA-256 ${checksum}`);
  console.log(`Chapters ${course.storyOutline.chapters.length}; content messages ${course.contentMessages.length}; generations ${course.contentGenerations.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
