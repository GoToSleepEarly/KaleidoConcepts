import "dotenv/config";

import { constants, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { AiGateway, Gender, PersonRole, PersonVisualProvider, PersonVisualSourceMode, PersonVisualStatus, PresetOptionKind, Prisma, PrismaClient } from "@prisma/client";

import presetData from "./preset-data.json";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "123456";
  for (const user of presetData.users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { displayName: user.displayName, aiGateway: user.aiGateway as AiGateway },
      create: {
        id: user.id,
        username: user.username,
        password: seedPassword,
        displayName: user.displayName,
        aiGateway: user.aiGateway as AiGateway,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
    });
  }

  const storageRoot = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : null;
  if (presetData.visualAssets.length && !storageRoot) throw new Error("STORAGE_DIR is required to seed person visual assets");
  const seedAssetRoot = path.resolve(import.meta.dirname, "seed-assets");
  for (const asset of presetData.visualAssets) {
    if (!asset.storagePath || !storageRoot) continue;
    const sourcePath = path.resolve(seedAssetRoot, asset.storagePath);
    const targetPath = path.resolve(storageRoot, asset.storagePath);
    if (!sourcePath.startsWith(`${seedAssetRoot}${path.sep}`) || !targetPath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error(`人物图片路径越界：${asset.storagePath}`);
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }

  for (const person of presetData.people) {
    await prisma.person.upsert({
      where: { id: person.id },
      update: {
        role: person.role as PersonRole,
        chineseName: person.chineseName,
        englishName: person.englishName,
        age: person.age,
        gender: person.gender as Gender,
        notes: person.notes,
        archivedAt: person.archivedAt ? new Date(person.archivedAt) : null,
      },
      create: {
        id: person.id,
        role: person.role as PersonRole,
        chineseName: person.chineseName,
        englishName: person.englishName,
        age: person.age,
        gender: person.gender as Gender,
        notes: person.notes,
        activeVisualAssetId: null,
        archivedAt: person.archivedAt ? new Date(person.archivedAt) : null,
        createdAt: new Date(person.createdAt),
        updatedAt: new Date(person.updatedAt),
      },
    });
  }

  for (const asset of presetData.visualAssets) {
    const data = {
      personId: asset.personId,
      parentAssetId: asset.parentAssetId,
      sourceMode: asset.sourceMode as PersonVisualSourceMode,
      appearanceConfig: asset.appearanceConfig === null ? Prisma.DbNull : asset.appearanceConfig as Prisma.InputJsonValue,
      userInstruction: asset.userInstruction,
      compiledPrompt: asset.compiledPrompt,
      sourceHash: asset.sourceHash,
      idempotencyKey: asset.idempotencyKey,
      status: asset.status as PersonVisualStatus,
      provider: asset.provider as PersonVisualProvider,
      providerImageUrl: asset.providerImageUrl,
      storagePath: asset.storagePath,
      publicUrl: asset.publicUrl,
      temporarySourcePath: null,
      failureReason: asset.failureReason,
      updatedAt: new Date(asset.updatedAt),
    };
    await prisma.personVisualAsset.upsert({
      where: { id: asset.id },
      update: data,
      create: { id: asset.id, ...data, createdAt: new Date(asset.createdAt) },
    });
  }

  for (const person of presetData.people) {
    await prisma.person.update({
      where: { id: person.id },
      data: { activeVisualAssetId: person.activeVisualAssetId },
    });
  }

  for (const option of presetData.presetOptions) {
    const data = {
      kind: option.kind,
      label: option.label,
      labelZh: option.labelZh,
      category: option.category,
      sortOrder: option.sortOrder,
      archivedAt: option.archivedAt ? new Date(option.archivedAt) : null,
      updatedAt: new Date(option.updatedAt),
    } as Prisma.PresetOptionUncheckedCreateInput;
    await prisma.presetOption.upsert({
      where: { kind_label: { kind: option.kind as PresetOptionKind, label: option.label } },
      update: data,
      create: { id: option.id, ...data, createdAt: new Date(option.createdAt) },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
