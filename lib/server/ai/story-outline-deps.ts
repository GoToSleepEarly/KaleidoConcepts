import type {
  CourseResearchPlan,
  CourseSourceReferenceType,
  CourseSourceStatus,
  StoryWritingProvider,
} from "@/lib/contracts/api";

import { createStoryOutlineProvider } from "./story-outline-provider";

function parseJson<T>(text: string, fallbackMessage: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const startsWithArray = firstArray >= 0 && (firstObject < 0 || firstArray < firstObject);
  const extracted = startsWithArray
    ? trimmed.slice(firstArray, trimmed.lastIndexOf("]") + 1)
    : firstObject >= 0
      ? trimmed.slice(firstObject, trimmed.lastIndexOf("}") + 1)
      : "";
  let cause: unknown;
  for (const candidate of [trimmed, fenced, extracted]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      cause = error;
    }
  }
  throw new Error(fallbackMessage, { cause });
}

function bilingualText(value: string | { zh?: string; en?: string }) {
  if (typeof value === "string") return value;
  return value.zh || value.en || "";
}

type CoursePersonPrompt = Array<{
  role: string;
  chineseName: string;
  englishName: string;
  age: number;
  gender: string;
}>;

type StoryPromptContext = {
  chapterCount: number;
  coursePeople: CoursePersonPrompt;
  conversationHistory: Array<{ role: string; content: string }>;
  references: unknown[];
  selectedDirection: unknown;
  currentDirections?: unknown[];
  currentOutline: unknown;
};

function contextPrompt(input: StoryPromptContext) {
  const peopleSnapshots = input.coursePeople.map(({ role, chineseName, englishName, age, gender }) => ({
    role,
    chineseName,
    englishName,
    age,
    gender,
  }));
  return [
    "<course_context>",
    `指定章节数：${input.chapterCount}`,
    `老师和学生人物快照：${JSON.stringify(peopleSnapshots)}`,
    "</course_context>",
    "<conversation_history>",
    JSON.stringify(input.conversationHistory),
    "</conversation_history>",
    "<current_state>",
    `已选择故事方向：${JSON.stringify(input.selectedDirection)}`,
    `当前未选择的故事方向：${JSON.stringify(input.currentDirections ?? [])}`,
    `已保存参考资料：${JSON.stringify(input.references)}`,
    `当前故事大纲：${JSON.stringify(input.currentOutline)}`,
    "</current_state>",
  ];
}

type FreeInputDecision = {
  decision: "ask_clarification" | "ask_story_usage" | "prepare_reference_material" | "request_reference_material" | "generate_directions" | "generate_outline";
  assistantMessage: string;
  referenceName?: string;
  referenceType?: CourseSourceReferenceType;
  researchPlan?: CourseResearchPlan;
  teacherReference?: {
    name: string;
    type: CourseSourceReferenceType;
    summary: string;
    usableFacts: string[];
    avoidTopics: string[];
    adaptationBoundary: string;
  };
  teacherReferences?: Array<{
    name: string;
    type: CourseSourceReferenceType;
    summary: string;
    usableFacts: string[];
    avoidTopics: string[];
    adaptationBoundary: string;
  }>;
};

const referenceTypes: CourseSourceReferenceType[] = [
  "real_person",
  "historical_person",
  "public_figure",
  "ip",
  "game_character",
  "fictional_character",
  "other",
];

const sourceStatuses: CourseSourceStatus[] = ["confirmed", "insufficient", "teacher_supplied"];

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean);
}

function normalizeReference(
  value: unknown,
  fallbackName: string,
  fallbackSummary: string,
  fallbackStatus: CourseSourceStatus = "confirmed",
) {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const name = stringValue(source.name) || fallbackName || "老师补充资料";
  const summary = stringValue(source.summary) || fallbackSummary || `关于${name}的参考资料。`;
  const type = referenceTypes.includes(source.type as CourseSourceReferenceType)
    ? source.type as CourseSourceReferenceType
    : "other";
  const sourceStatus = sourceStatuses.includes(source.sourceStatus as CourseSourceStatus)
    ? source.sourceStatus as CourseSourceStatus
    : fallbackStatus;
  return {
    name,
    type,
    sourceStatus,
    summary,
    usableFacts: stringArray(source.usableFacts),
    avoidTopics: stringArray(source.avoidTopics),
    adaptationBoundary: stringValue(source.adaptationBoundary) || "仅使用已确认资料进行适合课堂的改编。",
  };
}

