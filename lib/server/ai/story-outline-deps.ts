import type { CourseSourceReferenceType, CourseSourceStatus } from "@/lib/contracts/api";
import type { StoryWritingProvider } from "@/lib/contracts/api";

import { createStoryOutlineProvider } from "./story-outline-provider";

function parseJson<T>(text: string, fallbackMessage: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(fallbackMessage, { cause: error });
  }
}

function bilingualText(value: string | { zh?: string; en?: string }) {
  if (typeof value === "string") return value;
  return [value.zh, value.en].filter(Boolean).join(" / ");
}

type CoursePersonPrompt = Array<{
  role: string;
  chineseName: string;
  englishName: string;
  age: number;
  gender: string;
}>;

type FreeInputDecision = {
  decision: "ask_clarification" | "request_reference_material" | "generate_outline";
  assistantMessage: string;
  referenceName?: string;
  referenceType?: CourseSourceReferenceType;
  teacherReference?: {
    name: string;
    type: CourseSourceReferenceType;
    summary: string;
    usableFacts: string[];
    avoidTopics: string[];
    adaptationBoundary: string;
  };
};

export function createStoryOutlineGenerationDeps() {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider());
  return {
    decideFreeInput: async (input: {
      course: { title: string; durationMinutes: number };
      coursePeople: CoursePersonPrompt;
      message: string;
      references: unknown[];
      outline: unknown;
    }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        prompt: [
          "你是 Step2 故事大纲流程判断助手。",
          "只返回 JSON 对象，字段：decision, assistantMessage, referenceName, referenceType, teacherReference。",
          "decision 只能是 ask_clarification, request_reference_material, generate_outline。",
          "只有老师自由输入需要判断；固定按钮流程不经过你。",
          "如果信息足够生成或修改大纲，返回 generate_outline。",
          "如果对象不明确或资料不足，返回 ask_clarification 或 request_reference_material。",
          "如果老师以“我补充资料：”开头且资料足够，返回 generate_outline，并在 teacherReference 中整理老师补充资料。",
          "不要决定联网搜索，只说明是否需要参考资料。",
          `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
          `授课人物：${JSON.stringify(input.coursePeople)}`,
          `老师输入：${input.message}`,
          `已保存参考资料：${JSON.stringify(input.references)}`,
          `当前大纲：${JSON.stringify(input.outline)}`,
        ].join("\n"),
      });
      return parseJson<FreeInputDecision>(text, "故事需求判断失败，请重试");
    },
    generateDirections: async (input: { course: { title: string; durationMinutes: number }; message: string }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        prompt: [
          "你是英语 PBL 绘本课程故事策划助手。",
          "请只返回 JSON 数组，包含 3 个故事方向。",
          "每项字段：title, hook, whyFits, mainCharacters, classroomValue, seedPrompt。",
          `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
          `老师偏好：${input.message || "无"}`,
        ].join("\n"),
      });
      return parseJson<Array<{
        title: string;
        hook: string;
        whyFits: string;
        mainCharacters: string[];
        classroomValue: string;
        seedPrompt: string;
      }>>(text, "故事方向解析失败，请重试");
    },
    searchReference: async (input: { objectName: string }) => {
      const { text } = await client().searchReference({
        prompt: [
          "请联网整理适合儿童英语 PBL 课程改编的参考资料。",
          "只返回 JSON 对象，字段：name, type, sourceStatus, summary, usableFacts, avoidTopics, adaptationBoundary。",
          "type 只能是 real_person, historical_person, public_figure, ip, game_character, fictional_character, other。",
          "sourceStatus 只能是 confirmed, insufficient, teacher_supplied。",
          `引用对象：${input.objectName}`,
        ].join("\n"),
      });
      return parseJson<{
        name: string;
        type: CourseSourceReferenceType;
        sourceStatus: CourseSourceStatus;
        summary: string;
        usableFacts: string[];
        avoidTopics: string[];
        adaptationBoundary: string;
      }>(text, "参考资料解析失败，请重试");
    },
    generateOutline: async (input: {
      course: { title: string; durationMinutes: number };
      message: string;
      references: unknown[];
      chapterCount: number;
      writingProvider: StoryWritingProvider;
      coursePeople: CoursePersonPrompt;
      currentOutline?: unknown;
    }) => {
      const { text } = await client().generateOutline({
        writingProvider: input.writingProvider,
        prompt: [
          "你是英语 PBL 绘本课程故事大纲助手。",
          "请只返回 JSON 对象，字段：title, summary, narrativeType, storyHook, characters, chapters。",
          "title 和 summary 必须中英双语，例如 {\"zh\":\"中文\",\"en\":\"English\"}。",
          "chapter.title 必须中英双语，例如 {\"zh\":\"中文章节名\",\"en\":\"English Chapter Title\"}。",
          "本阶段只生成故事大纲，不生成语法指导、知识点、题型、练习、答案或图片 prompt。",
          "characters 每项字段：displayName, sourceType, roleInStory, shortDescription, visualDescription, shouldAppearInImages。",
          "sourceType 只能是 person, referenced, original。",
          "chapters 每项字段：order, title, storyGoal, keyEvents, characterIds, setting, endingHook。",
          "chapters 的数量必须等于指定章节数。",
          "先根据授课人物年龄、老师要求和引用对象判断叙事类型，再决定主角来源。",
          "学生不一定是主角；人物传记可让被讲述对象成为主角。",
          "如果学生进入故事，必须有自然身份和剧情功能。",
          "每个角色必须服务核心冲突；不要为热闹添加无关角色。",
          "新增原创角色默认 1-2 个，除非老师明确要求群像故事。",
          "每份大纲必须有谜题、任务、误会、倒计时、丢失物、选择困境或调查线索等清晰钩子。",
          "每章必须推进具体事件，章节之间要有因果关系。",
          `课程：${input.course.title}，时长：${input.course.durationMinutes} 分钟。`,
          `授课人物：${JSON.stringify(input.coursePeople)}`,
          `指定章节数：${input.chapterCount}`,
          `老师要求：${input.message || "基于当前已确认资料生成"}`,
          `已确认参考资料：${JSON.stringify(input.references)}`,
          `当前大纲：${JSON.stringify(input.currentOutline ?? null)}`,
        ].join("\n"),
      });
      const parsed = parseJson<{
        title: string | { zh: string; en: string };
        summary: string | { zh: string; en: string };
        narrativeType?: string;
        storyHook?: string;
        characters: Array<{
          displayName: string;
          sourceType: "person" | "referenced" | "original";
          sourcePersonId?: string | null;
          sourceReferenceId?: string | null;
          roleInStory: string;
          shortDescription: string;
          visualDescription?: string | null;
          shouldAppearInImages: boolean;
        }>;
        chapters: Array<{
          order: number;
          title: string | { zh: string; en: string };
          storyGoal: string;
          keyEvents: string[];
          characterIds: string[];
          setting: string;
          endingHook: string;
        }>;
      }>(text, "故事大纲解析失败，请重试");
      return {
        ...parsed,
        title: bilingualText(parsed.title),
        summary: bilingualText(parsed.summary),
        chapters: parsed.chapters.map((chapter) => ({
          ...chapter,
          title: bilingualText(chapter.title),
        })),
      };
    },
  };
}
