import { z } from "zod";

import type {
  CourseBasicDetail,
  CourseResourcePlan,
  LessonDraft,
  PersonProfile,
  StoryOption,
} from "@/lib/contracts/api";

import { assertResourcePlanValid } from "@/lib/server/repositories/course-images";

type ChatMessage = { role: "system" | "user"; content: string };

export type ResourcePlanGenerationContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
  storyOption: StoryOption;
  draft: LessonDraft;
};

const nonEmpty = z.string().trim().min(1);

const resourcePlanSchema = z
  .object({
    schemaVersion: z.literal("course_resource_plan_v1"),
    coverBrief: z
      .object({
        description: nonEmpty,
        storyElements: z.array(nonEmpty).min(1),
        imagePrompt: nonEmpty.max(1200),
      })
      .strict(),
    shots: z
      .array(
        z
          .object({
            chapterId: nonEmpty,
            shotId: nonEmpty,
            shotOrder: z.union([z.literal(1), z.literal(2)]),
            sourceParagraphId: nonEmpty,
            focus: nonEmpty,
            keyObjects: z.array(nonEmpty),
            imagePrompt: nonEmpty.max(1200),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

export function parseCourseResourcePlan(value: unknown): CourseResourcePlan {
  const result = resourcePlanSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`AI 返回的资源方案 JSON 格式无效：${result.error.issues[0]?.path.join(".") || "root"}`);
  }

  return {
    ...result.data,
    version: 1,
  };
}

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function sentenceLines(draft: LessonDraft) {
  return draft.chapters
    .map((chapter) =>
      [
        `Chapter ${chapter.sourceOutlineChapterIndex}: ${chapter.title} (${chapter.id})`,
        ...chapter.paragraphs.map((paragraph) =>
          [
            `Paragraph ${paragraph.order} (${paragraph.id})`,
            ...paragraph.sentences.map((sentence) => `- ${sentence.id}: ${sentence.text}`),
          ].join("\n"),
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildCourseResourcePlanPrompt(context: ResourcePlanGenerationContext) {
  return [
    "Create one GPT-image-2 resource plan for a children's English picture-book lesson as strict JSON.",
    "Read the full lesson first, then directly write self-contained prompts specifically for GPT Image 2 for the cover and every lesson shot.",
    "The default art direction is hand-drawn comic picture-book style. Do not switch to 3D, photorealistic, oil painting, cyberpunk, or cinematic realism.",
    "The plan must create one cover brief and exactly 2 lesson shots per chapter.",
    "Each chapter has exactly 2 paragraphs. Create shotOrder 1 for paragraph 1 and shotOrder 2 for paragraph 2.",
    "Each shot's sourceParagraphId must be its assigned paragraph id.",
    "Every coverBrief.imagePrompt and shots[].imagePrompt must be a complete GPT Image 2 prompt that the image model can use by itself without seeing any other context.",
    "Each imagePrompt must repeat the concrete appearance of visible characters and the concrete story setting enough to avoid obvious inconsistencies.",
    "Do not force the same clothing if the story clearly changes the character's situation; describe the current scene's clothing and props specifically.",
    "The cover brief must describe story poster key art with a memorable central visual hook, not a generic class group portrait.",
    "Only use cast aliases from the lesson for all characters. Do not add extra students, classmates, teachers, parents, crowds, background people, or unnamed humans.",
    "",
    `Course title: ${context.course.title}`,
    `Theme: ${context.course.theme}`,
    `Level: ${context.course.englishLevel}`,
    `Teacher: ${personName(context.teacher)} (${context.teacher.appearance || context.teacher.notes || "appearance not provided"})`,
    `Students: ${context.students.map((student) => `${personName(student)} (${student.appearance || student.notes || "appearance not provided"})`).join("; ")}`,
    `Story title: ${context.storyOption.title}`,
    `Storyline: ${context.storyOption.storyline}`,
    "Story chapters:",
    context.storyOption.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.summary}`).join("\n"),
    "Clean lesson sentences with stable ids:",
    sentenceLines(context.draft),
    "",
    "Rules:",
    "- Only use cast aliases from the lesson when naming characters in imagePrompt descriptions.",
    "- Do not add extra students, classmates, teachers, parents, crowds, background people, or unnamed humans.",
    "- Output exactly two shots for each chapter: shotOrder 1 must use paragraph 1, shotOrder 2 must use paragraph 2.",
    "- Each shot must use the paragraph id assigned by shotOrder: shotOrder 1 uses paragraph 1, shotOrder 2 uses paragraph 2.",
    "- Cover brief must use the same characters, story world, visual style, and representative story elements from the shot plan.",
    "- Cover brief description must include one memorable central visual hook built from the main character, teacher/student cast, setting, and key story object.",
    "- imagePrompt must be concrete and visual, ideally 900-1200 characters, never over 1200 characters.",
    '- Each imagePrompt must explicitly identify itself as a GPT Image 2 prompt and start with "GPT Image 2 prompt: Horizontal 16:9 ...".',
    "- Each imagePrompt must include: current visible characters, concrete appearance/clothing/props, concrete background, story action, composition, style, mood, and safety constraints.",
    "- Do not include readable text, letters, numbers, signs, speech bubbles, logos, or watermarks in any visual description or imagePrompt.",
    "",
    "Return JSON only with this shape:",
    JSON.stringify(
      {
        schemaVersion: "course_resource_plan_v1",
        coverBrief: {
          description: "pure image cover reference description...",
          storyElements: ["object"],
          imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 children's picture-book cover with concrete character appearance, setting, story hook, style, and no readable text...",
        },
        shots: [
          {
            chapterId: "chapter-1",
            shotId: "chapter-1-shot-1",
            shotOrder: 1,
            sourceParagraphId: "chapter-1-paragraph-1",
            focus: "single visual action...",
            keyObjects: ["object"],
            imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 children's picture-book illustration with concrete visible character appearance, scene-specific clothing, setting, action, composition, style, and no readable text...",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildQuickRouterResponsesRequestBody(messages: ChatMessage[]) {
  return {
    model: process.env.QUICKROUTER_RESPONSES_MODEL ?? "gpt-5.5",
    input: messages,
    max_output_tokens: 24000,
    response_format: { type: "json_object" },
    temperature: 0.2,
  };
}

type QuickRouterResponsesData = {
  choices?: Array<{ message?: { content?: string | null } }>;
  output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  error?: { message?: string };
  message?: string;
};

async function callQuickRouterResponses(messages: ChatMessage[]) {
  const apiKey = process.env.QUICKROUTER_API_KEY;
  if (!apiKey) throw new Error("AI 服务未配置");
  const response = await fetch("https://api.quickrouter.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildQuickRouterResponsesRequestBody(messages)),
  });
  const data = (await response.json().catch(() => ({}))) as QuickRouterResponsesData;
  if (!response.ok) throw new Error(data.error?.message || data.message || `QuickRouter Responses 请求失败：HTTP ${response.status}`);
  const content =
    data.choices?.[0]?.message?.content ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text)
      .filter(Boolean)
      .join("\n");
  if (!content) throw new Error("AI 未返回资源方案，请重试生成");
  return content;
}

function mockResourcePlan(context: ResourcePlanGenerationContext): CourseResourcePlan {
  const firstAlias = context.draft.castAliases[0]?.alias || "Student";
  const shots = context.draft.chapters.flatMap((chapter) =>
    chapter.paragraphs.slice(0, 2).map((paragraph, index) => ({
      chapterId: chapter.id,
      shotId: `${chapter.id}-shot-${index + 1}`,
      shotOrder: (index + 1) as 1 | 2,
      sourceParagraphId: paragraph.id,
      focus: index === 0 ? "The characters discover the story world." : "The characters act on the clue.",
      keyObjects: [context.course.theme],
      imagePrompt: `GPT Image 2 prompt: Horizontal 16:9 hand-drawn children's picture-book illustration. ${firstAlias} appears as the same friendly child story character with a bright classroom adventure outfit and small backpack. ${
        index === 0 ? "Show the character discovering the story world." : "Show the character acting on the clue."
      } The scene is set in a ${context.course.theme} story world with warm colors, clean expressive linework, soft watercolor texture, safe centered composition, and no readable text, letters, numbers, speech bubbles, logos, or watermarks.`,
    })),
  );

  return {
    schemaVersion: "course_resource_plan_v1",
    coverBrief: {
      description: `All main characters stand together in the ${context.course.theme} story world, showing the visual style for the whole course.`,
      storyElements: [context.course.theme],
      imagePrompt: `GPT Image 2 prompt: Horizontal 16:9 hand-drawn children's picture-book cover. ${context.draft.castAliases
        .map((alias) => `${alias.alias} appears as a friendly child story character in a bright classroom adventure outfit`)
        .join(", ")}. They stand in a ${context.course.theme} story world with a clear central story hook, warm colors, clean expressive linework, soft watercolor texture, and no readable text, letters, numbers, speech bubbles, logos, or watermarks.`,
    },
    shots,
    version: 1,
  };
}

export async function generateCourseResourcePlan(context: ResourcePlanGenerationContext) {
  if (process.env.QUICKROUTER_API_KEY === "mock" || !process.env.QUICKROUTER_API_KEY) {
    return assertResourcePlanValid(mockResourcePlan(context), context.draft);
  }

  const content = await callQuickRouterResponses([
    { role: "system", content: "You create stable visual resource plans for children's picture-book lesson images. Return strict JSON only." },
    { role: "user", content: buildCourseResourcePlanPrompt(context) },
  ]);
  const plan = parseCourseResourcePlan(parseJsonObject(content));
  return assertResourcePlanValid(plan, context.draft);
}
