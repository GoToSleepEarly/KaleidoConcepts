import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { AiGateway, PresetOptionKind, Prisma, PrismaClient } from "@prisma/client";

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
