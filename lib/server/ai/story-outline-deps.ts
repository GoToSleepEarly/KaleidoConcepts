import type {
  CourseResearchPlan,
  CourseSourceReferenceType,
  CourseSourceStatus,
  StoryAlignmentQuestion,
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

function bilingualText(value: string | { zh?: string; en?: string } | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.zh || value.en || "";
}

function bilingualChapterTitle(value: string | { zh?: string; en?: string } | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const zh = value.zh?.trim() ?? "";
  const en = value.en?.trim() ?? "";
  return zh && en ? `${zh} / ${en}` : zh || en;
}

type CoursePersonPrompt = Array<{
  personId: string;
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
  englishLevel?: string;
  durationMinutes?: 30 | 45 | 60;
  selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string }>;
  confirmedRequirement?: string;
};

function knowledgePointOptions(input: Pick<StoryPromptContext, "selectedKnowledgePoints">) {
  return (input.selectedKnowledgePoints ?? []).map((point, index) => ({
    key: `KP${index + 1}`,
    label: point.label,
    category: point.category,
    id: point.id,
  }));
}

function contextPrompt(input: StoryPromptContext) {
  const peopleSnapshots = input.coursePeople.map(({ personId, role, chineseName, englishName, age, gender }) => ({
    personId,
    role,
    chineseName,
    englishName,
    age,
    gender,
  }));
  return [
    "<course_context>",
    `指定章节数：${input.chapterCount}`,
    ...(input.englishLevel ? [`英语难度：${input.englishLevel}`, `课程时长：${input.durationMinutes} 分钟`, `全课可选知识点：${JSON.stringify(knowledgePointOptions(input).map((point) => ({ key: point.key, label: point.label, category: point.category })))}`] : []),
    `老师和学生人物快照：${JSON.stringify(peopleSnapshots)}`,
    ...(input.confirmedRequirement ? [`已确认创作理解：${input.confirmedRequirement}`] : []),
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

type AlignmentDecision = {
  status: "needs_clarification" | "ready_for_confirmation";
  planningMode: "explore_options" | "follow_defined_plot";
  assistantMessage: string;
  resolvedUnderstanding: string[];
  unresolvedIssues: string[];
  questions: StoryAlignmentQuestion[];
  summary?: string;
};

type BackgroundKnowledgeResult =
  | { status: "not_needed"; reason: string }
  | { status: "ready"; references: ReturnType<typeof normalizeReference>[] }
  | { status: "external_required"; reason: string; researchPlan: CourseResearchPlan };

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

function normalizeAlignmentQuestion(value: unknown): StoryAlignmentQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  const id = stringValue(source.id);
  const label = stringValue(source.label);
  const answerMode = source.answerMode === "multi_choice" || source.answerMode === "text" ? source.answerMode : "single_choice";
  if (!id || !label) return null;
  const options = Array.isArray(source.options) ? source.options.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const option = item as Record<string, unknown>;
    const optionId = stringValue(option.id);
    const optionLabel = stringValue(option.label);
    if (!optionId || !optionLabel) return [];
    return [{
      id: optionId,
      label: optionLabel,
      enablesTextInput: Boolean(option.enablesTextInput),
      ...(stringValue(option.textPlaceholder) ? { textPlaceholder: stringValue(option.textPlaceholder) } : {}),
    }];
  }) : undefined;
  const recommendationSource = typeof source.recommendation === "object" && source.recommendation !== null
    ? source.recommendation as Record<string, unknown>
    : null;
  const recommendationValue = stringValue(recommendationSource?.value);
  const recommendationReason = stringValue(recommendationSource?.reason);
  return {
    id,
    label,
    ...(stringValue(source.reason) ? { reason: stringValue(source.reason) } : {}),
    required: source.required !== false,
    answerMode,
    ...(options?.length ? { options } : {}),
    allowCustom: source.allowCustom !== false,
    allowRecommendation: Boolean(source.allowRecommendation),
    ...(recommendationValue && recommendationReason ? { recommendation: { value: recommendationValue, reason: recommendationReason } } : {}),
  };
}

