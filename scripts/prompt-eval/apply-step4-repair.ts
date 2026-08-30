import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildReadingTemplateRequirements } from "../../lib/server/ai/course-content-deps";
import { STEP4_CONTENT_CONTRACT_VERSION, applyChapterTemplateRepairs, chapterTemplateRepairBundleSchema, parseReadingTemplatePayload } from "../../lib/server/ai/course-content-template";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const configPath = argument("--config");
  const initialPath = argument("--initial");
  const repairPath = argument("--repair");
  const outputPath = argument("--output");
  if (!configPath || !initialPath || !repairPath || !outputPath) throw new Error("Usage: --config <config.json> --initial <raw.txt> --repair <raw.txt> --output <combined.json>");

  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8")) as { args: unknown[] };
  const input = config.args[0] as Parameters<typeof buildReadingTemplateRequirements>[0];
  const requirements = buildReadingTemplateRequirements(input);
  const initialPayload = JSON.parse(await readFile(path.resolve(initialPath), "utf8")) as unknown;
  const initial = parseReadingTemplatePayload(initialPayload, requirements);
  const repair = chapterTemplateRepairBundleSchema.parse(JSON.parse(await readFile(path.resolve(repairPath), "utf8")));
  const chapters = initial.chapters.map((chapter) => {
    if (!chapter.generated) throw new Error(`Cannot repair missing chapter ${chapter.outlineChapterId}`);
    return applyChapterTemplateRepairs(chapter.generated, repair.repairs.filter((item) => item.outlineChapterId === chapter.outlineChapterId));
  });
  const combined = {
    contractVersion: STEP4_CONTENT_CONTRACT_VERSION,
    chapters,
    mainIdea: repair.mainIdea ?? initial.mainIdea,
  };
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(combined)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
