import { z } from "zod";

import type { CourseSourceReferenceType, StoryWritingProvider } from "@/lib/contracts/api";
import { devAiLog } from "@/lib/server/ai/dev-ai-log";
import { createStoryOutlineProvider, StoryOutlineIncompleteResponseError } from "@/lib/server/ai/story-outline-provider";
import type { AiProviderSettingsInput } from "@/lib/ai-gateway";
import { parseAiJson } from "@/lib/server/validation/course-content";

const nonEmpty = z.string().trim().min(1);
const nullableText = z.string().trim().min(1).nullable();

export type CourseVisualPlanPromptInput = {
  mode: "faithful" | "originalized";
  baselinePlan?: CourseVisualPlan | null;
  storyTitle: string;
  characters: Array<{
    id: string;
    displayName: string;
    englishName: string;
    sourceType: string;
    reference: {
      name: string;
      type: CourseSourceReferenceType;
      summary?: string;
    } | null;
    roleInStory: string;
  }>;
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    paragraphs: Array<{ id: string; cleanReading: string }>;
  }>;
};

const visualAnchorSchema = z.object({
  mode: z.enum(["reference", "semantic", "description"]),
  label: nonEmpty.max(200),
  context: nullableText.pipe(z.string().max(300).nullable()),
}).strict();

const characterDesignSchema = z.object({
  characterId: nonEmpty,
  visualAnchor: visualAnchorSchema,
  appearanceDescription: nullableText.pipe(z.string().max(400).nullable()).optional(),
  courseAppearance: nonEmpty.max(400),
}).strict();

const sceneSchema = z.object({
  focus: nonEmpty.max(500),
  characterIds: z.array(nonEmpty),
  sceneDescription: nonEmpty.max(1200),
}).strict();

function limitedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : value;
}

function normalizeScene(value: unknown, includeParagraphId: boolean) {
  if (!value || typeof value !== "object") return value;
  return {
    ...(includeParagraphId ? { paragraphId: Reflect.get(value, "paragraphId") } : {}),
    focus: limitedText(Reflect.get(value, "focus"), 500),
    characterIds: Reflect.get(value, "characterIds"),
    sceneDescription: limitedText(Reflect.get(value, "sceneDescription"), 1200),
  };
}

function normalizeGeneratedPlan(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const characterDesigns = Reflect.get(value, "characterDesigns");
  const shots = Reflect.get(value, "shots");
  return {
    visualStyle: limitedText(Reflect.get(value, "visualStyle"), 500),
    storyWorld: limitedText(Reflect.get(value, "storyWorld"), 500),
    characterDesigns: Array.isArray(characterDesigns) ? characterDesigns.map((design) => {
      if (!design || typeof design !== "object") return design;
      const anchor = Reflect.get(design, "visualAnchor");
      return {
        characterId: Reflect.get(design, "characterId"),
        visualAnchor: anchor && typeof anchor === "object" ? {
          mode: Reflect.get(anchor, "mode"),
          label: limitedText(Reflect.get(anchor, "label"), 200),
          context: Reflect.get(anchor, "context") ?? null,
        } : anchor,
        ...(Reflect.has(design, "appearanceDescription") ? { appearanceDescription: limitedText(Reflect.get(design, "appearanceDescription"), 400) } : {}),
        courseAppearance: limitedText(Reflect.get(design, "courseAppearance"), 400),
      };
    }) : characterDesigns,
    cover: normalizeScene(Reflect.get(value, "cover"), false),
    shots: Array.isArray(shots) ? shots.map((shot) => normalizeScene(shot, true)) : shots,
  };
}

const generatedPlanSchema = z.preprocess(normalizeGeneratedPlan, z.object({
  visualStyle: nonEmpty.max(500),
  storyWorld: nonEmpty.max(500),
  characterDesigns: z.array(characterDesignSchema),
  cover: sceneSchema,
  shots: z.array(sceneSchema.extend({ paragraphId: nonEmpty }).strict()),
}).strict());

const optionalAiText = (maximum: number) => z.preprocess(
  (value) => value === undefined || value === "" ? null : value,
  z.string().trim().min(1).max(maximum).nullable(),
);

const aiCharacterDesignSchema = z.object({
  characterKey: nonEmpty.max(20),
  visualLabel: optionalAiText(200),
  characterAppearance: optionalAiText(400),
  courseAppearance: nonEmpty.max(400),
}).strict();

