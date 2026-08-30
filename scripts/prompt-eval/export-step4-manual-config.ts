import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { storyContentIntentFromAlignmentDetails } from "../../lib/domain/story-content-intent";
import { getTeachingPlanState, type TeachingPlanDb } from "../../lib/server/repositories/teaching-plan";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const courseId = argument("--course-id");
  const output = argument("--output");
  const connectionString = process.env.DATABASE_URL;
  if (!courseId || !output) throw new Error("Usage: --course-id <id> --output <config.json>");
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const [state, course, people, characters] = await Promise.all([
      getTeachingPlanState(prisma as unknown as TeachingPlanDb, courseId),
      prisma.course.findUnique({ where: { id: courseId }, include: { storySetting: true } }),
      prisma.coursePerson.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }),
      prisma.courseCharacter.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }),
    ]);
    if (!course) throw new Error(`Course not found: ${courseId}`);

    const input = {
      ...state,
      contentIntent: storyContentIntentFromAlignmentDetails(course.storySetting?.alignmentDetails),
      promptPeople: people.map((person) => ({
        role: person.role,
        chineseName: person.chineseNameSnapshot,
        englishName: person.englishNameSnapshot,
      })),
      promptCharacters: characters.map((character) => ({
        displayName: character.displayName,
        englishName: character.englishName,
        roleInStory: character.roleInStory,
        shortDescription: character.shortDescription,
      })),
    };
    const config = { scope: "content", method: "generateReading", args: [input, "quickrouter_gpt"] };
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.log(`Exported Step 4 manual config to ${outputPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
