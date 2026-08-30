import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { applyReadingReview } from "../../lib/server/ai/course-content-template";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const candidatePath = argument("--candidate");
  const reviewPath = argument("--review");
  const outputPath = argument("--output");
  if (!candidatePath || !reviewPath || !outputPath) throw new Error("Usage: --candidate <candidate.json> --review <review.json> --output <final-reading.json>");
  const candidate = JSON.parse(await readFile(path.resolve(candidatePath), "utf8"));
  const review = JSON.parse(await readFile(path.resolve(reviewPath), "utf8"));
  const result = applyReadingReview(candidate, review);
  await writeFile(path.resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