const aiSceneSchema = z.object({
  focus: nonEmpty.max(500),
  characterKeys: z.array(nonEmpty.max(20)),
  sceneDescription: nonEmpty.max(1200),
}).strict();

function normalizeAiScene(value: unknown, includeParagraphKey: boolean) {
  if (!value || typeof value !== "object") return value;
  return {
    ...(includeParagraphKey ? { paragraphKey: Reflect.get(value, "paragraphKey") } : {}),
    focus: limitedText(Reflect.get(value, "focus"), 500),
    characterKeys: Reflect.get(value, "characterKeys"),
    sceneDescription: limitedText(Reflect.get(value, "sceneDescription"), 1200),
  };
}

function normalizeAiResponse(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const designs = Reflect.get(value, "characterDesigns");
  const shots = Reflect.get(value, "shots");
  return {
    visualStyle: limitedText(Reflect.get(value, "visualStyle"), 500),
    storyWorld: limitedText(Reflect.get(value, "storyWorld"), 500),
    characterDesigns: Array.isArray(designs) ? designs.map((design) => {
      if (!design || typeof design !== "object") return design;
      return {
        characterKey: Reflect.get(design, "characterKey"),
        visualLabel: Reflect.get(design, "visualLabel") ?? null,
        characterAppearance: Reflect.get(design, "characterAppearance") ?? null,
        courseAppearance: Reflect.get(design, "courseAppearance"),
      };
    }) : designs,
    cover: normalizeAiScene(Reflect.get(value, "cover"), false),
    shots: Array.isArray(shots) ? shots.map((shot) => normalizeAiScene(shot, true)) : shots,
  };
}

const aiResponseSchema = z.preprocess(normalizeAiResponse, z.object({
  visualStyle: nonEmpty.max(500),
  storyWorld: nonEmpty.max(500),
  characterDesigns: z.array(aiCharacterDesignSchema),
  cover: aiSceneSchema,
  shots: z.array(aiSceneSchema.extend({ paragraphKey: nonEmpty.max(20) }).strict()),
}).strict());

type AiVisualPlanResponse = z.infer<typeof aiResponseSchema>;

export type CourseVisualPlan = z.infer<typeof generatedPlanSchema>;
export type CourseVisualPlanScene = CourseVisualPlan["cover"] | CourseVisualPlan["shots"][number];
export type CourseImagePromptCharacter = {
  characterId: string;
  characterKey: string;
  chineseName: string;
  englishName: string;
  referenceIndex?: number;
  useVisualLabel?: boolean;
};

export type CourseVisualPlanDiagnostics = {
  kind: "incomplete" | "invalid_json" | "invalid_structure" | "invalid_semantics" | "service_error";
  responseCharacters?: number;
  responseEndsWithClosingBrace?: boolean;
  incompleteReason?: string;
  issues?: Array<{ path: string; message: string; code: string }>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    visibleOutputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
};

export class CourseVisualPlanResponseError extends Error {
  constructor(
    message = "AI 返回的视觉方案内容不完整，请重试",
    readonly diagnostics: CourseVisualPlanDiagnostics = { kind: "invalid_structure" },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CourseVisualPlanResponseError";
  }
}

function sameMembers(actual: string[], expected: string[]) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function parseCourseVisualPlan(value: unknown, input: CourseVisualPlanPromptInput): CourseVisualPlan {
  const parsed = generatedPlanSchema.parse(value);
  const characterIds = input.characters.map((character) => character.id);
  const knownCharacterIds = new Set(characterIds);
  const paragraphIds = input.chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => paragraph.id));
  const designIds = parsed.characterDesigns.map((design) => design.characterId);
  const shotParagraphIds = parsed.shots.map((shot) => shot.paragraphId);
  if (!sameMembers(designIds, characterIds)) throw new Error("视觉资源方案没有为每个出场角色生成唯一造型设定");
  if (!sameMembers(shotParagraphIds, paragraphIds)) throw new Error("视觉资源方案没有逐段覆盖已确认正文");
  const scenes: CourseVisualPlanScene[] = [parsed.cover, ...parsed.shots];
  if (scenes.some((scene) => scene.characterIds.some((id) => !knownCharacterIds.has(id)))) throw new Error("视觉资源方案包含未知角色");
  for (const design of parsed.characterDesigns) {
    const source = input.characters.find((character) => character.id === design.characterId);
    if (!source) continue;
    if (source.sourceType === "person" && (design.visualAnchor.mode !== "reference" || design.appearanceDescription)) {
      throw new Error("人物档案角色必须使用 reference 锚点，不能由文本编造身份外貌");
    }
    if (source.sourceType === "original" && design.visualAnchor.mode !== "description") {
      throw new Error("原创角色必须使用 description 锚点");
    }
    if (input.mode === "originalized" && source.sourceType === "referenced" && design.visualAnchor.mode !== "description") {
      throw new Error("原创化方案的引用角色必须使用 description 锚点");
    }
    if (design.visualAnchor.mode === "semantic" && !design.visualAnchor.context) throw new Error("semantic 锚点缺少人物、作品或版本上下文");
    if (design.visualAnchor.mode === "description" && !design.appearanceDescription) throw new Error("description 锚点缺少中文角色形象");
    if (design.visualAnchor.mode === "reference" && design.visualAnchor.context) throw new Error("reference 锚点不能编造文字上下文");
  }
  return parsed;
}

