import { z } from "zod";

import type { StoryWritingProvider } from "@/lib/contracts/api";
import { createStoryOutlineProvider } from "@/lib/server/ai/story-outline-provider";
import { parseAiJson } from "@/lib/server/validation/course-content";

const nonEmpty = z.string().trim().min(1);

export type CourseVisualPlanPromptInput = {
  course: { title: string; englishLevel: string | null };
  outline: {
    title: string;
    summary: string;
    chapters: Array<{ id: string; order: number; title: string; setting: string }>;
  };
  characters: Array<{
    id: string;
    displayName: string;
    sourceType: string;
    roleInStory: string;
    shortDescription: string;
    visualDescription: string | null;
  }>;
  paragraphs: Array<{ id: string; chapterId: string; text: string }>;
};

const generatedPlanSchema = z.object({
  visualStyle: nonEmpty.max(800),
  storyWorld: nonEmpty.max(800),
  characterDesigns: z.array(z.object({
    characterId: nonEmpty,
    storyVisualDesign: nonEmpty.max(800),
  }).strict()),
  cover: z.object({
    focus: nonEmpty.max(800),
    characterIds: z.array(nonEmpty),
    scenePrompt: nonEmpty.max(1600),
  }).strict(),
  shots: z.array(z.object({
    paragraphId: nonEmpty,
    focus: nonEmpty.max(800),
    characterIds: z.array(nonEmpty),
    scenePrompt: nonEmpty.max(1600),
  }).strict()),
}).strict();

export type CourseVisualPlan = z.infer<typeof generatedPlanSchema>;
export type CourseVisualPlanScene = CourseVisualPlan["cover"] | CourseVisualPlan["shots"][number];

function sameMembers(actual: string[], expected: string[]) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function parseCourseVisualPlan(value: unknown, input: CourseVisualPlanPromptInput): CourseVisualPlan {
  const parsed = generatedPlanSchema.parse(value);
  const characterIds = input.characters.map((character) => character.id);
  const knownCharacterIds = new Set(characterIds);
  const paragraphIds = input.paragraphs.map((paragraph) => paragraph.id);
  const designIds = parsed.characterDesigns.map((design) => design.characterId);
  const shotParagraphIds = parsed.shots.map((shot) => shot.paragraphId);
  if (!sameMembers(designIds, characterIds)) throw new Error("视觉资源方案没有为每个出场角色生成唯一造型设定");
  if (!sameMembers(shotParagraphIds, paragraphIds)) throw new Error("视觉资源方案没有逐段覆盖已确认正文");
  const scenes: CourseVisualPlanScene[] = [parsed.cover, ...parsed.shots];
  if (scenes.some((scene) => scene.characterIds.some((id) => !knownCharacterIds.has(id)))) throw new Error("视觉资源方案包含未知角色");
  return parsed;
}

export function buildCourseVisualPlanPrompt(input: CourseVisualPlanPromptInput) {
  return [
    "Create a stable visual plan for one children's English picture-book lesson.",
    "Return all creative fields in English as strict JSON only.",
    "First create one course-wide visualStyle, one coherent storyWorld, and one stable storyVisualDesign per character. These are the visual bible for every image in this lesson.",
    "For person and referenced characters, attached images will be identity appearance only: facial structure, hairstyle, age impression, body build, and distinctive physical traits.",
    "Do not copy clothing, accessories, pose, background, photography style, or composition from identity references. Design story-appropriate clothing and props from the character's role, setting, and plot.",
    "Keep each character's default story clothing, accessories, silhouette, and palette identical across cover and shots unless the paragraph explicitly requires a story-driven change.",
    "Create a memorable horizontal story-poster cover, not a group portrait, profile photo, character sheet, or lineup.",
    "Create exactly one shot for every paragraph id. Use only the characters who actually appear in that paragraph.",
    "scenePrompt describes only the scene action, environment, mood, and wide composition. Do not rewrite the character design differently inside each scenePrompt.",
    "Do not request readable text, letters, numbers, signs, speech bubbles, logos, or watermarks.",
    "Return {visualStyle,storyWorld,characterDesigns:[{characterId,storyVisualDesign}],cover:{focus,characterIds,scenePrompt},shots:[{paragraphId,focus,characterIds,scenePrompt}]}.",
    "<lesson_context>",
    JSON.stringify(input),
    "</lesson_context>",
  ].join("\n");
}

export function compileCourseImagePrompt(plan: CourseVisualPlan, scene: CourseVisualPlanScene) {
  const designById = new Map(plan.characterDesigns.map((design) => [design.characterId, design.storyVisualDesign]));
  const characterLock = scene.characterIds.map((id) => `- ${id}: ${designById.get(id)}`).join("\n") || "- No recurring character is visible in this scene.";
  return [
    "GPT Image 2 prompt: Horizontal 16:9 children's picture-book scene for a PPT slide, composed edge to edge within a wide landscape frame.",
    `COURSE VISUAL STYLE LOCK: ${plan.visualStyle}`,
    `STORY WORLD LOCK: ${plan.storyWorld}`,
    "IDENTITY REFERENCE RULE: Use attached people only for facial identity, hairstyle, age impression, body build, and distinctive physical traits. Ignore all clothing, pose, background, photography style, and composition from attached identity references.",
    "COURSE CHARACTER DESIGN LOCK — reproduce these exact story designs consistently:",
    characterLock,
    `SCENE: ${scene.scenePrompt}`,
    `FOCUS: ${scene.focus}`,
    "COMPOSITION: a wide narrative environment with clear character interaction and PPT-safe subject placement; not a portrait, profile photo, character sheet, or full-body lineup.",
    "PURE IMAGE: no readable text, letters, numbers, signs, speech bubbles, logos, borders, or watermarks.",
  ].join("\n");
}

export function createCourseVisualPlanDeps() {
  const provider = createStoryOutlineProvider();
  return {
    async generate(input: CourseVisualPlanPromptInput, writingProvider: StoryWritingProvider) {
      const response = await provider.generateOutline({
        writingProvider,
        operation: "visual_generate_resource_plan",
        prompt: buildCourseVisualPlanPrompt(input),
        timeoutMs: 600_000,
      });
      return parseCourseVisualPlan(parseAiJson(response.text, generatedPlanSchema, "视觉资源方案结构解析失败"), input);
    },
  };
}

export type CourseVisualPlanDeps = ReturnType<typeof createCourseVisualPlanDeps>;
