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

type DeepSeekRequestBody = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: "enabled" };
};

const chapterCountByDuration: Record<number, number> = {
  30: 3,
  45: 4,
  60: 5,
};

export function getExpectedChapterCount(durationMinutes: number) {
  return chapterCountByDuration[durationMinutes] ?? 4;
}

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function teacherDescription(teacher: PersonProfile) {
  return teacher.appearance?.trim() || teacher.notes?.trim() || "普通老师";
}

function studentBlock(students: PersonProfile[]) {
  return students
    .map((student) =>
      [
        `- studentId: ${student.id}`,
        `  nameToUseInStory: ${personName(student)}`,
        `  年龄：${student.age ?? "未知"}`,
        `  兴趣：${student.interests.join(" / ") || "未提供"}`,
        `  外貌：${student.appearance ?? "未提供"}`,
        `  补充说明：${student.notes ?? "无"}`,
      ].join("\n"),
    )
    .join("\n");
}

export function buildPrompt(context: StoryGenerationContext) {
  const expectedChapterCount = getExpectedChapterCount(context.course.durationMinutes);

  return [
    "请生成 3 个中文故事大纲候选方案。",
    "",
    "这些方案用于老师选择故事方向。",
    "当前只需要故事大纲，不需要正文、教学设计、练习题或图片设计。",
    "",
    "请先在内部完成以下思考，不要输出思考过程：",
    "1. 理解课程主题、学生兴趣、老师设定和故事想法。",
    "2. 如果老师提供了故事想法，识别其中必须保留的核心人物、历史人物、地点、时代、关键物品、核心任务和主要事件。",
    "3. 判断故事如何适合后续改写成英文绘本内容，但不要输出任何知识点设计。",
    "4. 生成 3 个不同方向的短大纲。",
    "5. 自检输出是否足够短、是否保留人名和老师原意、是否没有正文化。",
    "",
    "【课程背景】",
    "",
    "主题 / 世界观：",
    context.course.theme,
    "",
    "课程时长：",
    `${context.course.durationMinutes} 分钟`,
    "",
    "英语等级：",
    context.course.englishLevel,
    "",
    "后续内容开发需要覆盖的学习目标：",
    context.course.grammar.join(" / "),
    "",
    "老师是否提供故事想法：",
    context.course.storyIdea ? "是" : "否",
    "",
    "老师提供的故事想法：",
    context.course.storyIdea || "无。请根据主题、学生兴趣和角色信息生成。",
    "",
    "【章节数量】",
    "",
    `每个方案必须生成 ${expectedChapterCount} 章。`,
    "",
    "章节数规则：",
    "- 30 分钟：3 章",
    "- 45 分钟：4 章",
    "- 60 分钟：5 章",
    "",
    "【角色表】",
    "",
    "故事中只能使用 nameToUseInStory 作为角色名。",
    "人名是专有名词，必须原样保留。",
    "",
    "老师：",
    `- teacherId: ${context.teacher.id}`,
    `- nameToUseInStory: ${personName(context.teacher)}`,
    `- 角色说明：${teacherDescription(context.teacher)}`,
    "",
    "学生：",
    studentBlock(context.students),
    "",
    "【人名规则】",
    "",
    "必须严格遵守：",
    "- 禁止翻译人名。",
    "- 禁止改写人名。",
    "- 禁止解释人名。",
    "- 禁止给角色另起名字。",
    "- 如果姓名是单字，例如“尤”，它就是姓名“尤”，不能理解成“你”。",
    "- 如果没有英文名，不要自行创造英文名。",
    "- 故事中出现老师或学生时，只能使用角色表里的 nameToUseInStory。",
    "",
    "【老师原意规则】",
    "",
    "如果老师提供了故事想法，必须先遵循老师原意，再优化故事大纲。",
    "",
    "必须保留老师故事想法中的：",
    "- 明确人物",
    "- 历史人物",
    "- 地点",
    "- 时代",
    "- 关键物品",
    "- 核心任务",
    "- 主要事件",
    "- 明确故事风格",
    "",
    "禁止：",
    "- 把老师指定的人物换成别人。",
    "- 把历史人物换成虚构人物。",
    "- 把历史人物放到明显错误的时代。",
    "- 编造会误导儿童的历史事实。",
    "- 抛弃老师原本想讲的故事另起炉灶。",
    "",
    "如果涉及历史人物：",
    "- 保持尊重和基本历史合理性。",
    "- 可以用梦境、博物馆、时间旅行课堂、故事书进入等儿童化方式连接。",
    "- 不要捏造严重违背常识的历史内容。",
    "- 不要把历史人物写成无关的魔法角色、怪物、现代网红或完全虚构人物。",
    "",
    "【三个方案定位】",
    "",
    "必须生成 3 个明显不同的方案。",
    "",
    "option-1:",
    '- id 必须是 "option-1"',
    '- variant 必须是 "faithful"',
    "- 定位：贴近原意",
    "- 如果老师提供故事想法，最大程度保留原设定，只补足故事推进。",
    "- 如果老师没有故事想法，生成最直接、最好理解的故事方向。",
    "",
    "option-2:",
    '- id 必须是 "option-2"',
    '- variant 必须是 "enhanced"',
    "- 定位：推荐 · 结构增强",
    "- 保留主题和核心设定，让故事更完整、更适合课堂。",
    "- 这是默认推荐方案。",
    "",
    "option-3:",
    '- id 必须是 "option-3"',
    '- variant 必须是 "creative"',
    "- 定位：创意拓展",
    "- 可以更有想象力，但不能离题。",
    "- 不能丢掉老师指定的核心元素。",
    "",
    "【故事质量要求】",
    "",
    "每个方案必须：",
    "- 使用中文。",
    "- 有清楚的故事主线。",
    "- 有开端、推进和收束。",
    "- 每章都推动故事前进。",
    "- 最后一章要自然完成、发现、解决或成长。",
    "- 老师和学生都参与故事行动。",
    "- 老师是故事中的引导者，不是旁白或评委。",
    "- 学生参与观察、选择、行动或合作。",
    "- 适合儿童课堂。",
    "- 不恐怖、不暴力、无真实危险。",
    "",
    "【学习目标边界】",
    "",
    "学习目标只作为后续内容开发的背景参考。",
    "故事应方便后续改写成英文绘本和练习，但输出中不要呈现任何学习目标设计。",
    "",
    "禁止输出：",
    "- 知识点设计",
    "- 语法说明",
    "- 教学目标说明",
    "- grammar 字段",
    "- knowledge 字段",
    "- teaching 字段",
    "- exercise 字段",
    "- “本章练习……”",
    "- “通过某语法点……”",
    "- “说对英语才能通关”的固定套路",
    "",
    "【长度限制】",
    "",
    "这是故事大纲，不是正文。必须短。",
    "",
    "每个方案：",
    "- title：最多 12 个中文字符",
    "- storyline：最多 55 个中文字符，1 句",
    "- chapter.title：最多 10 个中文字符",
    "- chapter.summary：最多 30 个中文字符，1 句",
    "",
    "禁止：",
    "- 不写对白。",
    "- 不写台词。",
    "- 不写完整场景。",
    "- 不写细节描写。",
    "- 不写心理活动。",
    "- 不展开正文。",
    "- 不写长段落。",
    "- 不超过长度限制。",
    "",
    "【字段含义】",
    "",
    "title：",
    "中文故事标题，短，有画面感。",
    "",
    "storyline：",
    "故事主线，说明整个故事靠什么推进。",
    "不要写成宣传语。",
    "不要写知识点。",
    "不要写正文细节。",
    "",
    "chapters[].summary：",
    "每章一个关键推进事件。",
    "不要拆成目标、阻碍、转折。",
    "不要写正文。",
    "不要写教学设计。",
    "",
    "【最终输出要求】",
    "",
    "最终回复只输出 JSON。",
    "顶层只能有 options 一个字段。",
    "不得添加任何其他字段。",
    "",
    "严格输出以下结构：",
    JSON.stringify(
      {
        options: [
          {
            id: "option-1",
            variant: "faithful",
            title: "不超过12字",
            storyline: "不超过55字的一句故事主线。",
            chapters: [{ title: "不超过10字", summary: "不超过30字的一句章节大纲。" }],
          },
          {
            id: "option-2",
            variant: "enhanced",
            title: "不超过12字",
            storyline: "不超过55字的一句故事主线。",
            chapters: [{ title: "不超过10字", summary: "不超过30字的一句章节大纲。" }],
          },
          {
            id: "option-3",
            variant: "creative",
            title: "不超过12字",
            storyline: "不超过55字的一句故事主线。",
            chapters: [{ title: "不超过10字", summary: "不超过30字的一句章节大纲。" }],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "输出前请在内部自检，不要输出自检过程：",
    "- 顶层是否只有 options？",
    "- 是否正好 3 个方案？",
    `- 每个方案是否正好 ${expectedChapterCount} 章？`,
    "- id 和 variant 是否完全正确？",
    "- 是否没有 title、storyline、chapters、chapter.title、chapter.summary 以外的字段？",
    "- 是否没有知识点、练习、教案、图片提示？",
    "- 是否没有英文正文？",
    "- 是否没有对白、台词、长描写？",
    "- 是否保留老师指定的核心人物、历史人物、地点、时代和事件？",
    "- 是否所有角色名都严格照抄 nameToUseInStory？",
    "- 是否每个字段都足够短？",
    "",
    "现在只输出 JSON。",
  ].join("\n");
}

function mockStoryOptions(context: StoryGenerationContext): StoryOption[] {
  const expectedChapterCount = getExpectedChapterCount(context.course.durationMinutes);
  const variants = [
    { id: "option-1", variant: "faithful" as const, title: "贴近故事", storyline: `老师和学生围绕${context.course.theme}完成一条清楚的课堂冒险线。` },
    { id: "option-2", variant: "enhanced" as const, title: "推荐故事", storyline: `大家在${context.course.theme}中沿线索推进，最终完成温暖发现。` },
    { id: "option-3", variant: "creative" as const, title: "创意故事", storyline: `${context.course.theme}出现奇妙规则，老师和学生合作找到答案。` },
  ];

  return variants.map((option) => ({
    ...option,
    chapters: Array.from({ length: expectedChapterCount }, (_, index) => ({
      title: `第${index + 1}章`,
      summary: `老师和学生推进第${index + 1}个关键事件。`,
    })),
  }));
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed) as { options?: StoryOption[] };
}

export function buildDeepSeekRequestBody(messages: ChatMessage[]): DeepSeekRequestBody {
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";

  return {
    model,
    messages,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
  };
}

async function callDeepSeek(messages: ChatMessage[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  if (!apiKey) {
    throw new Error("AI 服务未配置");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDeepSeekRequestBody(messages)),
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
      content: [
        "你是儿童 PBL 英语绘本课程的中文故事大纲策划专家。",
        "你的任务是生成中文故事大纲候选方案，供老师选择故事方向。",
        "请先在内部思考和自检，但最终只输出严格 JSON。",
        "硬性规则：",
        "1. 只写故事大纲，不写正文。",
        "2. 不写英文课文。",
        "3. 不写教案。",
        "4. 不写知识点设计。",
        "5. 不写练习题、答案、挖空题。",
        "6. 不写图片提示词或分镜。",
        "7. 不翻译、改写、解释或替换任何人名。",
        "8. 不替换老师明确指定的人物、历史人物、地点、时代、关键物品或核心事件。",
        "9. 输出内容必须简短，用于选择故事方向，不要替代后续正文创作。",
        "10. 最终回复必须是严格 JSON，不要 Markdown，不要解释，不要注释，不要多余字段。",
      ].join("\n"),
    },
    {
      role: "user",
      content: buildPrompt(context),
    },
  ];

  const content = await callDeepSeek(messages);
  const parsed = parseJsonObject(content);
  return validateStoryOptions(parsed.options ?? [], expectedChapterCount);
}
