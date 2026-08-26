import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { AiGateway, KnowledgePointSource, PresetOptionKind, Prisma, PrismaClient } from "@prisma/client";

import { grammarCatalogBooks } from "./grammar-catalog-data";
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
    if (option.kind === "grammar") {
      await prisma.knowledgePoint.upsert({
        where: { id: option.id },
        update: { source: KnowledgePointSource.legacy, bookEditionId: null, sectionId: null, title: option.label, sortOrder: option.sortOrder },
        create: { id: option.id, source: KnowledgePointSource.legacy, title: option.label, sortOrder: option.sortOrder },
      });
    }
  }

  for (const [bookIndex, book] of grammarCatalogBooks.entries()) {
    await prisma.grammarBookEdition.upsert({
      where: { id: book.id },
      update: { title: book.title, edition: book.edition, officialLevel: book.officialLevel, sortOrder: bookIndex + 1 },
      create: { id: book.id, title: book.title, edition: book.edition, officialLevel: book.officialLevel, sortOrder: bookIndex + 1 },
    });
    for (const [sectionIndex, section] of book.sections.entries()) {
      await prisma.grammarSection.upsert({
        where: { id: section.id },
        update: { bookEditionId: book.id, officialTitle: section.officialTitle, sortOrder: sectionIndex + 1 },
        create: { id: section.id, bookEditionId: book.id, officialTitle: section.officialTitle, sortOrder: sectionIndex + 1 },
      });
      for (const point of section.points) {
        await prisma.knowledgePoint.upsert({
          where: { id: point.id },
          update: { source: KnowledgePointSource.grammar_in_use, bookEditionId: book.id, sectionId: section.id, title: point.title, sortOrder: point.unitStart },
          create: { id: point.id, source: KnowledgePointSource.grammar_in_use, bookEditionId: book.id, sectionId: section.id, title: point.title, sortOrder: point.unitStart },
        });
        for (const unit of point.units) {
          await prisma.grammarKnowledgePointUnit.upsert({
            where: { knowledgePointId_unitNumber: { knowledgePointId: point.id, unitNumber: unit.unitNumber } },
            update: { officialTitle: unit.officialTitle },
            create: { knowledgePointId: point.id, unitNumber: unit.unitNumber, officialTitle: unit.officialTitle },
          });
        }
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