function shortKey(prefix: "C" | "P", index: number) {
  return `${prefix}${String(index + 1).padStart(2, "0")}`;
}

function aliasContext(input: CourseVisualPlanPromptInput) {
  let paragraphIndex = 0;
  const characterKeyById = new Map(input.characters.map((character, index) => [character.id, shortKey("C", index)]));
  const paragraphKeyById = new Map(input.chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => [paragraph.id, shortKey("P", paragraphIndex++)] as const)));
  paragraphIndex = 0;
  const baselineVisualPlan = input.mode === "originalized" && input.baselinePlan ? {
    visualStyle: input.baselinePlan.visualStyle,
    storyWorld: input.baselinePlan.storyWorld,
    characterDesigns: input.baselinePlan.characterDesigns.map((design) => ({
      characterKey: characterKeyById.get(design.characterId),
      visualLabel: design.visualAnchor.mode === "description" ? design.visualAnchor.label : null,
      characterAppearance: design.appearanceDescription ?? null,
      courseAppearance: design.courseAppearance,
    })),
    cover: {
      focus: input.baselinePlan.cover.focus,
      characterKeys: input.baselinePlan.cover.characterIds.map((id) => characterKeyById.get(id)),
      sceneDescription: input.baselinePlan.cover.sceneDescription,
    },
    shots: input.baselinePlan.shots.map((shot) => ({
      paragraphKey: paragraphKeyById.get(shot.paragraphId),
      focus: shot.focus,
      characterKeys: shot.characterIds.map((id) => characterKeyById.get(id)),
      sceneDescription: shot.sceneDescription,
    })),
  } : undefined;
  return {
    mode: input.mode,
    storyTitle: input.storyTitle,
    characters: input.characters.map((character, index) => ({
      characterKey: shortKey("C", index),
      displayName: character.displayName,
      englishName: character.englishName,
      sourceType: character.sourceType,
      reference: character.reference,
      roleInStory: character.roleInStory,
    })),
    chapters: input.chapters.map((chapter) => ({
      order: chapter.order,
      title: chapter.title,
      paragraphs: chapter.paragraphs.map((paragraph) => ({
        paragraphKey: shortKey("P", paragraphIndex++),
        cleanReading: paragraph.cleanReading,
      })),
    })),
    ...(baselineVisualPlan ? { baselineVisualPlan } : {}),
  };
}

function validateKeys(values: string[], allowed: Map<string, string>, path: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!allowed.has(value)) throw new Error(`${path}[${index}] = ${value} 是未知 key；允许值：${[...allowed.keys()].join("、")}`);
    if (seen.has(value)) throw new Error(`${path}[${index}] = ${value} 重复出现`);
    seen.add(value);
  });
}

function referenceContext(character: CourseVisualPlanPromptInput["characters"][number]) {
  if (!character.reference) return null;
  return [character.reference.name, character.reference.type, character.reference.summary].filter(Boolean).join("; ").slice(0, 300);
}

