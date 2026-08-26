import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { grammarCatalogBooks, rawGrammarBooks } from "../prisma/grammar-catalog-data";

const migrationPath = resolve("prisma/migrations/20260826195000_add_grammar_in_use_catalog/migration.sql");
const migrationsRoot = resolve("prisma/migrations");
if (!migrationPath.startsWith(`${migrationsRoot}\\`) && !migrationPath.startsWith(`${migrationsRoot}/`)) {
  throw new Error("Migration target is outside prisma/migrations");
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const rows = (values: string[][]) => values.map((value) => `  (${value.join(", ")})`).join(",\n");

const books = grammarCatalogBooks.map((book, index) => [quote(book.id), quote(book.title), quote(book.edition), quote(book.officialLevel), `${index + 1}`]);
const sections = rawGrammarBooks.flatMap((book) => book.sections.map((section) => [quote(section.id), quote(book.id), quote(section.officialTitle), `${section.sortOrder}`]));
const points = grammarCatalogBooks.flatMap((book) => book.sections.flatMap((section) => section.points.map((point) => [
  quote(point.id),
  quote("grammar_in_use"),
  quote(book.id),
  quote(section.id),
  quote(point.title),
  `${point.unitStart}`,
])));
const units = grammarCatalogBooks.flatMap((book) => book.sections.flatMap((section) => section.points.flatMap((point) => point.units.map((unit) => [
  quote(point.id),
  `${unit.unitNumber}`,
  quote(unit.officialTitle),
]))));

const sql = `-- System-owned Grammar in Use catalog and legacy knowledge-point compatibility.
CREATE TYPE "KnowledgePointSource" AS ENUM ('legacy', 'grammar_in_use');

ALTER TABLE "Course" ADD COLUMN "grammarBookEditionId" TEXT;

CREATE TABLE "GrammarBookEdition" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "edition" TEXT NOT NULL,
  "officialLevel" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "GrammarBookEdition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrammarSection" (
  "id" TEXT NOT NULL,
  "bookEditionId" TEXT NOT NULL,
  "officialTitle" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "GrammarSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgePoint" (
  "id" TEXT NOT NULL,
  "source" "KnowledgePointSource" NOT NULL,
  "bookEditionId" TEXT,
  "sectionId" TEXT,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "KnowledgePoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrammarKnowledgePointUnit" (
  "knowledgePointId" TEXT NOT NULL,
  "unitNumber" INTEGER NOT NULL,
  "officialTitle" TEXT NOT NULL,
  CONSTRAINT "GrammarKnowledgePointUnit_pkey" PRIMARY KEY ("knowledgePointId", "unitNumber")
);

CREATE INDEX "GrammarBookEdition_sortOrder_idx" ON "GrammarBookEdition"("sortOrder");
CREATE UNIQUE INDEX "GrammarSection_bookEditionId_sortOrder_key" ON "GrammarSection"("bookEditionId", "sortOrder");
CREATE INDEX "GrammarSection_bookEditionId_sortOrder_idx" ON "GrammarSection"("bookEditionId", "sortOrder");
CREATE INDEX "KnowledgePoint_source_bookEditionId_sortOrder_idx" ON "KnowledgePoint"("source", "bookEditionId", "sortOrder");
CREATE INDEX "KnowledgePoint_sectionId_sortOrder_idx" ON "KnowledgePoint"("sectionId", "sortOrder");
CREATE INDEX "GrammarKnowledgePointUnit_unitNumber_idx" ON "GrammarKnowledgePointUnit"("unitNumber");

ALTER TABLE "Course" ADD CONSTRAINT "Course_grammarBookEditionId_fkey" FOREIGN KEY ("grammarBookEditionId") REFERENCES "GrammarBookEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrammarSection" ADD CONSTRAINT "GrammarSection_bookEditionId_fkey" FOREIGN KEY ("bookEditionId") REFERENCES "GrammarBookEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_bookEditionId_fkey" FOREIGN KEY ("bookEditionId") REFERENCES "GrammarBookEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GrammarSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrammarKnowledgePointUnit" ADD CONSTRAINT "GrammarKnowledgePointUnit_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "KnowledgePoint" ("id", "source", "bookEditionId", "sectionId", "title", "sortOrder")
SELECT "id", 'legacy'::"KnowledgePointSource", NULL, NULL, "label", "sortOrder"
FROM "PresetOption"
WHERE "kind" = 'grammar'::"PresetOptionKind"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "GrammarBookEdition" ("id", "title", "edition", "officialLevel", "sortOrder") VALUES
${rows(books)};

INSERT INTO "GrammarSection" ("id", "bookEditionId", "officialTitle", "sortOrder") VALUES
${rows(sections)};

INSERT INTO "KnowledgePoint" ("id", "source", "bookEditionId", "sectionId", "title", "sortOrder") VALUES
${rows(points)};

INSERT INTO "GrammarKnowledgePointUnit" ("knowledgePointId", "unitNumber", "officialTitle") VALUES
${rows(units)};
`;

mkdirSync(dirname(migrationPath), { recursive: true });
writeFileSync(migrationPath, sql, "utf8");
console.log(`Wrote ${migrationPath} with ${books.length} books, ${sections.length} sections, ${points.length} points and ${units.length} units.`);
