import "dotenv/config";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceStorageDir = path.resolve(process.env.PRESET_SOURCE_STORAGE_DIR ?? path.join(projectRoot, ".local", "storage-app"));
const dataFile = path.join(projectRoot, "prisma", "preset-data.json");
const assetRoot = path.join(projectRoot, "prisma", "seed-assets");
const excludedVisualIds = new Set((process.env.EXCLUDED_PERSON_VISUAL_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const [users, people, visualAssets, presetOptions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, displayName: true, aiGateway: true, createdAt: true, updatedAt: true },
    }),
    prisma.person.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personVisualAsset.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.presetOption.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const includedVisuals = visualAssets.filter((asset) => !excludedVisualIds.has(asset.id));
  const includedVisualIds = new Set(includedVisuals.map((asset) => asset.id));
  const latestSucceededVisual = new Map<string, string>();
  for (const asset of includedVisuals) {
    if (asset.status === "succeeded" && asset.storagePath) latestSucceededVisual.set(asset.personId, asset.id);
  }
  const normalizedPeople = people.map((person) => ({
    ...person,
    activeVisualAssetId: person.activeVisualAssetId && includedVisualIds.has(person.activeVisualAssetId)
      ? person.activeVisualAssetId
      : latestSucceededVisual.get(person.id) ?? null,
  }));

  for (const asset of includedVisuals) {
    if (!asset.storagePath) continue;
    const sourcePath = path.resolve(sourceStorageDir, asset.storagePath);
    const targetPath = path.resolve(assetRoot, asset.storagePath);
    if (!sourcePath.startsWith(`${sourceStorageDir}${path.sep}`) || !targetPath.startsWith(`${assetRoot}${path.sep}`)) {
      throw new Error(`人物图片路径越界：${asset.storagePath}`);
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  await writeFile(dataFile, `${JSON.stringify({ users, people: normalizedPeople, visualAssets: includedVisuals, presetOptions }, null, 2)}\n`, "utf8");
  console.log(`Exported ${users.length} users, ${normalizedPeople.length} people, ${includedVisuals.length} person visuals and ${presetOptions.length} presets.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
