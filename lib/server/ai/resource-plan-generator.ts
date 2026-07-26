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

// Whitelisted profile fields the image model needs to keep a character visually consistent. Gender and age are listed
// explicitly so the model never guesses them from the name; all other visual detail is intentionally funneled through
// `appearance`, so adding a new visual attribute means editing the person's appearance text, not this prompt.
function describePerson(person: PersonProfile) {
  const attributes = [
    person.gender ? person.gender : null,
    typeof person.age === "number" ? `age ${person.age}` : null,
    person.appearance?.trim() || person.notes?.trim() || "appearance not provided",
  ].filter(Boolean);
  return `${personName(person)} (${attributes.join(", ")})`;
}

function castBible(context: ResourcePlanGenerationContext) {
  const profiles = [context.teacher, ...context.students];
  return context.draft.castAliases
    .map((alias) => {
      const profile = profiles.find((person) => personName(person) === alias.displayName);
      return `- ${alias.alias} = ${alias.displayName}: ${profile ? describePerson(profile) : alias.displayName}`;
    })
    .join("\n");
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
    "Each shot's sourceParagraphId must be its assigned paragraph id.",
    "Every coverBrief.imagePrompt and shots[].imagePrompt must be a compact, self-contained GPT Image 2 prompt.",
    "Character consistency is mandatory: use CLASSROOM CAST VISUAL FACTS as stable identity anchors. Keep age band, gender presentation, hairstyle, face shape, body type, glasses/no glasses, stable accessories, and temperament consistent whenever the same classroom cast member appears.",
    "For each recurring classroom cast member, choose a simple lesson outfit from the story context. Keep that outfit consistent within the same day or setting; change it only when the paragraph clearly changes time, place, or activity.",
    "Every imagePrompt must restate the visible character's stable identity anchors plus the lesson outfit needed for that scene. Let expression, pose, action, props, weather, and background follow the paragraph.",
    "When the lesson mentions a historical person, real person, famous IP, game, or fixed character, use broad common knowledge to make a child-safe picture-book version recognizable, without promising exact official likeness or inventing detailed canon traits.",
    "For growth stories about real or historical people, match each paragraph's age phase and era instead of forcing one identical face across ages.",
    "The cover brief must describe story poster key art with a memorable central visual hook, not a generic class group portrait.",
    "",
    `Course title: ${context.course.title}`,
    `Story title from Step2: ${context.storyOption.title}`,
    `Level: ${context.course.englishLevel}`,
    `Teacher: ${describePerson(context.teacher)}`,
    `Students: ${context.students.map((student) => describePerson(student)).join("; ")}`,
    "CLASSROOM CAST VISUAL FACTS:",
    castBible(context),
    `Story title: ${context.storyOption.title}`,
    `Storyline: ${context.storyOption.storyline}`,
    "Story chapters:",
    context.storyOption.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.summary}`).join("\n"),
    "Clean lesson sentences with stable ids:",
    sentenceLines(context.draft),
    "",
    "Rules:",
    "- Only name characters that appear in CLASSROOM CAST VISUAL FACTS or in the lesson sentences.",
    "- Keep classroom cast identity anchors consistent with CLASSROOM CAST VISUAL FACTS; never change a person's gender, age band, hairstyle, face shape, body type, glasses/no glasses, stable accessories, or temperament.",
    "- In every imagePrompt, explicitly restate only the important visible identity anchors for each recurring person, then add a simple story-appropriate outfit for this lesson scene.",
    "- Scene development may change expression, pose, action, props, weather, background, and clothing when the paragraph supports it. It must not randomly change identity anchors.",
    "- For external people and characters mentioned in the lesson text, use broad common knowledge to stay visually recognizable where possible, but keep everything in an original classroom picture-book style.",
    "- Allow age phase, outfit, expression, action, emotional state, and scene props to follow the chapter when the story sentence supports it.",
    "- Do not add extra students, classmates, teachers, parents, crowds, background people, or unnamed humans.",
    "- Output exactly two shots for each chapter: shotOrder 1 must use paragraph 1, shotOrder 2 must use paragraph 2.",
    "- Cover brief must use the same characters, story world, visual style, and representative story elements from the shot plan.",
    "- Cover brief description must include one memorable central visual hook built from the main character, teacher/student cast, setting, and key story object.",
    "- imagePrompt must be concrete but concise, ideally 450-800 characters, never over 1200 characters.",
    '- Each imagePrompt must explicitly identify itself as a GPT Image 2 prompt and start with "GPT Image 2 prompt: Horizontal 16:9 ...".',
    "- Each imagePrompt must include only: visible cast with stable identity anchors, lesson outfit, concrete background, story action, composition, style, mood, and safety constraints.",
    "- Avoid redundant wording. Mention the no-text safety constraint once at the end.",
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
  const firstProfile = describePerson(context.teacher);
  const castSummary = [context.teacher, ...context.students].map(describePerson).join("; ");
  const shots = context.draft.chapters.flatMap((chapter) =>
    chapter.paragraphs.slice(0, 2).map((paragraph, index) => ({
      chapterId: chapter.id,
      shotId: `${chapter.id}-shot-${index + 1}`,
      shotOrder: (index + 1) as 1 | 2,
      sourceParagraphId: paragraph.id,
      focus: index === 0 ? "The characters discover the story world." : "The characters act on the clue.",
      keyObjects: [context.storyOption.title],
      imagePrompt: `GPT Image 2 prompt: Horizontal 16:9 hand-drawn children's picture-book illustration. ${firstAlias} uses this exact stable appearance: ${firstProfile}. ${
        index === 0 ? "Show the character discovering the story world." : "Show the character acting on the clue."
      } Set in ${context.storyOption.title}, warm colors, clean expressive linework, soft watercolor texture, safe centered composition. Pure image only. No title, captions, subtitles, readable text, letters, numbers, speech bubbles, logo, or watermark.`,
    })),
  );

  return {
    schemaVersion: "course_resource_plan_v1",
    coverBrief: {
      description: `All main characters stand together in the ${context.storyOption.title} story world, showing the visual style for the whole course.`,
      storyElements: [context.storyOption.title],
      imagePrompt: `GPT Image 2 prompt: Horizontal 16:9 hand-drawn children's picture-book cover. Main cast uses these exact stable appearances: ${castSummary}. They stand in a ${context.storyOption.title} story world with one clear central visual hook, warm colors, clean expressive linework, soft watercolor texture. Pure image only. No title, captions, subtitles, readable text, letters, numbers, speech bubbles, logo, or watermark.`,
    },
    shots,
    version: 1,
  };
}

export async function generateCourseResourcePlan(context: ResourcePlanGenerationContext) {
  if (process.env.NODE_ENV === "test" || process.env.QUICKROUTER_API_KEY === "mock" || !process.env.QUICKROUTER_API_KEY) {
    return assertResourcePlanValid(mockResourcePlan(context), context.draft);
  }

  const content = await callQuickRouterResponses([
    { role: "system", content: "You create stable visual resource plans for children's picture-book lesson images. Return strict JSON only." },
    { role: "user", content: buildCourseResourcePlanPrompt(context) },
  ]);
  const plan = parseCourseResourcePlan(parseJsonObject(content));
  return assertResourcePlanValid(plan, context.draft);
}
