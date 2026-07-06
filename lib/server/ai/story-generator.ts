import type { CourseBasicDetail, PersonProfile, StoryOption } from "@/lib/contracts/api";
import { validateStoryOptions } from "@/lib/server/repositories/story-options";

type StoryGenerationContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

const chapterCountByDuration: Record<number, number> = {
  30: 3,
  45: 4,
  60: 5,
};

export function getExpectedChapterCount(durationMinutes: number) {
  return chapterCountByDuration[durationMinutes] ?? 4;
}

export function buildPrompt(context: StoryGenerationContext) {
  const expectedChapterCount = getExpectedChapterCount(context.course.durationMinutes);
  const storySeed = context.course.storyIdea
    ? `Teacher-provided story seed: ${context.course.storyIdea}`
    : "No teacher-provided story seed. Invent a suitable story premise from the theme, students, teacher profile, and grammar targets.";

  return [
    "Generate story-teaching outline options for a project-based English picture-book lesson.",
    "",
    "Course context:",
    `- Course title: ${context.course.title}`,
    `- English level: ${context.course.englishLevel}`,
    `- Duration: ${context.course.durationMinutes} minutes`,
    `- Required chapter count per option: exactly ${expectedChapterCount}`,
    `- Theme/world setting: ${context.course.theme}`,
    `- Grammar targets: ${context.course.grammar.join(" / ")}`,
    `- Story idea mode: ${context.course.storyIdeaMode}`,
    `- ${storySeed}`,
    "",
    "Cast:",
    `- Teacher guide: ${context.teacher.name}; appearance: ${context.teacher.appearance ?? "not provided"}; notes: ${context.teacher.notes ?? "none"}`,
    `- Students: ${context.students
      .map((student) =>
        [
          student.chineseName ?? student.name,
          `English name: ${student.englishName ?? student.name}`,
          `age: ${student.age ?? "unknown"}`,
          `appearance: ${student.appearance ?? "not provided"}`,
          `interests: ${student.interests.join(" / ") || "not provided"}`,
          `learning goal: ${student.learningGoal ?? "not provided"}`,
          `notes: ${student.notes ?? "none"}`,
        ].join("，"),
      )
      .join("\n")}`,
    "",
    "Non-negotiable story rules:",
    "- Generate exactly 3 story options. They must use clearly different narrative angles, conflicts, missions, and emotional hooks. Do not produce three minor variations of the same plot.",
    "- Every option must have a coherent story arc: setup, development, turning point, and resolution. The chapter summaries together must form a reasonable cause-and-effect story.",
    "- The teacher and all selected students must actively participate in the story. The teacher is a guide inside the story, not a narrator, judge, or after-class commentator.",
    "- Do not introduce unrelated story characters. You may use unnamed environmental obstacles, objects, clues, places, or background groups only when needed, but the active decision-makers must be the teacher and students.",
    "- The story must integrate the grammar targets into the plot mechanics, character choices, and dialogue opportunities.",
    "- Keep story and grammar separated in the JSON fields: chapter.summary must describe only the story events, with no grammar labels, no teaching instructions, and no phrases like \"Use There be\". chapter.knowledgeHook must explain how the grammar target can be practiced in that chapter.",
    "- Keep the outline concise. This step is for choosing the story architecture, not reading a full plan.",
    "- Keep the outline age-appropriate for the English level and feasible for the course duration.",
    "- Do not generate full lesson text, full scripts, exercises, answers, illustration suggestions, image prompts, HTML, or PDF content.",
    "- If the theme refers to copyrighted worlds or characters, use only a generic inspired setting and do not mention protected character names.",
    "",
    "Output rules:",
    "- Return strict JSON only.",
    "- Do not wrap the JSON in Markdown.",
    "- Do not include explanations, comments, trailing commas, or extra top-level keys.",
    "- The top-level JSON object must be exactly: {\"options\": [...]}.",
    "- There must be exactly 3 options.",
    "- Option ids must be exactly \"option-1\", \"option-2\", and \"option-3\".",
    `- Each option must contain exactly ${expectedChapterCount} chapters.`,
    "- All fields must be non-empty strings.",
    "- logline: 1-2 short sentences.",
    "- chapter.summary: 1-3 short sentences focused only on story events.",
    "- chapter.knowledgeHook: 1 short sentence explaining how grammar enters the action or dialogue.",
    "- Each teachingDesign field: 1 short sentence. Do not write detailed teaching plans.",
    "",
    `Required JSON schema: {"options":[{"id":"option-1","title":"...","logline":"...","chapters":[{"title":"pure story events only, no grammar explanation","summary":"pure story events only, no grammar explanation","knowledgeHook":"grammar practice design for this chapter"}],"teachingDesign":{"grammarIntegration":"overall grammar integration strategy","studentFit":"...","teacherGuidance":"...","difficultyFit":"..."}}]}`,
  ].join("\n");
}

function mockStoryOptions(context: StoryGenerationContext): StoryOption[] {
  const expectedChapterCount = getExpectedChapterCount(context.course.durationMinutes);
  const chapterTemplates = Array.from({ length: expectedChapterCount }, (_, index) => ({
    title: `Chapter ${index + 1}: ${context.course.theme} Mission ${index + 1}`,
    summary: `老师作为引导者，带领学生在${context.course.theme}中完成第 ${index + 1} 个任务，并推动故事向最终目标前进。学生需要观察线索、做出选择，并解决本章的小挑战。`,
    knowledgeHook: `本章语法重点是 ${context.course.grammar.join(" / ")}，可通过角色对白、场景描述和任务复述进行练习。`,
  }));

  return [1, 2, 3].map((item) => ({
    id: `option-${item}`,
    title: `${context.course.theme} Story Option ${item}`,
    logline: `老师带领学生进入${context.course.theme}，通过连续任务解决问题，并自然练习目标语法。`,
    chapters: chapterTemplates,
    teachingDesign: {
      grammarIntegration: `将 ${context.course.grammar.join(" / ")} 放入任务指令、角色对白和章节复述中，保证重复出现但不脱离剧情。`,
      studentFit: `故事结合学生兴趣与学习目标，让学生能把自己代入主角行动。`,
      teacherGuidance: `老师作为 guide 陪伴学生观察线索、提出问题、做出选择，并在关键节点提供语言支架。`,
      difficultyFit: `故事结构和章节数量匹配 ${context.course.englishLevel} 与 ${context.course.durationMinutes} 分钟课时。`,
    },
  }));
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed) as { options?: StoryOption[] };
}

async function callDeepSeek(messages: ChatMessage[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

  if (!apiKey) {
    throw new Error("AI 服务未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    throw new Error("DeepSeek 请求失败");
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek 返回为空");
  }

  return content;
}

export async function generateStoryOptions(context: StoryGenerationContext) {
  const expectedChapterCount = getExpectedChapterCount(context.course.durationMinutes);

  if (process.env.DEEPSEEK_API_KEY === "mock") {
    // TODO: Restrict this deterministic branch to local development after the real DeepSeek key is configured.
    return validateStoryOptions(mockStoryOptions(context), expectedChapterCount);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert bilingual PBL picture-book curriculum designer for children. You design coherent story-teaching outlines that tightly integrate English grammar into narrative action. Return strict JSON only.",
    },
    {
      role: "user",
      content: buildPrompt(context),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callDeepSeek(messages);
      const parsed = parseJsonObject(content);
      return validateStoryOptions(parsed.options ?? [], expectedChapterCount);
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error("故事方案生成失败");
}