function materializeAiResponse(candidate: AiVisualPlanResponse, input: CourseVisualPlanPromptInput): CourseVisualPlan {
  const characterEntries = input.characters.map((character, index) => [shortKey("C", index), character] as const);
  const charactersByKey = new Map(characterEntries);
  const paragraphEntries: Array<readonly [string, { id: string }]> = [];
  let paragraphIndex = 0;
  for (const chapter of input.chapters) {
    for (const paragraph of chapter.paragraphs) paragraphEntries.push([shortKey("P", paragraphIndex++), paragraph] as const);
  }
  const paragraphsByKey = new Map(paragraphEntries);
  const designKeys = candidate.characterDesigns.map((design) => design.characterKey);
  validateKeys(designKeys, new Map(characterEntries.map(([key]) => [key, key])), "characterDesigns.characterKey");
  if (!sameMembers(designKeys, [...charactersByKey.keys()])) throw new Error(`角色设定未完整覆盖允许 key；实际：${designKeys.join("、")}`);
  const designsByKey = new Map(candidate.characterDesigns.map((design) => [design.characterKey, design]));
  const characterDesigns = characterEntries.map(([key, character]) => {
    const design = designsByKey.get(key);
    if (!design) throw new Error(`角色设定缺少 ${key}`);
    const courseAppearance = design.courseAppearance;
    if (character.sourceType === "person") {
      if (design.visualLabel) throw new Error(`${key} 是人物档案角色，不能返回 visualLabel`);
      if (design.characterAppearance) throw new Error(`${key} 是人物档案角色，不能返回 characterAppearance`);
      return { characterId: character.id, visualAnchor: { mode: "reference" as const, label: character.englishName, context: null }, appearanceDescription: null, courseAppearance };
    }
    if (!design.characterAppearance) throw new Error(`${key} 缺少必需的 characterAppearance`);
    if ((input.mode === "originalized" && character.sourceType === "referenced") || character.sourceType === "original") {
      if (input.mode === "originalized" && character.sourceType === "referenced" && !design.visualLabel) throw new Error(`${key} 缺少原创化必需的 visualLabel`);
      return { characterId: character.id, visualAnchor: { mode: "description" as const, label: design.visualLabel ?? character.englishName, context: null }, appearanceDescription: design.characterAppearance, courseAppearance };
    }
    if (design.visualLabel) throw new Error(`${key} 在忠实模式下不能改写 visualLabel`);
    const context = referenceContext(character);
    if (character.sourceType === "referenced") {
      if (!context) throw new Error(`${key} 是引用角色，但缺少有效参考资料关联`);
      return { characterId: character.id, visualAnchor: { mode: "semantic" as const, label: character.englishName, context }, appearanceDescription: design.characterAppearance, courseAppearance };
    }
    return { characterId: character.id, visualAnchor: { mode: "description" as const, label: character.englishName, context: null }, appearanceDescription: design.characterAppearance, courseAppearance };
  });
  const materializeScene = (scene: AiVisualPlanResponse["cover"], path: string) => {
    validateKeys(scene.characterKeys, new Map(characterEntries.map(([key]) => [key, key])), `${path}.characterKeys`);
    if (/\bC\d{2}\b/.test(`${scene.focus} ${scene.sceneDescription}`)) {
      throw new Error(`${path} 的自然场景文本不能包含内部角色 key`);
    }
    return { focus: scene.focus, characterIds: scene.characterKeys.map((key) => charactersByKey.get(key)!.id), sceneDescription: scene.sceneDescription };
  };
  const shotKeys = candidate.shots.map((shot) => shot.paragraphKey);
  validateKeys(shotKeys, new Map(paragraphEntries.map(([key]) => [key, key])), "shots.paragraphKey");
  if (!sameMembers(shotKeys, [...paragraphsByKey.keys()])) throw new Error(`分镜未完整覆盖允许 paragraphKey；实际：${shotKeys.join("、")}`);
  return parseCourseVisualPlan({
    visualStyle: candidate.visualStyle,
    storyWorld: candidate.storyWorld,
    characterDesigns,
    cover: materializeScene(candidate.cover, "cover"),
    shots: candidate.shots.map((shot) => ({ paragraphId: paragraphsByKey.get(shot.paragraphKey)!.id, ...materializeScene(shot, `shots[${shot.paragraphKey}]`) })),
  }, input);
}