function normalizeResearchPlan(value: unknown): CourseResearchPlan | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Record<string, unknown>;
  const researchGoal = stringValue(source.researchGoal);
  if (!researchGoal || !Array.isArray(source.packets)) return undefined;
  const packets = source.packets.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const packet = value as Record<string, unknown>;
    const title = stringValue(packet.title);
    const subjects = Array.isArray(packet.subjects)
      ? packet.subjects.flatMap((value) => {
          if (typeof value !== "object" || value === null) return [];
          const subject = value as Record<string, unknown>;
          const name = stringValue(subject.name);
          if (!name) return [];
          const context = stringValue(subject.context);
          return [{ name, ...(context ? { context } : {}) }];
        })
      : [];
    const researchQuestions = stringArray(packet.researchQuestions);
    const storyUseGoals = stringArray(packet.storyUseGoals);
    if (!title || !subjects.length || !researchQuestions.length || !storyUseGoals.length) return [];
    return [{ title, subjects, researchQuestions, storyUseGoals }];
  });
  return packets.length ? { researchGoal, packets } : undefined;
}

export function createStoryOutlineGenerationDeps() {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider());
  return {
    decideFreeInput: async (input: {
      task: string;
      chapterCount: number;
      coursePeople: CoursePersonPrompt;
      conversationHistory: Array<{ role: string; content: string }>;
      references: unknown[];
      selectedDirection: unknown;
      currentOutline: unknown;
    }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_decide_free_input",
        prompt: [
          "你是 Step 2 的流程判断助手，只判断流程下一步，不创作故事方向或故事大纲。",
          "只返回 JSON 对象，字段：decision, assistantMessage, referenceName, referenceType, researchPlan, teacherReferences。decision 只能是 ask_clarification, ask_story_usage, prepare_reference_material, request_reference_material, generate_directions, generate_outline。",
          "按以下顺序判断：意图或引用对象有歧义时返回 ask_clarification；需要背景资料时先准备资料；只有确认参考资料后，才能依据已保存资料判断是否存在完整原剧情、如何使用原剧情以及主线是否完整。",
          "仅当已保存资料清楚包含某个小说、电影、动漫、游戏主线等既有作品的完整开端、关键转折、高潮和结局，而且老师尚未说明使用方式时，返回 ask_story_usage。不要仅凭对象名称或模型印象判断存在完整原剧情。assistantMessage 使用“资料中包含完整原剧情。你希望怎么讲这个故事？”。",
          "老师选择“按原剧情讲”时，保留原作主线、关键转折和结局，原剧情本身视为完整主线，返回 generate_outline；学生默认只是课程学习者，不进入故事。老师选择“创作新剧情”时，只保留指定的原作人物、世界观或主题；没有明确新主线时返回 generate_directions。老师通过“我希望这样讲这个故事”补充时，按其具体要求和主线完整度判断。",
          "当前存在未选择的故事方向时，老师继续补充人物、情节、风格或方向要求，默认返回 generate_directions 以替换旧方向；只有老师明确表示不再选择方向、要求直接生成大纲，且主线已经完整时才返回 generate_outline。",
          "不需要背景资料且主线仍宽泛时返回 generate_directions；只有老师已经明确给出主角目标、核心冲突和关键推进方式、选择按原剧情讲，或修改要求足够具体时，才返回 generate_outline。只给出人物、主题、类型或氛围不算主线明确。",
          "展示参考资料与是否联网是两个独立判断。故事依赖真实人物、历史背景、公众人物、既有作品角色、科学事实等背景知识时，应先为老师准备参考资料；你自身已有可靠、稳定知识时返回 prepare_reference_material，自身知识不足时才返回 request_reference_material。纯原创设定且不依赖外部背景知识时不需要资料。",
          "先检查 current_state 中已保存参考资料。现有资料已经覆盖本轮所需背景时，不重复返回 prepare_reference_material 或 request_reference_material，直接按主线清晰度继续。只有新增对象或出现尚未覆盖的必要知识时才准备新资料。",
          "只有对象冷门或有歧义、需要最新信息、精确时间线或专业细节、现有知识明显不足或老师明确要求核实时，才返回 request_reference_material。不得仅因对象属于真实人物、IP 或游戏角色就要求联网；例如你熟悉其稳定核心设定时应返回 prepare_reference_material。",
          "assistantMessage 只用中文简要说明当前缺口或下一步，不复述全部需求。不要自行发起联网；仅在返回 request_reference_material 后，由老师选择手动补充或联网整理。",
          "在 prepare_reference_material 或 request_reference_material 时返回 researchPlan。researchPlan 结构为 {researchGoal, packets:[{title, subjects:[{name, context?}], researchQuestions, storyUseGoals}]}。研究既有故事时，必须覆盖完整主线、关键转折、结局和主要人物关系，不能只搜对象简介。",
          "不要套用固定知识分类。根据完整对话和故事目标动态决定研究对象、问题和颗粒度；同一作品且需要共同参与故事、彼此有关联的多个角色通常放在同一个 packet，不相关对象可拆分。",
          "老师手动补充的资料足够时，在 teacherReferences 中按可独立使用的资料组整理；若资料包含完整既有剧情但使用方式仍不明确，可以返回 ask_story_usage，否则按主线清晰度返回 generate_directions 或 generate_outline。每项字段为 name, type, summary, usableFacts, avoidTopics, adaptationBoundary，数组字段无内容时返回空数组。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<FreeInputDecision>(text, "故事需求判断失败，请重试");
      const latestTeacherMessage = [...input.conversationHistory].reverse().find((message) => message.role === "teacher")?.content || "";
      const rawTeacherReferences = parsed.teacherReferences?.length
        ? parsed.teacherReferences
        : parsed.teacherReference
          ? [parsed.teacherReference]
          : [];
      const teacherReferences = rawTeacherReferences.map((reference) => {
        const normalized = normalizeReference(reference, parsed.referenceName || "", latestTeacherMessage);
        return {
          name: normalized.name,
          type: normalized.type,
          summary: normalized.summary,
          usableFacts: normalized.usableFacts,
          avoidTopics: normalized.avoidTopics,
          adaptationBoundary: normalized.adaptationBoundary,
        };
      });
      return {
        ...parsed,
        researchPlan: normalizeResearchPlan(parsed.researchPlan),
        referenceName: parsed.referenceName || teacherReferences[0]?.name,
        teacherReference: teacherReferences[0],
        teacherReferences,
      };
    },
    generateDirections: async (input: StoryPromptContext & { task: string }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_generate_directions",
        prompt: [
          "你是英语 PBL 绘本课程的故事方向策划助手，只设计可供老师选择的故事走向，不生成章节大纲。",
          "只返回包含 3 项的 JSON 数组；每项字段为 title, hook, whyFits, mainCharacters, classroomValue, seedPrompt，所有字段内容都只返回中文。",
          "完整保留老师明确指定的故事类型、人物或角色、学生参与方式和已确认资料边界；不得用自行新增角色替换老师点名的角色。",
          "Step 1 人物快照描述的是课程参与者，不等于故事角色。只有老师明确要求学生或老师进入剧情时，才把他们列入 mainCharacters 或设计其剧情行动。",
          "老师选择“创作新剧情”时才设计新的故事主线；老师选择“按原剧情讲”时不得生成方向，应由流程判断直接进入大纲。当前存在未选择方向且老师提出新要求时，3 个新方向必须明显落实最新反馈并替换旧方向。",
          "mainCharacters 只列具体且需要保持视觉一致性的角色。机构、团队和背景群体只能写进 hook 或 seedPrompt，不得作为主要角色；参考资料提到某个实体不等于它必须成为角色。",
          "老师要求冒险时，设计任务、旅程、挑战、选择和行动；只有老师明确要求时才使用调查、推理或解谜主线。",
          "3 个方向必须在任务目标、冲突来源、主角视角或行动路径上形成明显差异，同时保持同一组硬性要求。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
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
    generateReferenceFromKnowledge: async (input: StoryPromptContext & { task: string; researchPlan: CourseResearchPlan }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_generate_reference_from_knowledge",
        prompt: [
          "你只负责把已有背景知识整理成老师可阅读、可用于故事创作的参考资料，不判断流程，不设计故事方向或大纲。",
          "只使用你自身已有且有把握的稳定知识，不得联网。严格围绕 researchPlan 中每个 packet 的 researchQuestions 整理，并让结果能够完成 storyUseGoals。",
          "不确定的细节不要编造，也不要用看似精确的日期、数字或情节填补记忆空白；可在 avoidTopics 或 adaptationBoundary 中明确知识边界。",
          "只返回 JSON 数组，每个 packet 对应一个对象，顺序保持一致。字段：name, type, sourceStatus, summary, usableFacts, avoidTopics, adaptationBoundary。",
          "不要使用 Markdown 代码块，不要在 JSON 前后添加说明。usableFacts 和 avoidTopics 必须是 JSON 字符串数组，没有内容时返回空数组。",
          "type 只能是 real_person, historical_person, public_figure, ip, game_character, fictional_character, other；sourceStatus 返回 confirmed。",
          "name 使用对应 packet 的 title。summary 用中文概括与故事目标直接相关的知识脉络；usableFacts 提取 4-10 条具体、带因果或规则、能直接转化为剧情的中文要点。",
          ...contextPrompt(input),
          "<research_plan>",
          JSON.stringify(input.researchPlan),
          "</research_plan>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Array<{
        name: string;
        type: CourseSourceReferenceType;
        sourceStatus: CourseSourceStatus;
        summary: string;
        usableFacts: string[];
        avoidTopics: string[];
        adaptationBoundary: string;
      }>>(text, "参考资料解析失败，请重试");
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return values.map((value, index) => {
        const packet = input.researchPlan.packets[index];
        const fallbackName = packet?.title || input.researchPlan.researchGoal;
        return normalizeReference(value, fallbackName, `关于${fallbackName}的背景参考资料。`);
      });
    },
    searchReference: async (input: StoryPromptContext & { task: string; researchPlan: CourseResearchPlan }) => {
      const { text } = await client().searchReference({
        operation: "story_search_reference",
        prompt: [
          "你只做资料研究，不判断流程、不设计故事方向或大纲。请联网整理真正能支撑儿童英语 PBL 故事创作的参考资料，不要只做对象简介。",
          "严格围绕 researchPlan 中每个 packet 的 researchQuestions 查证信息，并让结果能够完成 storyUseGoals。",
          "只返回 JSON 数组，每个 packet 对应一个对象，顺序保持一致。字段：name, type, sourceStatus, summary, usableFacts, avoidTopics, adaptationBoundary。",
          "不要使用 Markdown 代码块，不要在 JSON 前后添加说明。usableFacts 和 avoidTopics 必须是 JSON 字符串数组，没有内容时返回空数组。",
          "type 只能是 real_person, historical_person, public_figure, ip, game_character, fictional_character, other。",
          "sourceStatus 只能是 confirmed 或 insufficient。",
          "只能使用本次联网搜索能够支持的事实，不得用模型记忆补齐搜索缺口。无法确认完整且准确的核心信息、来源相互冲突、只能找到零散简介，或无法完成任一 researchQuestion / storyUseGoal 时必须返回 insufficient；不得为了凑够要点而捏造。",
          "只有权威来源能够直接支持，或多个独立可靠来源相互印证时，才能返回 confirmed。搜索摘要、转载片段或缺少上下文的单一说法不足以确认完整剧情与关键事实。",
          "name 使用对应 packet 的 title。summary 用中文概括与研究目标直接相关的完整知识脉络；usableFacts 提取 6-12 条具体、可核验、带因果或规则、能直接转化为剧情的中文要点。",
          "不要用空泛标签凑数。存在争议或儿童不宜内容时仍先保证事实完整，再放入 avoidTopics；adaptationBoundary 说明如何安全改编。",
          ...contextPrompt(input),
          "<research_plan>",
          JSON.stringify(input.researchPlan),
          "</research_plan>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Array<{
        name: string;
        type: CourseSourceReferenceType;
        sourceStatus: CourseSourceStatus;
        summary: string;
        usableFacts: string[];
        avoidTopics: string[];
        adaptationBoundary: string;
      }>>(text, "参考资料解析失败，请重试");
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return values.map((value, index) => {
        const packet = input.researchPlan.packets[index];
        const fallbackName = packet?.title || input.researchPlan.researchGoal;
        return normalizeReference(value, fallbackName, `关于${fallbackName}的联网参考资料。`, "insufficient");
      });
    },
    generateOutline: async (input: {
      task: string;
      references: unknown[];
      chapterCount: number;
      writingProvider: StoryWritingProvider;
      coursePeople: CoursePersonPrompt;
      conversationHistory: Array<{ role: string; content: string }>;
      selectedDirection: unknown;
      currentOutline?: unknown;
    }) => {
      const { text } = await client().generateOutline({
        writingProvider: input.writingProvider,
        operation: "story_generate_outline",
        prompt: [
          "你是英语 PBL 绘本课程故事大纲助手，只负责生成可确认的故事大纲，不生成教学设计、练习、答案或图片提示。",
          "只返回 JSON 对象，字段为 title, summary, narrativeType, characters, chapters。所有面向老师展示的自然语言字段都只返回中文，不要返回英文或中英双语。",
          "characters 每项字段为 displayName, sourceType, roleInStory, shortDescription, visualDescription, shouldAppearInImages；sourceType 只能是 person, referenced, original。",
          "characters 是后续视觉资产名单，不是所有被故事提到的实体清单。只保留具体、持续参与剧情、需要保持视觉一致性的角色；机构、公司、团队、部门、监管方和其他背景群体不得进入 characters，只能在 summary 或章节 whatHappens 中按需提及。参考资料中出现某个实体，不代表它是角色。",
          "外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced，并在能够对应已保存参考资料时填写 sourceReferenceId；原创人物才使用 original。",
          "课堂人物只能复用人物快照，不编造外貌、性格或背景。老师点名且要求出场的每个角色都必须进入 characters，并在至少一章通过实际行动推动剧情；每个角色都必须服务核心冲突，AI 自行新增的原创角色最多 1 个，群像要求除外。",
          "chapters 每项字段为 order, title, whatHappens, characterIds；数量必须等于指定章节数。每章只在 whatHappens 中写约 50 字的中文剧情概述，必须推进具体事件，并与前后章节形成因果关系。",
          "需求优先级从高到低为：老师历史中明确要求；已选择方向；已确认参考资料；当前大纲；通用创作建议。低优先级内容不得覆盖高优先级要求。",
          "根据人物年龄、老师要求和引用对象选择叙事类型与主角；学生不强制成为主角，但如果进入故事，必须有自然身份和剧情功能。",
          "Step 1 人物快照默认只用于理解课程学习者。老师选择“按原剧情讲”时，严格保留原作主线、关键转折、结局和原作角色，学生与老师不得自动进入 characters 或正文；只有老师明确要求他们进入剧情时才加入。",
          "保持老师明确指定的故事类型。冒险故事以任务、旅程、挑战、选择和行动推进；只有老师明确要求解谜、侦探、调查、线索或推理时，才使用相应主线。",
          ...contextPrompt({ ...input, currentOutline: input.currentOutline ?? null }),
          "<current_task>",
          input.task,
          "</current_task>",
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
          whatHappens?: string;
          characterActions?: string;
          mainlineProgress?: string;
          storyGoal?: string;
          keyEvents?: string[];
          characterIds: string[];
          setting?: string;
          endingHook?: string;
        }>;
      }>(text, "故事大纲解析失败，请重试");
      return {
        ...parsed,
        title: bilingualText(parsed.title),
        summary: bilingualText(parsed.summary),
        chapters: parsed.chapters.map((chapter) => ({
          ...chapter,
          title: bilingualText(chapter.title),
          storyGoal: chapter.whatHappens || chapter.storyGoal || "",
          keyEvents: [
            chapter.characterActions,
            chapter.mainlineProgress,
            ...(chapter.keyEvents ?? []),
          ].filter((item): item is string => Boolean(item)),
          setting: chapter.setting || "",
          endingHook: chapter.endingHook || "",
          whatHappens: chapter.whatHappens || chapter.storyGoal || "",
          characterActions: chapter.characterActions || "",
          mainlineProgress: chapter.mainlineProgress || "",
        })),
      };
    },
  };
}
