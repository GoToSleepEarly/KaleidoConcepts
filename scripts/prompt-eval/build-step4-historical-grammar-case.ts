import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { grammarCatalogBooks } from "../../prisma/grammar-catalog-data";

type HistoricalChapter = Record<string, unknown> & { id: string };
type HistoricalInput = {
  course: Record<string, unknown>;
  outline: Record<string, unknown> & { chapters: HistoricalChapter[] };
  knowledgePoints: unknown[];
  plan: Record<string, unknown>;
  [key: string]: unknown;
};

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourcePath = argument("--source");
  const outputPath = argument("--output");
  if (!sourcePath || !outputPath) throw new Error("Usage: --source <historical-config.json> --output <config.json>");
  const source = JSON.parse(await readFile(path.resolve(sourcePath), "utf8")) as { scope: string; method: string; args: [HistoricalInput, string] };
  const input = source.args[0];
  if (input.outline?.chapters?.length !== 3) throw new Error("This eval fixture requires exactly three historical chapters");

  const book = grammarCatalogBooks.find((candidate) => candidate.id === "essential-grammar-in-use-4");
  if (!book) throw new Error("Essential Grammar in Use catalog is missing");
  const pointIds = ["essential-grammar-in-use-4-u14", "essential-grammar-in-use-4-u8", "essential-grammar-in-use-4-u54"];
  const catalogPoints = new Map(book.sections.flatMap((section) => section.points.map((point) => [point.id, { ...point, section: section.officialTitle }] as const)));
  const knowledgePoints = pointIds.map((id) => {
    const point = catalogPoints.get(id);
    if (!point) throw new Error(`Grammar point is missing: ${id}`);
    return { id, label: point.title, category: point.section, bookTitle: book.title, edition: book.edition, officialLevel: book.officialLevel, unitStart: point.unitStart, unitEnd: point.unitEnd, units: point.units };
  });
  const usage = [
    "Contrast the ongoing escort with the Mirror Guard's completed interruption.",
    "Contrast the Guard's fixed copying rule with actions the team is observing and recording now.",
    "Use purpose infinitives for the fake dash, real wall, approach to the console, and shutdown plan.",
  ];

  input.course = { ...input.course, currentStage: "content", staleFromStage: undefined, knowledgePointIds: pointIds };
  input.knowledgePoints = knowledgePoints;
  input.outline.chapters = input.outline.chapters.map((chapter, index) => ({
    ...chapter,
    recommendedKnowledgePointIds: [pointIds[index]],
    knowledgePointRecommendationSummary: usage[index],
  }));
  input.plan = {
    ...input.plan,
    status: "confirmed",
    mainIdeaTargetWordCount: 100,
    chapters: input.outline.chapters.map((chapter, index) => ({
      outlineChapterId: chapter.id,
      targetWordCount: 105,
      paragraphCount: 2,
      knowledgePointIds: [pointIds[index]],
      readingExerciseMode: "interactive",
      readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
      chapterPractice: { enabled: true, grammar: { optionCloze: 2, wordForm: 2 } },
      touched: { targetWordCount: true, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: true },
    })),
    afterClassPractice: { enabled: true, vocabularyReviewEnabled: true, knowledgePointIds: pointIds, practice: { enabled: true, grammar: { optionCloze: 3, wordForm: 2 } }, touched: { knowledgePointIds: false, practice: true } },
  };

  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify({ scope: "content", method: "generateReading", args: [input, source.args[1]] }, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