export function parseCourseVisualPlanResponse(text: string, input: CourseVisualPlanPromptInput, tokenUsage?: CourseVisualPlanDiagnostics["tokenUsage"]) {
  try {
    const parsed = parseAiJson(text, aiResponseSchema, "视觉资源方案结构解析失败");
    return materializeAiResponse(parsed, input);
  } catch (error) {
    const parseCause = error instanceof Error ? error.cause : undefined;
    const diagnostics: CourseVisualPlanDiagnostics = {
      kind: parseCause instanceof SyntaxError ? "invalid_json" : parseCause instanceof z.ZodError ? "invalid_structure" : "invalid_semantics",
      responseCharacters: text.length,
      responseEndsWithClosingBrace: text.trimEnd().endsWith("}"),
      ...(parseCause instanceof z.ZodError ? {
        issues: parseCause.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message, code: issue.code })),
      } : {}),
      ...(!parseCause && error instanceof Error ? { issues: [{ path: "semantic_validation", message: error.message, code: "custom" }] } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
    };
    devAiLog({
      operation: input.mode === "originalized" ? "visual_originalize_resource_plan" : "visual_generate_resource_plan",
      phase: "error",
      payload: { stage: "validate_visual_plan_response", diagnostics },
      error,
    });
    throw new CourseVisualPlanResponseError(undefined, diagnostics, { cause: error });
  }
}

export function buildCourseVisualPlanPrompt(input: CourseVisualPlanPromptInput) {
  const identityRules = input.mode === "faithful"
    ? [
        "Do not rewrite character identity. visualLabel must be null for every character in faithful mode.",
        "For sourceType=person: characterAppearance must be null because identity comes only from the selected reference image.",
        "For sourceType=referenced: use the supplied official English name and reference context as a known identity. Preserve its recognizable face, hair, body silhouette, classic outfit, color language, and signature portable gear unless cleanReading explicitly requires a costume change. Do not redesign it as an original character.",
      ]
    : [
        "For sourceType=person: visualLabel and characterAppearance must both be null because identity comes only from the selected reference image.",
        "visualLabel is required only for sourceType=referenced characters; create a self-contained visual identity that can preserve the broad archetype and emotional impression without depending on recognition of the referenced work.",
        "For every sourceType=person or sourceType=original character, copy visualLabel, characterAppearance, and courseAppearance from baselineVisualPlan exactly. Do not redesign or restyle them.",
        "Preserve the baseline visual language, composition, atmosphere, color direction, materials, character relationships, and scene actions as closely as possible.",
        "Translate reference-dependent identities, named world elements, and signature visual combinations into self-contained descriptive designs. Keep generic scenery, period, climate, lighting, architecture functions, and color mood whenever they work without the referenced name. Broad archetypal resemblance and a similar emotional impression are acceptable; the resulting characters and world must stand on their own without relying on recognition of the referenced work.",
        "Copy every cover and shot characterKeys list exactly. Keep the same story action, composition, mood, and teaching meaning while expressing the setting through the rewritten storyWorld.",
        "Use the new visual labels consistently for originalized sourceType=referenced characters in every focus and sceneDescription. Express named locations, kingdoms, buildings, symbols, and background lore through their visible generic qualities and story function.",
      ];
  const context = aliasContext(input);
  return [
    "Create one concise visual bible for a children's English picture-book lesson. Return strict JSON only. visualStyle, storyWorld, focus, sceneDescription, and visualLabel must be English. characterAppearance and courseAppearance must be concise Simplified Chinese and are the only character-description truth source used by both teacher editing and image generation.",
    "Use only the supplied short characterKey values (C01, C02, ...) and paragraphKey values (P01, P02, ...). Never output or invent database IDs.",
    "Return exactly one characterDesign per supplied characterKey and exactly one shot per supplied paragraphKey. Copy each short key exactly. characterKeys may contain only supplied characterKey values and must not contain duplicates.",
    ...identityRules,
    "Create one visualStyle and one storyWorld for the whole lesson.",
    "characterAppearance is required for every non-person character and must be null for sourceType=person. It must be concise Simplified Chinese and describe only visible, stable identity appearance; do not include biography, personality, plot function, actions, or scene directions.",
    "courseAppearance is required for every character and must be concise Simplified Chinese. Write one fixed head-to-toe course-wide continuity specification: explicitly name the upper garment, lower garment, footwear, and any outer layer; give their exact main and secondary colors; add material or pattern plus the type and color of visually important portable props or accessories. Use one concrete choice for every item, never alternatives. When no new costume is needed, still describe the retained outfit in full instead of returning null.",
    "Do not use vague placeholders such as 'classic outfit', 'signature outfit', 'appropriate clothing', 'period clothing', 'sportswear', 'similar colors', 'retain the original outfit', or 'as in the reference'. Even for a faithful referenced character, restate every visible clothing component and its exact color palette concretely in courseAppearance.",
    "For sourceType=person, derive course clothing and props from the supplied story title and cleanReading together with the storyWorld you create. Do not default teachers to modern teacher clothing or students to generic sportswear. If the story uses a historical, fantasy, literary, or franchise world, adapt their clothing to that world while preserving identity from the reference image. Keep the result age-appropriate, practical for the character's actions, and visually coherent across the course.",
    "Never put identity, age, face, body, personality, expression, action, pose, gaze, ability, environment, or scene directions in courseAppearance.",
    "The same courseAppearance is immutable across the cover and every shot. Do not invent, omit, recolor, or restyle any listed item in focus or sceneDescription. Only when cleanReading explicitly describes a costume change may that scene state the changed item; all unspecified items remain fixed.",
    "Create one wide cover and exactly one shot per cleanReading paragraph. Use characterKeys only for the structured visible-character list.",
    input.mode === "faithful"
      ? "Keep focus and sceneDescription as complete, natural English. Refer to people and roles by their supplied englishName, never by C01/C02 internal keys. Keep sceneDescription about action, environment, mood, and composition. Carry explicit age, period clothing, costume changes, or transformations from cleanReading into that scene, but do not repeat full stable character descriptions."
      : "Keep focus and sceneDescription as complete, natural English and never expose C01/C02 internal keys. Use supplied englishName for unchanged people and original characters, but use only the new visualLabel for originalized referenced characters. Keep the baseline scene meaning and composition unchanged.",
    "Plan enough room for every named character to appear once with a visible face and recognizable identity. Avoid accidental edge crops of heads or faces; natural medium-shot body crops are allowed when they keep ensemble faces readable.",
    "Do not request readable text, logos, speech bubbles, borders, or watermarks.",
    "Keep visualStyle <= 80 words, storyWorld <= 80 words, each characterAppearance <= 60 Chinese characters, each courseAppearance <= 90 Chinese characters, each focus <= 30 words, and each sceneDescription <= 90 words. Do not repeat the lesson text.",
    "Return {visualStyle,storyWorld,characterDesigns:[{characterKey,visualLabel,characterAppearance,courseAppearance}],cover:{focus,characterKeys,sceneDescription},shots:[{paragraphKey,focus,characterKeys,sceneDescription}]}",
    "<lesson_context>",
    JSON.stringify(context),
    "</lesson_context>",
  ].join("\n");
}

