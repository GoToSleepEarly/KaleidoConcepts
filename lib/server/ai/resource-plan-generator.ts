import { z } from "zod";

import type {
  CourseBasicDetail,
  CourseResourcePlan,
  CourseVisualProfile,
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
  previousVisualProfile: CourseVisualProfile | null;
};

const nonEmpty = z.string().trim().min(1);

const visualProfileSchema = z
  .object({
    style: nonEmpty,
    palette: nonEmpty,
    world: nonEmpty,
    mood: nonEmpty,
    characters: z
      .array(
        z
          .object({
            alias: nonEmpty,
            appearance: nonEmpty,
            hairstyle: nonEmpty,
            clothing: nonEmpty,
            accessories: z.array(nonEmpty),
            signatureColor: nonEmpty,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const resourcePlanSchema = z
  .object({
    schemaVersion: z.literal("course_resource_plan_v1"),
    visualProfile: visualProfileSchema,
    coverBrief: z
      .object({
        description: nonEmpty,
        characters: z.array(nonEmpty).min(1),
        setting: nonEmpty,
        storyElements: z.array(nonEmpty).min(1),
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
            sourceSentenceIds: z.array(nonEmpty).min(1),
            heroMomentSentenceId: nonEmpty,
            sourceExcerpt: nonEmpty,
            focus: nonEmpty,
            characters: z.array(nonEmpty).min(1),
            keyObjects: z.array(nonEmpty),
            composition: nonEmpty,
            continuityNotes: nonEmpty,
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
    confirmedCoverImageId: null,
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
  const previous = context.previousVisualProfile
    ? `\nTeacher-edited visual profile to preserve and refine:\n${JSON.stringify(context.previousVisualProfile, null, 2)}\n`
    : "";

  return [
    "Create one resource plan for a children's English picture-book lesson as strict JSON.",
    "The default visual direction is hand-drawn comic picture-book style. Do not switch to 3D, photorealistic, oil painting, cyberpunk, or cinematic realism unless the teacher-edited profile explicitly says so.",
    "The plan must create the global visual profile, one cover brief, and exactly 2 non-overlapping lesson shots per chapter.",
    "Teachers only edit the visual profile. Cover brief and shots must stay consistent with that same visual profile.",
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
    previous,
    "Clean lesson sentences with stable ids:",
    sentenceLines(context.draft),
    "",
    "Rules:",
    "- Only use cast aliases from the lesson when naming characters in visualProfile.characters, coverBrief.characters, and shots.characters.",
    "- Do not add extra students, classmates, teachers, parents, crowds, background people, or unnamed humans.",
    "- Output exactly two shots for each chapter, shotOrder 1 then 2.",
    "- Each shot must use continuous sourceSentenceIds from one paragraph only.",
    "- The two shots in the same chapter must not share sentence ids.",
    "- sourceExcerpt must be the exact clean text for sourceSentenceIds joined with spaces.",
    "- Cover brief must use the same characters, world, palette, and representative story elements from the shot plan.",
    "- Cover brief description must include one memorable central visual hook built from the main character, teacher/student cast, setting, and key story object.",
    "- Do not include readable text, letters, numbers, signs, speech bubbles, logos, or watermarks in any visual description.",
    "",
    "Return JSON only with this shape:",
    JSON.stringify(
      {
        schemaVersion: "course_resource_plan_v1",
        visualProfile: {
          style: "hand-drawn comic picture-book style...",
          palette: "color scheme...",
          world: "main setting/world...",
          mood: "overall mood...",
          characters: [
            {
              alias: "AliasFromLesson",
              appearance: "appearance...",
              hairstyle: "hair...",
              clothing: "clothing...",
              accessories: ["item"],
              signatureColor: "color",
            },
          ],
        },
        coverBrief: {
          description: "pure image cover reference description...",
          characters: ["AliasFromLesson"],
          setting: "setting...",
          storyElements: ["object"],
        },
        shots: [
          {
            chapterId: "chapter-1",
            shotId: "chapter-1-shot-1",
            shotOrder: 1,
            sourceParagraphId: "chapter-1-paragraph-1",
            sourceSentenceIds: ["sentence-id"],
            heroMomentSentenceId: "sentence-id",
            sourceExcerpt: "exact clean text...",
            focus: "single visual action...",
            characters: ["AliasFromLesson"],
            keyObjects: ["object"],
            composition: "shot size and subject placement...",
            continuityNotes: "what must stay consistent...",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildDeepSeekRequestBody(messages: ChatMessage[]) {
  return {
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    messages,
    max_tokens: 24000,
    response_format: { type: "json_object" },
    thinking: { type: process.env.DEEPSEEK_THINKING === "disabled" ? "disabled" : "enabled" },
    temperature: 0.2,
  };
}

async function callDeepSeek(messages: ChatMessage[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  if (!apiKey) throw new Error("AI 服务未配置");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDeepSeekRequestBody(messages)),
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = data.choices?.[0]?.message?.content;
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
      sourceSentenceIds: paragraph.sentences.map((sentence) => sentence.id),
      heroMomentSentenceId: paragraph.sentences[paragraph.sentences.length - 1]?.id ?? paragraph.sentences[0].id,
      sourceExcerpt: paragraph.sentences.map((sentence) => sentence.text).join(" "),
      focus: index === 0 ? "The characters discover the story world." : "The characters act on the clue.",
      characters: [firstAlias],
      keyObjects: [context.course.theme],
      composition: "clear hand-drawn comic scene with the action centered in the safe area",
      continuityNotes: "Keep the same character clothing, colors, and story world from the cover.",
    })),
  );

  return {
    schemaVersion: "course_resource_plan_v1",
    visualProfile: {
      style: "hand-drawn comic picture-book style with clean linework",
      palette: `warm colors inspired by ${context.course.theme}`,
      world: `${context.course.theme} story world`,
      mood: "curious, safe, and lively",
      characters: context.draft.castAliases.map((alias) => ({
        alias: alias.alias,
        appearance: `${alias.displayName} as a friendly children's story character`,
        hairstyle: "simple readable hairstyle",
        clothing: "bright classroom adventure outfit",
        accessories: ["small backpack"],
        signatureColor: "warm yellow",
      })),
    },
    coverBrief: {
      description: `All main characters stand together in the ${context.course.theme} story world, showing the visual style for the whole course.`,
      characters: context.draft.castAliases.map((alias) => alias.alias),
      setting: `${context.course.theme} story world`,
      storyElements: [context.course.theme],
    },
    shots,
    version: 1,
    confirmedCoverImageId: null,
  };
}

export async function generateCourseResourcePlan(context: ResourcePlanGenerationContext) {
  if (process.env.DEEPSEEK_API_KEY === "mock" || !process.env.DEEPSEEK_API_KEY) {
    return assertResourcePlanValid(mockResourcePlan(context), context.draft);
  }

  const content = await callDeepSeek([
    { role: "system", content: "You create stable visual resource plans for children's picture-book lesson images. Return strict JSON only." },
    { role: "user", content: buildCourseResourcePlanPrompt(context) },
  ]);
  const plan = parseCourseResourcePlan(parseJsonObject(content));
  return assertResourcePlanValid(plan, context.draft);
}
