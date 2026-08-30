import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCleanParagraphText, englishWordCount, validateGrammarCoverage, validateParagraphParts } from "../../lib/domain/course-content";
import { buildReadingTemplateRequirements, mainIdeaWordCountPolicy } from "../../lib/server/ai/course-content-deps";
import { compileChapterTemplate, parseReadingTemplatePayload } from "../../lib/server/ai/course-content-template";
import { requiresExerciseAi } from "../../lib/server/repositories/course-content";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const configPath = argument("--config");
  const responsePath = argument("--response");
  const outputPath = argument("--output");
  if (!configPath || !responsePath || !outputPath) throw new Error("Usage: --config <config.json> --response <raw.txt> --output <validation.json>");

  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8")) as { args: unknown[] };
  const input = config.args[0] as Parameters<typeof buildReadingTemplateRequirements>[0];
  const raw = await readFile(path.resolve(responsePath), "utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }
  const requirements = buildReadingTemplateRequirements(input);
  const parsed = parseReadingTemplatePayload(payload, requirements);
  const chapters = requirements.map((requirement) => {
    const candidate = parsed.chapters.find((chapter) => chapter.outlineChapterId === requirement.outlineChapterId);
    if (!candidate?.generated) return { outlineChapterId: requirement.outlineChapterId, pass: false, parseError: candidate?.parseError ?? "章节缺失" };
    const compiled = compileChapterTemplate(candidate.generated, requirement);
    const pointIds = new Map(requirement.grammarPoints.flatMap((point) => point.knowledgePointId ? [[point.key, point.knowledgePointId] as const] : []));
    const grammar = compiled.paragraphs.flatMap((paragraph) => paragraph.parts).filter((part) => part.type === "grammar").map((part) => ({ ...part, knowledgePointId: pointIds.get(part.knowledgePointId) ?? part.knowledgePointId }));
    const requiredPointIds = input.plan.chapters.find((chapter) => chapter.outlineChapterId === requirement.outlineChapterId)?.knowledgePointIds ?? [];
    const domainIssues = [
      ...compiled.paragraphs.flatMap(validateParagraphParts),
      ...(validateGrammarCoverage(requiredPointIds, grammar).length ? ["正文语法题未覆盖计划知识点"] : []),
    ];
    return {
      outlineChapterId: requirement.outlineChapterId,
      pass: compiled.issues.length === 0 && domainIssues.length === 0,
      wordCount: compiled.wordCount,
      paragraphWordCounts: compiled.paragraphWordCounts,
      cleanParagraphs: compiled.paragraphs.map(buildCleanParagraphText),
      structuredIssues: compiled.issues,
      domainIssues: [...new Set(domainIssues)],
    };
  });
  const mainIdeaCount = englishWordCount(parsed.mainIdea?.text ?? "");
  const mainIdeaPolicy = mainIdeaWordCountPolicy(input.plan.mainIdeaTargetWordCount ?? 120);
  const mainIdeaPass = Boolean(parsed.mainIdea) && mainIdeaCount >= mainIdeaPolicy.acceptedRange[0] && mainIdeaCount <= mainIdeaPolicy.acceptedRange[1];
  const report = {
    envelopeError: parsed.envelopeError,
    firstPassReady: !parsed.envelopeError && chapters.every((chapter) => chapter.pass) && mainIdeaPass,
    chapters,
    mainIdea: { pass: mainIdeaPass, wordCount: mainIdeaCount, acceptedRange: mainIdeaPolicy.acceptedRange, text: parsed.mainIdea?.text ?? null, parseError: parsed.mainIdeaError },
    exerciseAiRequired: requiresExerciseAi(input.plan),
  };
  await writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ firstPassReady: report.firstPassReady, chapterPasses: chapters.map((chapter) => chapter.pass), mainIdeaPass, exerciseAiRequired: report.exerciseAiRequired }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
