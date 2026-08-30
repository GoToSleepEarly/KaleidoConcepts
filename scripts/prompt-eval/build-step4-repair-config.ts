import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { englishWordCount } from "../../lib/domain/course-content";
import { buildReadingTemplateRequirements, mainIdeaWordCountPolicy } from "../../lib/server/ai/course-content-deps";
import { compileChapterTemplate, parseReadingTemplatePayload, type ChapterTemplateIssue, type ChapterTemplateRequirements, type GeneratedChapterTemplate } from "../../lib/server/ai/course-content-template";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourceConfigPath = argument("--config");
  const responsePath = argument("--response");
  const outputPath = argument("--output");
  if (!sourceConfigPath || !responsePath || !outputPath) throw new Error("Usage: --config <generation-config.json> --response <raw.txt> --output <repair-config.json>");

  const source = JSON.parse(await readFile(path.resolve(sourceConfigPath), "utf8")) as { args: unknown[] };
  const input = source.args[0] as Parameters<typeof buildReadingTemplateRequirements>[0];
  const writingProvider = source.args[1];
  const payload = JSON.parse(await readFile(path.resolve(responsePath), "utf8")) as unknown;
  const requirements = buildReadingTemplateRequirements(input);
  const parsed = parseReadingTemplatePayload(payload, requirements);
  const targets: Array<{
    current: GeneratedChapterTemplate | null;
    requirements: ChapterTemplateRequirements;
    issues: ChapterTemplateIssue[];
    parseError: string | null;
  }> = [];
  for (const requirement of requirements) {
    const chapter = parsed.chapters.find((candidate) => candidate.outlineChapterId === requirement.outlineChapterId);
    if (!chapter?.generated) {
      const parseError = chapter?.parseError ?? "章节缺失";
      targets.push({ current: null, requirements: requirement, issues: [{ code: "part_structure", message: parseError }], parseError });
      continue;
    }
    const issues = compileChapterTemplate(chapter.generated, requirement).issues;
    if (issues.length) targets.push({ current: chapter.generated, requirements: requirement, issues, parseError: chapter.parseError });
  }
  const mainIdeaPolicy = mainIdeaWordCountPolicy(input.plan.mainIdeaTargetWordCount ?? 120);
  const mainIdeaCount = englishWordCount(parsed.mainIdea?.text ?? "");
  const mainIdeaIssue = !parsed.mainIdea || mainIdeaCount < mainIdeaPolicy.acceptedRange[0] || mainIdeaCount > mainIdeaPolicy.acceptedRange[1]
    ? { current: parsed.mainIdea, issues: [parsed.mainIdeaError ?? `Main Idea 词数应为 ${mainIdeaPolicy.acceptedRange[0]}–${mainIdeaPolicy.acceptedRange[1]}，实际 ${mainIdeaCount}`] }
    : null;
  if (!targets.length && !mainIdeaIssue) throw new Error("No repair target found");
  const args = mainIdeaIssue ? [input, writingProvider, targets, mainIdeaIssue] : [input, writingProvider, targets];
  const output = { scope: "content", method: "repairReading", args };
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ chapterTargetCount: targets.length, mainIdeaTarget: Boolean(mainIdeaIssue) }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