export function createStoryOutlineGenerationDeps() {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider());
  return {
    alignRequirements: async (input: StoryPromptContext & { task: string }): Promise<AlignmentDecision> => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_align_requirements",
        prompt: [
          "你是一名资深儿童故事策划编辑，擅长通过精准追问，把教师零散、模糊或有歧义的想法整理成清晰、可执行的故事创作意图。",
          "你当前只负责理解和确认创作需求：不创作故事方向，不生成故事大纲，不查找或整理背景资料，也不替老师补充会改变故事本质的关键意图。",
          "需求对齐的目标不是帮助老师补完整个故事，而是确认故事的大方向和不可误解的边界。",
          "核心判断：如果当前信息存在两种或以上合理理解，并且不同理解会产生本质不同的故事，就必须继续提问；可以安全交给后续三个故事方向探索的内容不需要提问。",
          "老师可以只提供人物、IP、主题或粗略想法。不要要求老师提前确定主角目标、核心冲突、关键事件、奇幻机制或结局；老师没有完整故事想法不是信息缺失，后续系统会生成 3 个候选故事方向供老师选择。",
          "只需明确：故事围绕谁或什么展开；引用人物、IP、作品或事件如何进入故事；哪些人物、设定或内容必须保留；是否存在互相冲突的要求。",
          "每轮提出 1-3 个当前最关键且可独立回答的问题，有依赖关系的问题留到下一轮。选项用于加速但不要求覆盖所有可能，每题允许自定义输入。可以提供“我不确定，请给我建议”，但建议必须由老师再次确认后才算解决。",
          "老师明确提及 IP 时，视为希望实际使用其中的原作人物；不要主动提供只参考主题、氛围或风格的选项。版本或核心人物范围会显著改变故事时才继续确认。",
          "对齐完成后不直接生成故事，返回简短创作理解摘要等待老师确认。没有具体主线时，在摘要中说明将通过 3 个候选方向选择，不继续追问剧情细节。",
          "只返回 JSON：{status, planningMode, assistantMessage, resolvedUnderstanding, unresolvedIssues, questions, summary?}。status 只能是 needs_clarification 或 ready_for_confirmation；planningMode 只能是 explore_options 或 follow_defined_plot。",
          "questions 每项字段为 id, label, reason?, required, answerMode, options?, allowCustom, allowRecommendation, recommendation?。answerMode 只能是 single_choice, multi_choice, text。",
          "ready_for_confirmation 时 unresolvedIssues 和 questions 必须为空且 summary 非空；needs_clarification 时至少返回一个问题。不要使用模型、Prompt、JSON、调用等技术词。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Record<string, unknown>>(text, "故事需求对齐失败，请重试");
      const status = parsed.status === "ready_for_confirmation" ? "ready_for_confirmation" : "needs_clarification";
      const questions = Array.isArray(parsed.questions) ? parsed.questions.map(normalizeAlignmentQuestion).filter((item): item is StoryAlignmentQuestion => Boolean(item)) : [];
      const result: AlignmentDecision = {
        status,
        planningMode: parsed.planningMode === "follow_defined_plot" ? "follow_defined_plot" : "explore_options",
        assistantMessage: stringValue(parsed.assistantMessage) || (status === "ready_for_confirmation" ? "我已经整理好创作理解，请确认。" : "还需要确认几个会影响故事方向的问题。"),
        resolvedUnderstanding: stringArray(parsed.resolvedUnderstanding),
        unresolvedIssues: stringArray(parsed.unresolvedIssues),
        questions,
        ...(stringValue(parsed.summary) ? { summary: stringValue(parsed.summary) } : {}),
      };
      if (status === "ready_for_confirmation" && (!result.summary || result.unresolvedIssues.length || result.questions.length)) {
        throw new Error("故事需求对齐结果不完整，请重试");
      }
      if (status === "needs_clarification" && !result.questions.length) throw new Error("故事需求问题没有完整生成，请重试");
      return result;
    },
    prepareBackgroundKnowledge: async (input: StoryPromptContext & { task: string; confirmedRequirement: string }): Promise<BackgroundKnowledgeResult> => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_prepare_background",
        prompt: [
          "你是一名儿童故事背景资料编辑，负责为后续故事创作准备准确、必要且简洁的背景知识。",
          "老师已经确认了大体创作需求。不要重新判断、追问或改变老师的故事诉求。",
          "判断后续创作是否需要人物事实、原作角色、人物关系、世界设定或其他背景知识；完全原创且不依赖外部对象时返回 not_needed。",
          "如果需要，优先使用你已有且有把握的知识直接整理；只有当已有知识不足以准确支持故事创作时，才返回 external_required，并说明缺少什么。",
          "只整理本次故事会使用的对象、版本、人物和必要关系，不做百科式介绍，不扩展到无关人物、支线、时期或作品。",
          "内容突出可直接用于故事创作的人物特点、关系、重要事实和世界规则。不确定的信息不能猜测，也不能混合不同版本。",
          "不生成故事方向或故事大纲，不实际执行联网搜索。",
          "只返回 JSON。三种协议：{status:'not_needed',reason}；{status:'ready',references:[{name,type,sourceStatus,summary,usableFacts,avoidTopics,adaptationBoundary}]}；{status:'external_required',reason,researchPlan}。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Record<string, unknown>>(text, "背景知识准备失败，请重试");
      if (parsed.status === "not_needed") return { status: "not_needed", reason: stringValue(parsed.reason) || "当前故事不依赖外部背景知识。" };
      if (parsed.status === "external_required") {
        const researchPlan = normalizeResearchPlan(parsed.researchPlan);
        if (!researchPlan) throw new Error("背景知识缺口没有完整生成，请重试");
        return { status: "external_required", reason: stringValue(parsed.reason) || "需要补充外部资料。", researchPlan };
      }
      const values = Array.isArray(parsed.references) ? parsed.references : [];
      const references = values.map((value, index) => normalizeReference(value, `背景资料 ${index + 1}`, "本次故事需要的背景资料。"));
      if (!references.length) throw new Error("背景知识没有完整生成，请重试");
      return { status: "ready", references };
    },
    decideFreeInput: async (input: {
      task: string;
      chapterCount: number;
      coursePeople: CoursePersonPrompt;
      conversationHistory: Array<{ role: string; content: string }>;
      references: unknown[];
      selectedDirection: unknown;
      currentDirections?: unknown[];
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
          "assistantMessage 是直接展示给老师的聊天消息，只用中文说明已经理解到什么和马上要做什么，不复述全部需求。返回 generate_directions 时说明正在创作 3 个故事方向；返回 generate_outline 时说明正在生成章节大纲；返回 prepare_reference_material 时说明正在整理创作所需资料。不要使用“模型、prompt、JSON、调用”等技术词。不要自行发起联网；仅在返回 request_reference_material 后，由老师选择手动补充或联网整理。",
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
          "你是一名富有想象力的儿童故事创意总监，擅长把已经确认的创作需求发展成新奇、有吸引力且适合学生的故事构想。只生成 3 个可供老师选择的故事方向，不展开章节大纲。",
          "只返回包含 3 项的 JSON 数组；每项字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits, seedPrompt，所有内容使用中文。",
          "hook 必须用一句完整的话说明谁是主要角色、什么事件打破原有状态、角色需要完成什么、面临的主要困难或特殊规则。老师只阅读 hook，也应该能大致理解这个故事会怎样展开。禁止使用“一场奇妙冒险即将开始”等空泛悬念。",
          "storyHighlight 用一句话说明最有辨识度且真正影响剧情的设定、人物关系、冲突、视角、选择或结构，不强制使用奇幻规则。growthCore 说明角色原先如何理解或应对问题，以及故事后可能发生什么变化，不使用心理学术语或抽象品质口号。",
          "完整保留老师明确指定的故事类型、人物或角色、学生参与方式和已确认资料边界；不得用自行新增角色替换老师点名的角色。",
          "Step 1 人物快照描述的是课程参与者，不等于故事角色。只有老师明确要求学生或老师进入剧情时，才把他们列入 mainCharacters 或设计其剧情行动。",
          "老师选择“创作新剧情”时才设计新的故事主线；老师选择“按原剧情讲”时不得生成方向，应由流程判断直接进入大纲。当前存在未选择方向且老师提出新要求时，3 个新方向必须明显落实最新反馈并替换旧方向。",
          "mainCharacters 只列具体且需要保持视觉一致性的角色。机构、团队和背景群体只能写进 hook 或 seedPrompt，不得作为主要角色；参考资料提到某个实体不等于它必须成为角色。",
          "老师要求冒险时，设计任务、旅程、挑战、选择和行动；只有老师明确要求时才使用调查、推理或解谜主线。",
          "3 个方向必须在故事目标、冲突来源、角色关系、世界运作方式或行动路径上形成本质差异，而不是只更换地点、道具或配角。先保证故事有趣、意外且因果连贯，再考虑课堂价值。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      return parseJson<Array<{
        title: string;
        hook: string;
        storyHighlight: string;
        growthCore: string;
        whyFits: string;
        mainCharacters: string[];
        seedPrompt: string;
      }>>(text, "故事方向解析失败，请重试");
    },
    reviseDirection: async (input: StoryPromptContext & { task: string; direction: unknown }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_direction",
        prompt: [
          "你是一名富有想象力的儿童故事创意总监。根据老师最新要求，只调整指定的一张故事方向卡。",
          "必须保留老师没有要求改变的内容，并继续遵守已确认需求和背景资料。不要修改其他方向，不生成章节大纲。",
          "返回一份完整新版 JSON，字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits, seedPrompt，不返回修改说明。",
          "hook 必须用一句话讲清主要角色、触发事件、目标和主要困难；storyHighlight 说明真正影响剧情的故事亮点；growthCore 描述角色前后的心理变化。",
          ...contextPrompt(input),
          "<target_direction>",
          JSON.stringify(input.direction),
          "</target_direction>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      return parseJson<{
        title: string;
        hook: string;
        storyHighlight: string;
        growthCore: string;
        mainCharacters: string[];
        whyFits: string;
        seedPrompt: string;
      }>(text, "故事方向修改失败，请重试");
    },
    reviseChapter: async (input: StoryPromptContext & { task: string; chapterOrder: number }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_chapter",
        prompt: [
          "你是一名资深儿童故事主编，只修改老师指定的一章故事大纲。",
          "不得改变故事标题、整体主线、角色名单、其他章节及章节数量。修改必须承接上一章并能自然推动下一章；如果老师的要求无法在不影响这些内容的情况下完成，返回 {status:'requires_outline_revision',reason}。",
          "可以修改本章标题、剧情概述、出场角色和知识点建议。只返回 JSON：成功时 {status:'ready',chapter:{order,title:{zh,en},whatHappens,characterIds,recommendedKnowledgePointKeys,knowledgePointRecommendationSummary}}。",
          "characterIds 只能逐字复制当前大纲角色 id；recommendedKnowledgePointKeys 只能使用全课可选知识点短键。whatHappens 用约 50 字说明角色行动、局面变化及其对后续的推动。",
          ...contextPrompt(input),
          "<target_chapter_order>",
          String(input.chapterOrder),
          "</target_chapter_order>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Record<string, unknown>>(text, "章节修改失败，请重试");
      if (parsed.status === "requires_outline_revision") return { status: "requires_outline_revision" as const, reason: stringValue(parsed.reason) || "这项修改会影响整体故事，请改为修改整体大纲。" };
      const chapter = parsed.chapter as Record<string, unknown> | undefined;
      if (!chapter) throw new Error("章节修改结果不完整，请重试");
      const options = knowledgePointOptions(input);
      const keys = stringArray(chapter.recommendedKnowledgePointKeys);
      const recommendedKnowledgePointIds = [...new Set(keys.flatMap((value) => {
        const normalized = value.trim().toLowerCase();
        const match = options.find((option) => option.key.toLowerCase() === normalized || option.id.toLowerCase() === normalized || option.label.trim().toLowerCase() === normalized);
        return match ? [match.id] : [];
      }))];
      return {
        status: "ready" as const,
        chapter: {
          order: Number(chapter.order) || input.chapterOrder,
          title: bilingualChapterTitle(chapter.title as string | { zh?: string; en?: string } | undefined),
          whatHappens: stringValue(chapter.whatHappens),
          characterIds: stringArray(chapter.characterIds),
          recommendedKnowledgePointIds,
          knowledgePointRecommendationSummary: stringValue(chapter.knowledgePointRecommendationSummary),
        },
      };
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
      currentDirections?: unknown[];
      currentOutline?: unknown;
      confirmedRequirement?: string;
      englishLevel?: string;
      durationMinutes?: 30 | 45 | 60;
      selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string }>;
    }) => {
      const { text } = await client().generateOutline({
        writingProvider: input.writingProvider,
        operation: "story_generate_outline",
        prompt: [
          "你是一名资深儿童故事主编，只负责生成可确认的故事大纲，把老师已经选定的故事方向发展成完整、清楚且富有想象力的章节结构。不重新选择故事，不生成正式课文、练习、教学活动或图片提示。",
          "只返回 JSON 对象，字段为 title, summary, narrativeType, characters, chapters。故事 title 和章节 title 返回中英文双语对象 {zh,en}；英文标题应简洁、自然并忠实对应中文标题。其余面向老师展示的自然语言字段只返回中文。",
          "characters 每项字段为 key, displayName, sourceType, sourcePersonId?, sourceReferenceId?, roleInStory, storyDescription；key 使用 C1、C2 等响应内稳定短键，sourceType 只能是 person, referenced, original。不要生成 visualDescription 或 shouldAppearInImages。",
          "characters 是后续视觉资产名单，不是所有被故事提到的实体清单。只保留具体、持续参与剧情、需要保持视觉一致性的角色；机构、公司、团队、部门、监管方和其他背景群体不得进入 characters，只能在 summary 或章节 whatHappens 中按需提及。参考资料中出现某个实体，不代表它是角色。",
          "外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced，并在能够对应已保存参考资料时填写 sourceReferenceId；原创人物才使用 original。",
          "roleInStory 只写简短故事定位；storyDescription 用 1-2 句话说明角色在本故事中的目标、剧情作用和必要关系，不写人物百科或空泛性格标签。课堂人物只能复用人物快照，不编造外貌、性格或背景；进入 characters 时 sourcePersonId 必须逐字复制对应人物快照的 personId。",
          "老师点名且要求出场的每个角色都必须通过行动推动故事；每个角色都必须服务核心冲突，AI 自行新增的原创角色最多 1 个，群像要求除外。",
          "chapters 每项字段为 order, title:{zh,en}, whatHappens, characterKeys, recommendedKnowledgePointKeys, knowledgePointRecommendationSummary；characterKeys 只能引用 characters 中的 key。章节数量必须等于指定章节数。",
          "忠实保留已选方向的主要剧情、storyHighlight、growthCore 和核心角色。每章发生一个改变当前局面的具体事件，角色行动产生结果，结果成为后续事件的原因；不能只是重复任务、更换地点或罗列知识。",
          "故事亮点必须贯穿并推动主要剧情。角色成长通过面对处境、作出有意义的选择并承担结果体现，不用旁白宣布品质，也不套用固定的失败—合作—成功结构。想象力必须服务剧情，不能随机堆叠。",
          "每章只在 whatHappens 中写约 50 字中文剧情概述，讲清角色做了什么、局面发生什么变化、这个变化如何推动后续故事。",
          "先完成各章剧情，再为每章匹配知识点。每章至少推荐 1 个知识点；recommendedKnowledgePointKeys 只能逐字复制“全课可选知识点”中的 key（例如 KP1），不要返回数据库 id、知识点名称或自行创造 key。根据本章语言情境、英语难度和课程时长控制知识密度，不合适的知识点可以不推荐。knowledgePointRecommendationSummary 用一句简洁中文说明该知识点能在本章什么表达中自然使用。不要生成词数、题型或题量。",
          "需求优先级从高到低为：老师历史中明确要求；已选择方向；已确认参考资料；当前大纲；通用创作建议。低优先级内容不得覆盖高优先级要求。",
          "根据人物年龄、老师要求和引用对象选择叙事类型与主角；学生不强制成为主角，但如果进入故事，必须有自然身份和剧情功能。内容复杂度、风险和情绪强度适合学生年龄。",
          "Step 1 人物快照默认只用于理解课程学习者。老师选择“按原剧情讲”时，严格保留原作主线、关键转折、结局和原作角色，学生与老师不得自动进入 characters 或正文；只有老师明确要求他们进入剧情时才加入。",
          "保持老师明确指定的故事类型。冒险故事以任务、旅程、挑战、选择和行动推进；只有老师明确要求解谜、侦探、调查、线索或推理时，才使用相应主线。返回前自行检查章节因果、故事亮点是否贯穿、成长是否通过选择与结果表现，但不要输出检查过程。",
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
          key: string;
          displayName: string;
          sourceType: "person" | "referenced" | "original";
          sourcePersonId?: string | null;
          sourceReferenceId?: string | null;
          roleInStory: string;
          storyDescription: string;
        }>;
        chapters: Array<{
          order: number;
          title: string | { zh: string; en: string };
          whatHappens?: string;
          characterActions?: string;
          mainlineProgress?: string;
          storyGoal?: string;
          keyEvents?: string[];
          characterKeys: string[];
          setting?: string;
          endingHook?: string;
          recommendedKnowledgePointKeys?: string[];
          recommendedKnowledgePointIds?: string[];
          knowledgePointRecommendationSummary: string;
        }>;
      }>(text, "故事大纲解析失败，请重试");
      const options = knowledgePointOptions(input);
      const resolveKnowledgePointIds = (values: string[] = []) => [...new Set(values.flatMap((value) => {
        const normalized = value.trim().toLowerCase();
        const match = options.find((option) => option.key.toLowerCase() === normalized || option.id.toLowerCase() === normalized || option.label.trim().toLowerCase() === normalized);
        return match ? [match.id] : [];
      }))];
      return {
        ...parsed,
        title: bilingualChapterTitle(parsed.title),
        summary: bilingualText(parsed.summary),
        characters: parsed.characters.map((character, index) => ({
          key: character.key || `C${index + 1}`,
          displayName: character.displayName,
          sourceType: character.sourceType,
          sourcePersonId: character.sourcePersonId ?? null,
          sourceReferenceId: character.sourceReferenceId ?? null,
          roleInStory: character.roleInStory,
          shortDescription: character.storyDescription,
          shouldAppearInImages: true,
        })),
        chapters: parsed.chapters.map((chapter) => ({
          ...chapter,
          title: bilingualChapterTitle(chapter.title),
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
          characterKeys: chapter.characterKeys ?? [],
          characterIds: [],
          recommendedKnowledgePointIds: resolveKnowledgePointIds(chapter.recommendedKnowledgePointKeys ?? chapter.recommendedKnowledgePointIds),
          knowledgePointRecommendationSummary: chapter.knowledgePointRecommendationSummary ?? "",
        })),
      };
    },
  };
}
