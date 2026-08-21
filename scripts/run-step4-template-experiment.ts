import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { createStoryOutlineProvider, StoryOutlineIncompleteResponseError } from "@/lib/server/ai/story-outline-provider";
import {
  buildChapterTemplateExperimentPrompt,
  buildReadingTemplateExperimentPrompt,
  compileChapterTemplate,
  generatedChapterTemplateSchema,
  type ChapterTemplatePromptContext,
  type ChapterTemplateRequirements,
} from "@/lib/server/ai/course-content-template-experiment";
import { parseAiJson } from "@/lib/server/validation/course-content";

const fixtureSchema = z.object({
  course: z.object({
    id: z.string(),
    title: z.string(),
    englishLevel: z.string(),
    people: z.array(z.object({ englishNameSnapshot: z.string(), role: z.enum(["teacher", "student"]) }).passthrough()),
    characters: z.array(z.object({ displayName: z.string(), englishName: z.string(), roleInStory: z.string(), shortDescription: z.string() }).passthrough()),
  }).passthrough(),
  storyOutline: z.object({
    title: z.string(),
    summary: z.string(),
    chapters: z.array(z.object({
      id: z.string(),
      order: z.number(),
      title: z.string(),
      storyGoal: z.string(),
      keyEvents: z.array(z.string()),
    }).passthrough()),
  }).passthrough(),
  teachingPlan: z.object({
    chapters: z.array(z.object({
      outlineChapterId: z.string(),
      targetWordCount: z.number(),
      paragraphCount: z.number(),
      knowledgePointIds: z.array(z.string()),
      readingExercises: z.object({
        grammar: z.object({ optionCloze: z.number(), wordForm: z.number() }),
        vocabulary: z.object({ chineseHint: z.number() }),
      }),
    }).passthrough()),
  }).passthrough(),
  lessonContent: z.object({ writingProvider: z.enum(["quickrouter_gpt", "quickrouter_deepseek"]) }).passthrough(),
  knowledgePoints: z.array(z.object({ id: z.string(), label: z.string(), category: z.string().optional() }).passthrough()),
}).passthrough();

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function chapterSummary(chapter: { storyGoal: string; keyEvents: string[] }) {
  return chapter.keyEvents[0] || chapter.storyGoal;
}

const fixturePath = argument("--fixture");
const responsePath = argument("--response");
const prepareOnly = process.argv.includes("--prepare-only");
const allChapters = process.argv.includes("--all-chapters");
const requestedOrder = Number(argument("--chapter-order") || "5");
if (!fixturePath || (!allChapters && (!Number.isInteger(requestedOrder) || requestedOrder < 1))) {
  throw new Error("Usage: tsx scripts/run-step4-template-experiment.ts --fixture <json> [--chapter-order 5 | --all-chapters --prepare-only]");
}
const resolvedFixturePath = path.resolve(fixturePath);

