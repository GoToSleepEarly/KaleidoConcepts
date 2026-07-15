import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseBasicDetail, PersonProfile } from "@/lib/contracts/api";

import { buildPrompt, generateStoryOptions } from "./story-generator";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Internal Course Title",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1",
  durationMinutes: 45,
  theme: "唐代诗歌博物馆",
  grammar: ["Past Simple", "There be"],
  storyIdeaMode: "manual",
  storyIdea: "老师和学生尤在博物馆遇见李白，一起找回月光诗卷。",
  llmModel: "deepseek_chat",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "林老师",
  interests: [],
  appearance: "戴圆眼镜的温和老师",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "尤",
  chineseName: "尤",
  age: 8,
  gender: "female",
  interests: ["诗歌", "画画"],
  appearance: "喜欢画月亮的小学生",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const context = { course, teacher, students: [student] };

function deepSeekResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("story option prompt", () => {
  test("builds a concise Chinese outline prompt with locked names and no product step jargon", () => {
    const prompt = buildPrompt(context);

    expect(prompt).not.toContain("Internal Course Title");
    expect(prompt).not.toContain("Step2");
    expect(prompt).not.toContain("Step3");
    expect(prompt).not.toContain("centralConflict");
    expect(prompt).not.toContain("knowledgeHook");
    expect(prompt).not.toContain("goal");
    expect(prompt).not.toContain("obstacle");
    expect(prompt).not.toContain("turn");
    expect(prompt).not.toContain("不使用受版权保护的角色名或专有世界观名称");

    expect(prompt).toContain("nameToUseInStory: 尤");
    expect(prompt).toContain("如果姓名是单字，例如“尤”，它就是姓名“尤”，不能理解成“你”");
    expect(prompt).toContain("老师和学生尤在博物馆遇见李白");
    expect(prompt).toContain("每个方案必须生成 4 章");
    expect(prompt).toContain("storyline");
    expect(prompt).toContain("chapter.summary：最多 30 个中文字符");
  });

  test("parses DeepSeek thinking-mode outline JSON into the new story option shape", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "real-key");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");

    const fetch = vi.fn(async () =>
      deepSeekResponse({
        options: [
          {
            id: "option-1",
            variant: "faithful",
            title: "月光诗卷",
            storyline: "诗卷月光变暗，大家陪李白按线索找回缺失诗句。",
            chapters: [
              { title: "诗卷变暗", summary: "大家发现诗卷里的月光和诗句消失。" },
              { title: "寻找线索", summary: "尤跟随墨迹找到第一句残诗。" },
              { title: "重排诗句", summary: "老师引导大家整理错乱的诗句。" },
              { title: "月光归来", summary: "李白看见诗卷重新亮起。" },
            ],
          },
          {
            id: "option-2",
            variant: "enhanced",
            title: "诗馆月光",
            storyline: "博物馆诗灯逐盏熄灭，大家沿展品线索还原李白诗意。",
            chapters: [
              { title: "诗灯熄灭", summary: "大家发现李白展厅的诗灯暗下。" },
              { title: "展品线索", summary: "尤在画卷边找到月光标记。" },
              { title: "诗意错位", summary: "展品顺序混乱让诗意断开。" },
              { title: "诗灯重亮", summary: "大家还原线索，展厅重新明亮。" },
            ],
          },
          {
            id: "option-3",
            variant: "creative",
            title: "月影书门",
            storyline: "一本月影书打开唐代夜游，大家帮李白找回迷路诗影。",
            chapters: [
              { title: "书门开启", summary: "月影书把大家带进唐代夜色。" },
              { title: "诗影走散", summary: "尤发现几道诗影藏进街巷。" },
              { title: "夜游寻影", summary: "老师带大家沿月色寻找诗影。" },
              { title: "诗影归卷", summary: "李白收回诗影，书门温柔合上。" },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const options = await generateStoryOptions(context);

    expect(options[0]).toMatchObject({ id: "option-1", variant: "faithful", title: "月光诗卷" });
    expect(options[0]?.chapters[0]).toEqual({ title: "诗卷变暗", summary: "大家发现诗卷里的月光和诗句消失。" });
    const requestBody = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as { thinking?: { type: string }; response_format?: { type: string }; temperature?: number };
    expect(requestBody).toMatchObject({ response_format: { type: "json_object" }, thinking: { type: "enabled" } });
    expect(requestBody.temperature).toBeUndefined();
  });
});
