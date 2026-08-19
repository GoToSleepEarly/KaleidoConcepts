import "dotenv/config";

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataFile = path.join(projectRoot, "prisma", "preset-data.json");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const [users, presetOptions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, displayName: true, aiGateway: true, createdAt: true, updatedAt: true },
    }),
    prisma.presetOption.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  await writeFile(dataFile, `${JSON.stringify({ users, presetOptions }, null, 2)}\n`, "utf8");
  console.log(`Exported ${users.length} users and ${presetOptions.length} presets.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