async function main() {
  const fixture = fixtureSchema.parse(JSON.parse(await readFile(resolvedFixturePath, "utf8")));
  const keyById = new Map(fixture.knowledgePoints.map((point, index) => [point.id, `KP${index + 1}`]));
  const labelById = new Map(fixture.knowledgePoints.map((point) => [point.id, point.label]));
  const categoryById = new Map(fixture.knowledgePoints.map((point) => [point.id, point.category]));
  const requirementsFor = (outlineChapterId: string) => {
    const planChapter = fixture.teachingPlan.chapters.find((chapter) => chapter.outlineChapterId === outlineChapterId);
    if (!planChapter) throw new Error(`Teaching plan chapter ${outlineChapterId} not found`);
    const grammarPoints = planChapter.knowledgePointIds.map((id) => ({
      key: keyById.get(id) ?? `UNKNOWN_${id}`,
      label: labelById.get(id) ?? id,
      category: categoryById.get(id),
    }));
    return {
      outlineChapterId,
      paragraphCount: planChapter.paragraphCount,
      targetWordCount: planChapter.targetWordCount,
      optionClozeCount: planChapter.readingExercises.grammar.optionCloze,
      wordFormCount: planChapter.readingExercises.grammar.wordForm,
      vocabularyCount: planChapter.readingExercises.vocabulary.chineseHint,
      grammarPoints,
    } satisfies ChapterTemplateRequirements;
  };

  if (allChapters) {
    if (!prepareOnly) throw new Error("--all-chapters 当前仅允许与 --prepare-only 一起使用，避免误触发整课 AI 调用");
    const batchContext = {
      storyTitle: fixture.storyOutline.title,
      storySummary: fixture.storyOutline.summary,
      englishLevel: fixture.course.englishLevel,
      people: fixture.course.people.map((person) => ({ englishName: person.englishNameSnapshot, role: person.role })),
      storyCharacters: fixture.course.characters.map((character) => ({
        displayName: character.englishName || character.displayName,
        storyRole: character.shortDescription && character.shortDescription !== character.roleInStory
          ? `${character.roleInStory}；${character.shortDescription}`
          : character.roleInStory,
      })),
      chapters: fixture.storyOutline.chapters.map((chapter) => ({
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        summary: chapterSummary(chapter),
        requirements: requirementsFor(chapter.id),
      })),
    };
    const prompt = buildReadingTemplateExperimentPrompt(batchContext);
    const requestFile = path.resolve("output", `step4-template-experiment-${fixture.course.id}-all-request.json`);
    await mkdir(path.dirname(requestFile), { recursive: true });
    await writeFile(requestFile, JSON.stringify({ model: process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol", input: prompt, reasoning: { effort: "low" }, max_output_tokens: 6_500 }), "utf8");
    console.log(JSON.stringify({ requestFile, promptCharacters: prompt.length, chapterCount: batchContext.chapters.length, maxOutputTokens: 6_500, aiCalled: false }, null, 2));
    return;
  }
  const outlineChapter = fixture.storyOutline.chapters.find((chapter) => chapter.order === requestedOrder);
  if (!outlineChapter) throw new Error(`Outline chapter ${requestedOrder} not found`);
  const planChapter = fixture.teachingPlan.chapters.find((chapter) => chapter.outlineChapterId === outlineChapter.id);
  if (!planChapter) throw new Error(`Teaching plan chapter ${outlineChapter.id} not found`);

  const requirements = requirementsFor(outlineChapter.id);
  const grammarPoints = requirements.grammarPoints;
  const context: ChapterTemplatePromptContext = {
    storyTitle: fixture.storyOutline.title,
    storySummary: fixture.storyOutline.summary,
    englishLevel: fixture.course.englishLevel,
    chapter: {
      id: outlineChapter.id,
      order: outlineChapter.order,
      title: outlineChapter.title,
      summary: chapterSummary(outlineChapter),
    },
    surroundingChapters: fixture.storyOutline.chapters
      .filter((chapter) => chapter.id !== outlineChapter.id)
      .map((chapter) => ({ order: chapter.order, title: chapter.title, summary: chapterSummary(chapter) })),
    grammarPoints,
    people: fixture.course.people.map((person) => ({ englishName: person.englishNameSnapshot, role: person.role })),
    storyCharacters: fixture.course.characters.map((character) => ({
      displayName: character.englishName || character.displayName,
      storyRole: character.shortDescription && character.shortDescription !== character.roleInStory
        ? `${character.roleInStory}；${character.shortDescription}`
        : character.roleInStory,
    })),
    requirements,
  };
  const prompt = buildChapterTemplateExperimentPrompt(context);
  const startedAt = Date.now();
  const outputFile = path.resolve("output", `step4-template-experiment-${fixture.course.id}-chapter-${requestedOrder}.json`);
  const requestFile = path.resolve("output", `step4-template-experiment-${fixture.course.id}-chapter-${requestedOrder}-request.json`);
  if (prepareOnly) {
    const requestBody = {
      model: process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol",
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 2_200,
    };
    await mkdir(path.dirname(requestFile), { recursive: true });
    await writeFile(requestFile, JSON.stringify(requestBody), "utf8");
    console.log(JSON.stringify({ requestFile, promptCharacters: prompt.length, maxOutputTokens: 2_200 }, null, 2));
    return;
  }

  try {
    let response: { text: string; usage?: unknown };
    if (responsePath) {
      const rawEnvelope = JSON.parse(await readFile(path.resolve(responsePath), "utf8")) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
        usage?: unknown;
        error?: { message?: string };
      };
      const text = rawEnvelope.output_text
        || rawEnvelope.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter((item): item is string => Boolean(item)).join("\n");
      if (!text) throw new Error(rawEnvelope.error?.message || "实验响应没有可解析的 output text");
      response = { text, usage: rawEnvelope.usage };
    } else {
      const provider = createStoryOutlineProvider(undefined, "quickrouter");
      response = await provider.generateOutline({
        writingProvider: fixture.lessonContent.writingProvider,
        operation: `content_template_experiment_chapter_${requestedOrder}`,
        prompt,
        reasoningEffort: "low",
        maxOutputTokens: 2_200,
      });
    }
    const generated = parseAiJson(response.text, generatedChapterTemplateSchema, "实验章节模板结构解析失败");
    const compiled = compileChapterTemplate(generated, requirements);
    const result = {
      fixture: { courseId: fixture.course.id, chapterOrder: requestedOrder, outlineChapterId: outlineChapter.id },
      request: { reasoningEffort: "low", maxOutputTokens: 2_200, promptCharacters: prompt.length },
      latencyMs: Date.now() - startedAt,
      usage: response.usage,
      generated,
      compiled: { cleanText: compiled.cleanText, wordCount: compiled.wordCount, issues: compiled.issues },
      rawResponse: response.text,
    };
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ outputFile, latencyMs: result.latencyMs, usage: result.usage, wordCount: compiled.wordCount, issues: compiled.issues }, null, 2));
  } catch (error) {
    const result = {
      fixture: { courseId: fixture.course.id, chapterOrder: requestedOrder, outlineChapterId: outlineChapter.id },
      request: { reasoningEffort: "low", maxOutputTokens: 2_200, promptCharacters: prompt.length },
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      usage: error instanceof StoryOutlineIncompleteResponseError ? error.usage : undefined,
    };
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.error(JSON.stringify({ outputFile, ...result }, null, 2));
    process.exitCode = 1;
  }
}

void main();