function promptCharacterLine(design: CourseVisualPlan["characterDesigns"][number], context: CourseImagePromptCharacter) {
  const heading = context.useVisualLabel
    ? `${context.characterKey} — ${design.visualAnchor.label}`
    : `${context.characterKey} — ${context.chineseName} / ${context.englishName}`;
  const appearance = design.appearanceDescription ? ` 角色形象：${design.appearanceDescription}` : "";
  const courseAppearance = ` 本课造型：${design.courseAppearance}`;
  if (context.referenceIndex) {
    return `- ${heading}: reference image ${context.referenceIndex} belongs exclusively to ${context.characterKey} — ${context.englishName}; use reference image ${context.referenceIndex} for identity only—body build, face shape, facial features, hairstyle, hair color, glasses, distinctive traits, and age impression. Ignore reference clothing, pose, background, and framing.${appearance}${courseAppearance}`;
  }
  if (design.visualAnchor.mode === "semantic") {
    return `- ${heading}: known identity ${design.visualAnchor.label} (${design.visualAnchor.context}); preserve the recognizable named identity and do not merge it with another person or character.${appearance}${courseAppearance}`;
  }
  if (design.visualAnchor.mode === "description") return `- ${heading}:${appearance}${courseAppearance}`;
  return `- ${heading}: requires the identity reference image selected for this character; do not invent or replace the person's identity.${courseAppearance}`;
}

export function mergeOriginalizedVisualPlan(
  baseline: CourseVisualPlan,
  generated: CourseVisualPlan,
  characters: CourseVisualPlanPromptInput["characters"],
): CourseVisualPlan {
  const sourceTypeById = new Map(characters.map((character) => [character.id, character.sourceType]));
  const generatedDesignById = new Map(generated.characterDesigns.map((design) => [design.characterId, design]));
  const generatedShotByParagraph = new Map(generated.shots.map((shot) => [shot.paragraphId, shot]));
  return {
    visualStyle: generated.visualStyle,
    storyWorld: generated.storyWorld,
    characterDesigns: baseline.characterDesigns.map((design) => sourceTypeById.get(design.characterId) === "referenced"
      ? generatedDesignById.get(design.characterId) ?? design
      : design),
    cover: { ...generated.cover, characterIds: [...baseline.cover.characterIds] },
    shots: baseline.shots.map((shot) => {
      const rewritten = generatedShotByParagraph.get(shot.paragraphId);
      return rewritten ? { ...rewritten, characterIds: [...shot.characterIds] } : shot;
    }),
  };
}

