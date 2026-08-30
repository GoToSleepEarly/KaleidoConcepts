import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildReadingTemplateRequirements } from "../../lib/server/ai/course-content-deps";
import { compileChapterTemplate, parseReadingTemplatePayload } from "../../lib/server/ai/course-content-template";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const configPath = argument("--config");
  const readingPath = argument("--reading");
  const outputPath = argument("--output");
  if (!configPath || !readingPath || !outputPath) throw new Error("Usage: --config <reading-config.json> --reading <final-reading.json> --output <exercise-config.json>");
  const source = JSON.parse(await readFile(path.resolve(configPath), "utf8")) as { args: unknown[] };
  const input = source.args[0] as Parameters<typeof buildReadingTemplateRequirements>[0];
  const writingProvider = source.args[1];
  const requirements = buildReadingTemplateRequirements(input);
  const parsed = parseReadingTemplatePayload(JSON.parse(await readFile(path.resolve(readingPath), "utf8")), requirements);
  const cleanChapters = requirements.map((requirement) => {
    const candidate = parsed.chapters.find((chapter) => chapter.outlineChapterId === requirement.outlineChapterId)?.generated;
    if (!candidate) throw new Error(`Reading chapter missing: ${requirement.outlineChapterId}`);
    const compiled = compileChapterTemplate(candidate, requirement);
    if (compiled.issues.length) throw new Error(`Reading chapter invalid: ${requirement.outlineChapterId}`);
    const outline = input.outline.chapters.find((chapter) => chapter.id === requirement.outlineChapterId);
    return { outlineChapterId: requirement.outlineChapterId, title: outline?.title ?? requirement.outlineChapterId, cleanText: compiled.cleanText };
  });
  const output = { scope: "content", method: "generateExercises", args: [input, writingProvider, cleanChapters] };
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