export function compileCourseImagePrompt(
  plan: CourseVisualPlan,
  scene: CourseVisualPlanScene,
  kind: "cover" | "illustration",
  characters: CourseImagePromptCharacter[],
) {
  const designs = new Map(plan.characterDesigns.map((design) => [design.characterId, design]));
  const characterLines = characters.map((context) => {
    const design = designs.get(context.characterId);
    if (!design) throw new Error(`视觉方案缺少角色 ${context.characterId}`);
    return promptCharacterLine(design, context);
  });
  const referencedCharacterCount = characters.filter((character) => character.referenceIndex).length;
  return [
    kind === "cover"
      ? "Wide 16:9 children's picture-book cover illustration for a PPT lesson. Use the full canvas for one strong key visual; do not reserve blank title space."
      : "Wide 16:9 children's picture-book scene for a PPT slide. Narrative illustration for one lesson paragraph; prioritize the described action and emotional beat.",
    `Style: ${plan.visualStyle}`,
    `World: ${plan.storyWorld}`,
    characterLines.length ? `Characters:\n${characterLines.join("\n")}` : "Characters: no named recurring character is visible.",
    characterLines.length
      ? "Character continuity lock: Treat every 本课造型 above as an exact, immutable course-wide specification. Keep garment types, exact colors, materials, patterns, footwear, and portable props identical across the cover and every lesson illustration. Scene text must not override this specification unless it explicitly describes a costume change; then change only the stated item."
      : null,
    referencedCharacterCount >= 2
      ? "Identity separation lock: Each input reference image belongs only to its mapped character. Never merge, duplicate, or exchange identity traits between referenced characters."
      : null,
    `Scene: ${scene.sceneDescription}`,
    `Focus: ${scene.focus}`,
    characters.length >= 5
      ? "Framing: Use a layered ensemble composition rather than a lineup. Show every named character exactly once. Give the character or characters identified in Focus the strongest visual emphasis and enough facial scale to remain recognizable. Arrange the others naturally across the foreground and middle ground with clear visual separation. Choose a medium-wide or wide shot according to the action; do not force full bodies when that would make faces too small. Natural body overlap is allowed, but keep every named character's face and identity-defining features visible. Do not duplicate, merge, or exchange characters, faces, hairstyles, costumes, or personal props."
      : "Framing: Compose naturally for the action and emotion. Keep every named character fully inside the canvas and never crop a head or face at the image edge. Use full bodies when the action or composition calls for them; avoid character sheets, lineups, and head collages.",
    "Pure image: no readable text, logos, letters, numbers, speech bubbles, borders, or watermarks.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function createCourseVisualPlanDeps(settings: AiProviderSettingsInput = "quickrouter") {
  const provider = createStoryOutlineProvider(undefined, settings);
  return {
    async generate(
      input: CourseVisualPlanPromptInput,
      writingProvider: StoryWritingProvider,
      onResponse?: (response: { text: string; usage: CourseVisualPlanDiagnostics["tokenUsage"] | undefined }) => Promise<void>,
    ) {
      try {
        const response = await provider.generateOutline({
          writingProvider,
          operation: input.mode === "originalized" ? "visual_originalize_resource_plan" : "visual_generate_resource_plan",
          prompt: buildCourseVisualPlanPrompt(input),
          timeoutMs: 600_000,
          reasoningEffort: "low",
        });
        await onResponse?.(response);
        return { plan: parseCourseVisualPlanResponse(response.text, input, response.usage), usage: response.usage };
      } catch (error) {
        if (error instanceof CourseVisualPlanResponseError) throw error;
        if (error instanceof StoryOutlineIncompleteResponseError) {
          throw new CourseVisualPlanResponseError("AI 返回的视觉方案未完成，请重试", {
            kind: "incomplete",
            incompleteReason: error.reason,
            ...(error.usage ? { tokenUsage: error.usage } : {}),
          }, { cause: error });
        }
        throw error;
      }
    },
  };
}

export type CourseVisualPlanDeps = ReturnType<typeof createCourseVisualPlanDeps>;
