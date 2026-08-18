import type {
  CourseResearchPlan,
  CourseSourceReferenceType,
  CourseSourceStatus,
  StoryAlignmentQuestion,
  StoryWritingProvider,
} from "@/lib/contracts/api";

import { devAiLog } from "./dev-ai-log";
import { createStoryOutlineProvider } from "./story-outline-provider";

export class StoryAlignmentResponseError extends Error {
  readonly status = 502;

  constructor(
    readonly code: "STORY_ALIGNMENT_INVALID_JSON" | "STORY_ALIGNMENT_INVALID_STRUCTURE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StoryAlignmentResponseError";
  }
}

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
  storyMode?: "faithful" | "new_story";
  classroomPresence?: "observer" | "participant" | "absent";
  onFormatRepair?: () => Promise<void>;
};

type StoryReferenceOption = {
  key: string;
  id: string;
  name: string;
  type?: string;
  summary?: string;
  usableFacts?: unknown;
  adaptationBoundary?: string;
};

function storyReferenceOptions(references: unknown[]): StoryReferenceOption[] {
  return references.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name) return [];
    return [{
      key: `R${String(index + 1).padStart(2, "0")}`,
      id,
      name,
      ...(typeof record.type === "string" ? { type: record.type } : {}),
      ...(typeof record.summary === "string" ? { summary: record.summary } : {}),
      ...(Array.isArray(record.usableFacts) ? { usableFacts: record.usableFacts } : {}),
      ...(typeof record.adaptationBoundary === "string" ? { adaptationBoundary: record.adaptationBoundary } : {}),
    }];
  });
}

function referenceMentionsName(reference: StoryReferenceOption, name: string) {
  const candidate = name.normalize("NFKC").trim();
  if (candidate.length < 2) return false;
  const referenceText = [reference.name, reference.summary, ...(Array.isArray(reference.usableFacts) ? reference.usableFacts : [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .normalize("NFKC");
  if (/[A-Za-z]/u.test(candidate)) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(referenceText);
  }
  return referenceText.toLocaleLowerCase().includes(candidate.toLocaleLowerCase());
}

function referenceMentionsCharacter(reference: StoryReferenceOption, character: { displayName: string; englishName: string }) {
  return referenceMentionsName(reference, character.displayName) || referenceMentionsName(reference, character.englishName);
}

function knowledgePointOptions(input: Pick<StoryPromptContext, "selectedKnowledgePoints">) {
  return (input.selectedKnowledgePoints ?? []).map((point, index) => ({
    key: `KP${index + 1}`,
    label: point.label,
    category: point.category,
    id: point.id,
  }));
}

function normalizeKnowledgePointSummary(summary: unknown, options: ReturnType<typeof knowledgePointOptions>) {
  return options.reduce((text, option) => text.replace(new RegExp(`\\b${option.key}\\b`, "gi"), () => option.label), stringValue(summary));
}

function directionForPrompt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const direction = value as Record<string, unknown>;
  return Object.fromEntries(
    ["title", "hook", "storyHighlight", "growthCore", "mainCharacters", "whyFits"]
      .filter((key) => direction[key] !== undefined)
      .map((key) => [key, direction[key]]),
  );
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
    ...(input.storyMode ? [`故事模式：${input.storyMode}`, `课堂人物参与方式：${input.classroomPresence ?? (input.storyMode === "faithful" ? "observer" : "participant")}`] : []),
    "</course_context>",
    "<conversation_history>",
    JSON.stringify(input.conversationHistory),
    "</conversation_history>",
    "<current_state>",
    `已选择故事方向：${JSON.stringify(directionForPrompt(input.selectedDirection))}`,
    `当前未选择的故事方向：${JSON.stringify((input.currentDirections ?? []).map(directionForPrompt))}`,
    `已保存参考资料：${JSON.stringify(input.references)}`,
    `当前故事大纲：${JSON.stringify(input.currentOutline)}`,
    "</current_state>",
  ];
}

type AlignmentDecision = {
  status: "needs_clarification" | "ready_for_confirmation";
  planningMode: "explore_options" | "follow_defined_plot";
  storyMode: "faithful" | "new_story";
  classroomPresence: "observer" | "participant" | "absent";
  assistantMessage: string;
  resolvedUnderstanding: string[];
  unresolvedIssues: string[];
  questions: StoryAlignmentQuestion[];
  summary?: string;
};

const classroomParticipationRules = [
  "除非老师明确排除，Step 1 中的老师和所有学生默认全部参与故事；不得遗漏课堂人物，也不得默认只选择一名学生。",
  "课堂人物的具体进入方式由故事剧情决定，不把进入方式当作需求澄清问题。",
];

function classroomGenerationRules(input: Pick<StoryPromptContext, "storyMode" | "classroomPresence">) {
  const storyMode = input.storyMode ?? "new_story";
  const presence = input.classroomPresence ?? (storyMode === "faithful" ? "observer" : "participant");
  if (presence === "absent") {
    return ["老师已明确要求课堂人物不进入故事。不得把老师或学生写入 characters、章节事件或正文。"];
  }
  if (storyMode === "faithful") {
    return [
      "这是忠实讲述。严格保留原作或史实的关键事件、因果、转折和结局；课堂人物只能作为旁观者进入场景。",
      "除非老师明确排除，Step 1 中的老师和所有学生都要进入 characters，并在章节中有清楚可见的观察、记录、见证或彼此交流。",
      "课堂人物可以观察、记录、见证并在彼此之间交流，但不得提供关键物品、提醒、建议或帮助，不得被原作或历史人物依赖，也不得成为任何原事件发生、改变或解决的原因。",
      "课堂人物的贡献来自观察视角、场景串联和适龄理解，不要求他们改变局面。人物传记同样不得虚构课堂人物影响真实人物的决定或历史结果。",
    ];
  }
  return [
    ...classroomParticipationRules,
    "这是新故事。课堂人物作为参与者进入故事并承担明确、不可互换的剧情功能；不要求平均戏份，但在完整故事范围内，每个人至少有一次改变局面的有效行动。老师不能代替学生解决核心问题。",
  ];
}

const confirmedReferenceRules = [
  "只使用与当前创作直接相关且能够确认的背景信息，不猜测细节，不混合不同版本。",
  "背景资料用于提供事实和改编边界，不得覆盖老师已经确认的创作要求。",
];

const teacherFacingReplyRules = [
  "面向老师的回复只说明已确认结果、真正缺少的信息和下一步可执行动作，不播报内部分析过程。",
  "面向老师的回复不得出现模型、Prompt、JSON、调用、知识库或能力限制等内部术语。",
];

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
    const optionId = stringValue(option.id) || stringValue(option.value);
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
  const recommendationReason = stringValue(source.recommendationReason) || stringValue(recommendationSource?.reason);
  const requestedRecommendedId = stringValue(source.recommendedOptionId) || recommendationValue;
  const recommendedOption = options?.find((option) => option.id === requestedRecommendedId || option.label === requestedRecommendedId);
  const orderedOptions = recommendedOption
    ? [recommendedOption, ...(options ?? []).filter((option) => option.id !== recommendedOption.id)]
    : options;
  return {
    id,
    label,
    ...(stringValue(source.reason) ? { reason: stringValue(source.reason) } : {}),
    required: source.required !== false,
    answerMode,
    ...(orderedOptions?.length ? { options: orderedOptions } : {}),
    allowCustom: source.allowCustom !== false,
    ...(recommendedOption && recommendationReason ? {
      recommendedOptionId: recommendedOption.id,
      recommendationReason,
    } : {}),
  };
}

function normalizeRecommendedSummary(
  value: string,
  planningMode: AlignmentDecision["planningMode"],
  replyContext: "initial" | "requirement_change" = "initial",
  needsBackgroundRefresh = true,
) {
  let summary = value.trim()
    .replace(/^已(?:确认|确定)(?:将|为)?\s*/u, "")
    .replace(/^(?:建议按这个方向创作|我理解你的创作需求是|我理解你想将创作需求调整为)[：:]\s*/u, "")
    .replace(/当前不(?:再|继续)?追问[^。！？；，,]*[；，,]?\s*/gu, "")
    .replace(/(?:因此|所以|接下来)?确认后，我会准备\s*(?:3\s*个不同的故事方向|故事大纲)；如需背景资料，会先整理必要内容[。！？]?/gu, "")
    .replace(/(?:下一步先提供|确认后，我会提供)\s*3\s*个(?:候选|不同)?故事方向(?:供(?:您|你)选择)?[。！？]?/gu, "")
    .replace(/确认后，我会根据这条主线生成故事大纲[。！？]?/gu, "")
    .replace(/确认后，我会按新的创作需求继续[^。！？]*[。！？]?/gu, "")
    .replace(/由于故事背景发生变化，可能会重新整理背景资料[。！？]?/gu, "")
    .replace(/。{2,}/gu, "。");
  summary = summary.replace(/^[：:；;，,\s]+/u, "");
  summary = summary.replace(/[；;，,\s]*$/u, "").replace(/[。！？\s]*$/u, "");
  const prefix = replyContext === "requirement_change" ? "我理解你想将创作需求调整为：" : "我理解你的创作需求是：";
  const nextStep = replyContext === "requirement_change"
    ? needsBackgroundRefresh
      ? "确认后，我会按新的创作需求继续。由于故事背景发生变化，可能会重新整理背景资料。"
      : "确认后，我会按新的创作需求继续，并沿用现有背景资料。"
    : planningMode === "follow_defined_plot"
      ? "确认后，我会准备故事大纲；如需背景资料，会先整理必要内容。"
      : "确认后，我会准备 3 个不同的故事方向；如需背景资料，会先整理必要内容。";
  return `${prefix}${summary}。${nextStep}`;
}

function parseAlignmentDecision(
  text: string,
  input: Pick<StoryPromptContext, "onFormatRepair"> & { replyContext?: "initial" | "requirement_change"; needsBackgroundRefresh?: boolean },
): AlignmentDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJson<Record<string, unknown>>(text, "故事需求对齐内容不是有效 JSON");
  } catch (error) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_JSON",
      "AI 返回的需求对齐内容不是有效 JSON，自动修复后仍未通过。",
      { cause: error },
    );
  }
  if (
    (parsed.status !== "ready_for_confirmation" && parsed.status !== "needs_clarification")
    || (parsed.planningMode !== "follow_defined_plot" && parsed.planningMode !== "explore_options")
    || (parsed.storyMode !== "faithful" && parsed.storyMode !== "new_story")
    || (parsed.classroomPresence !== "observer" && parsed.classroomPresence !== "participant" && parsed.classroomPresence !== "absent")
    || (parsed.storyMode === "faithful" && parsed.classroomPresence === "participant")
  ) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  const status = parsed.status;
  const normalizedQuestions = Array.isArray(parsed.questions) ? parsed.questions.map(normalizeAlignmentQuestion).filter((item): item is StoryAlignmentQuestion => Boolean(item)) : [];
  const questionIds = new Set<string>();
  const questions = normalizedQuestions.map((question, index) => {
    if (!questionIds.has(question.id)) {
      questionIds.add(question.id);
      return question;
    }
    const uniqueId = `${question.id}-${index + 1}`;
    questionIds.add(uniqueId);
    return { ...question, id: uniqueId };
  });
  const result: AlignmentDecision = {
    status,
    planningMode: parsed.planningMode,
    storyMode: parsed.storyMode,
    classroomPresence: parsed.classroomPresence,
    assistantMessage: stringValue(parsed.assistantMessage) || (status === "ready_for_confirmation" ? "我已经整理好创作理解，请确认。" : "还需要确认几个会影响故事方向的问题。"),
    resolvedUnderstanding: stringArray(parsed.resolvedUnderstanding),
    unresolvedIssues: stringArray(parsed.unresolvedIssues),
    questions,
    ...(stringValue(parsed.summary) ? { summary: normalizeRecommendedSummary(
      stringValue(parsed.summary),
      parsed.planningMode,
      input.replyContext,
      input.needsBackgroundRefresh,
    ) } : {}),
  };
  if (status === "ready_for_confirmation" && (!result.summary || result.unresolvedIssues.length || result.questions.length)) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  if (status === "needs_clarification" && !result.questions.length) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  return result;
}

export function createStoryOutlineGenerationDeps() {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider());
  return {
    alignRequirements: async (input: StoryPromptContext & { task: string; replyContext?: "initial" | "requirement_change"; needsBackgroundRefresh?: boolean }): Promise<AlignmentDecision> => {
      let { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_align_requirements",
        prompt: [
          "你是一名资深儿童故事策划编辑，擅长通过精准追问，把教师零散、模糊或有歧义的想法整理成清晰、可执行的故事创作意图。",
          "你当前只负责理解和确认创作需求：不创作故事方向，不生成故事大纲，不查找或整理背景资料，也不替老师补充会改变故事本质的关键意图。",
          "需求对齐的目标不是帮助老师补完整个故事，而是确认故事的大方向和不可误解的边界。",
          "核心判断：如果当前信息存在两种或以上合理理解，并且不同理解会产生本质不同的故事，就必须继续提问；可以安全交给后续三个故事方向探索的内容不需要提问。",
          "老师可以只提供人物、IP、主题或粗略想法。不要要求老师提前确定主角目标、核心冲突、关键事件、奇幻机制或结局；老师没有完整故事想法不是信息缺失，后续系统会生成 3 个候选故事方向供老师选择。",
          ...classroomParticipationRules,
          "把“故事是否忠实”和“课堂人物是否进入”分开判断。storyMode 只能是 faithful 或 new_story；classroomPresence 只能是 observer、participant 或 absent。",
          "忠实讲述原作、真实人物传记或历史事实时使用 faithful + observer：课堂人物默认进入场景旁观，但不能影响原作或史实的关键事件、因果、转折和结局。只有老师明确要求课堂人物不进入时才使用 absent。",
          "原创故事、改编原作、让课堂人物影响事件，或要求改变原作/史实关键因果与结局时使用 new_story + participant。即使保留原作角色、世界观或部分经典情节，只要产生新的行动和因果，也属于新故事。禁止 faithful + participant。",
          "人物传记与真实历史使用同一规则：事实讲述属于 faithful；让课堂人物参与并推动新事件属于 new_story。不要根据课堂人物是否进入来判断故事模式。",
          "后续在 new_story 中根据实际人数自动设计单人、双人或团队行动；在 faithful 中只设计不改变因果的观察、记录、见证和彼此交流。人物身份、相遇方式、任务、冲突、奇幻机制和结局由后续方向与大纲决定，不要向老师追问。",
          "老师明确提及 IP 或作品时，视为希望实际使用其中的原作人物；老师同时提出老师和学生经历新冒险时，默认理解为使用原作世界或核心人物创作新剧情，不追问是复述原作还是新编，也不主动提供只参考主题、氛围或风格的选项。",
          "老师未点名原作人物时，不要求老师列人物名单；后续根据背景资料选择与故事最相关的最小核心角色集合。只有版本歧义、点名人物冲突或其他差异会实质改变故事时，才需要确认。",
          "通常不提问：信息足以生成 3 个明显不同的故事方向时，直接返回 ready_for_confirmation 和整理后的创作理解。只有确实存在会改变故事本质、且无法安全推断的阻断歧义时才提问；通常只问 1 题，两个互相独立的阻断歧义并存时最多问 2 题。",
          "需要提问时，每个问题都必须给出 2-3 个可直接选择的选项，并从这些选项中指定一项具体推荐及简短理由；推荐项作为安全默认答案，老师可以直接确认。除非缺少无法推断的专有名称或版本，不使用纯文本题。每题仍允许自定义输入。",
          "对齐完成后不直接生成故事，返回简短创作理解摘要等待老师确认。摘要须用面向老师的中文明确说明是忠实讲述还是新故事，以及课堂人物是旁观、参与还是不进入；没有具体主线时，说明将通过 3 个候选方向选择，不继续追问剧情细节。",
          input.replyContext === "requirement_change"
            ? "这是一次创作需求修改。summary 只概括修改后的创作理解，不使用“建议”“已确认”“已确定”等措辞；系统会统一添加“我理解你想将创作需求调整为：”和后续资料提示。"
            : "summary 只概括你对老师创作需求的理解，不使用“建议”“已确认”“已确定”等措辞；系统会统一添加“我理解你的创作需求是：”。",
          "老师提到任何作品、IP、真实人物、历史事件、知识主题或其他来源时，summary 必须明确说明该来源在故事中如何使用，不能只写“基于”或“参考”。作品与 IP 需要说明是使用原作世界和核心角色创作新剧情，还是忠实讲述已给出的原剧情；真实人物与历史事件需要说明事实叙事和适龄改编边界；知识主题需要说明知识如何通过故事事件呈现。",
          "summary 不得向老师播报“不继续追问”“正在分析”“系统将处理”等内部流程。需求对齐阶段尚未判断是否需要背景资料，不能承诺确认后立刻展示方向或大纲。planningMode 为 explore_options 时以“确认后，我会准备 3 个不同的故事方向；如需背景资料，会先整理必要内容。”收尾；为 follow_defined_plot 时以“确认后，我会准备故事大纲；如需背景资料，会先整理必要内容。”收尾。",
          "只返回 JSON：{status, planningMode, storyMode, classroomPresence, assistantMessage, resolvedUnderstanding, unresolvedIssues, questions, summary?}。status 只能是 needs_clarification 或 ready_for_confirmation；planningMode 只能是 explore_options 或 follow_defined_plot；storyMode 只能是 faithful 或 new_story；classroomPresence 只能是 observer、participant 或 absent。",
          "questions 每项字段为 id, label, reason?, required, answerMode, options?, allowCustom, recommendedOptionId?, recommendationReason?。answerMode 只能是 single_choice, multi_choice, text。选择题的 options 必须是 2-3 个 {id,label} 对象，id 是稳定内部值，label 是面向老师的中文文案；recommendedOptionId 必须等于某个 options.id，recommendationReason 必须说明推荐原因。",
          "ready_for_confirmation 时 unresolvedIssues 和 questions 必须为空且 summary 非空；needs_clarification 时至少返回一个问题。不要使用模型、Prompt、JSON、调用等技术词。",
          ...teacherFacingReplyRules,
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      for (let round = 0; round <= 1; round += 1) {
        try {
          return parseAlignmentDecision(text, input);
        } catch (error) {
          if (!(error instanceof StoryAlignmentResponseError)) throw error;
          devAiLog({
            operation: "story_align_requirements",
            phase: "error",
            payload: { stage: "schema_parse", round: round + 1, rawOutput: text },
            error,
          });
          if (round === 1) throw error;
          await input.onFormatRepair?.();
          const repaired = await client().generateOutline({
            writingProvider: "quickrouter_gpt",
            operation: "story_align_requirements_repair_format",
            prompt: [
              "只修复 JSON 或结构格式，不重新理解、补充或改写老师的需求。",
              "不得改变任何人物、故事来源、创作模式、问题、选项、推荐项或推荐理由的语义；只允许移除额外说明、补齐协议字段并输出严格 JSON。",
              "expectedSchema: {status:'needs_clarification'|'ready_for_confirmation',planningMode:'explore_options'|'follow_defined_plot',storyMode:'faithful'|'new_story',classroomPresence:'observer'|'participant'|'absent',assistantMessage:string,resolvedUnderstanding:string[],unresolvedIssues:string[],questions:array,summary?:string}",
              `parseError: ${error.message}`,
              "<raw_output>",
              text,
              "</raw_output>",
            ].join("\n"),
          });
          text = repaired.text;
        }
      }
      throw new StoryAlignmentResponseError("STORY_ALIGNMENT_INVALID_STRUCTURE", "AI 返回的需求对齐结构不完整，自动修复后仍未通过。");
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
          "老师明确点名的原作角色全部保留。老师未点名原作角色时，最多整理 4 个原作候选角色，只选择足以支持后续方向设计的核心人物；候选角色不代表都会进入最终故事。",
          "内容突出可直接用于故事创作的人物特点、关系、重要事实和世界规则。不确定的信息不能猜测，也不能混合不同版本。",
          ...confirmedReferenceRules,
          "不生成故事方向或故事大纲，不实际执行联网搜索。",
          "external_required 的 reason 会直接展示给老师：只用一句中文具体说明缺少哪项背景信息，不描述你的知识、能力或内部判断。",
          ...teacherFacingReplyRules,
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
    checkChangeBoundary: async (input: StoryPromptContext & { task: string; targetScope: "direction" | "outline" | "chapter" }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_check_change_boundary",
        prompt: [
          "你只判断老师的修改能否在指定范围内完成，不解释新的故事意图，也不改写任何内容。",
          "只有修改会更换故事核心题材、真实或虚构来源、主要人物体系、原作或事实边界时，返回 new_requirement。",
          "忠实讲述中改变原作或史实的关键因果、转折或结局，也必须返回 new_requirement，因为这会切换为新故事；reason 必须具体说明原要求与新修改为什么冲突，供系统先向老师解释冲突并等待确认。",
          "当指定范围是 direction 或 chapter，而修改不更换核心需求、但会改变整体主线、结局或多个章节因果时，返回 outline_revision，并用 reason 说明为什么需要调整整体大纲。指定范围是 outline 时不要返回 outline_revision。",
          "调整情节、难度、氛围、冲突、结局表达或指定范围内的事件，且不触碰忠实讲述边界时，返回 within_target。不要因为修改幅度较大就误判为新需求。",
          "如果返回 new_requirement，同时判断修改后的创作是否仍可完整沿用当前已保存参考资料。只有新增或更换作品、人物、历史事实、知识对象、版本或原作边界时，needsBackgroundRefresh 才为 true；只改变剧情走向、冲突、任务、反派、能力用法、地点、结局或师生参与方式时为 false。",
          "只返回 JSON：范围内修改为 {scope:'within_target',needsBackgroundRefresh:false}；需调整整体大纲为 {scope:'outline_revision',reason,needsBackgroundRefresh:false}；核心需求变化为 {scope:'new_requirement',reason,needsBackgroundRefresh}。reason 用一句中文说明变化和影响。",
          `指定修改范围：${input.targetScope}`,
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Record<string, unknown>>(text, "修改范围判断失败，请重试");
      if (parsed.scope === "new_requirement") {
        return { scope: "new_requirement" as const, reason: stringValue(parsed.reason) || "这项修改会更换故事的核心创作需求。", needsBackgroundRefresh: parsed.needsBackgroundRefresh !== false };
      }
      if (parsed.scope === "outline_revision") {
        return { scope: "outline_revision" as const, reason: stringValue(parsed.reason) || "这项修改会影响整体主线，需要调整完整大纲。", needsBackgroundRefresh: false as const };
      }
      return { scope: "within_target" as const, needsBackgroundRefresh: false as const };
    },
    generateDirections: async (input: StoryPromptContext & { task: string }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_generate_directions",
        prompt: [
          "你是一名富有想象力的儿童故事创意总监，擅长把已经确认的创作需求发展成新奇、有吸引力且适合学生的故事构想。只生成 3 个可供老师选择的故事方向，不展开章节大纲。",
          "只返回包含 3 项的 JSON 数组；每项字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits，所有内容使用中文。",
          "方向卡用于帮助老师快速判断故事主线，不是压缩版完整大纲。hook 使用 4–6 个简短、连贯的句子，每句话只承担一个信息任务，依次说明：故事如何开始；角色必须完成的核心任务和失败后果；最主要的阻碍或特殊规则；角色准备采用的核心解决思路。不要在 hook 中展开逐章过程、完整结局或所有支线。老师只阅读 hook，也应该能复述“发生了什么、要完成什么、难在哪里、准备怎么解决”。",
          "使用具体人物、地点、物品和动作，并保持人物所在位置和行动对象清楚。任何新出现的魔法物品、特殊规则或原创概念，第一次出现时必须说明它是什么、原本有什么作用、为什么会影响当前任务；解决方法必须利用前面已经说明的信息或规则。禁止使用“一场奇妙冒险即将开始”“经历挑战”“收获成长”等空泛表述代替剧情。",
          "hook 只保留一条清楚的因果主线。多人或群像故事不要逐个罗列同时发生的角色动作，只概括团队的核心分工，详细分工留给章节大纲；不要使用“几位角色做 A、另一些角色做 B”这类难以追踪的并列清单。核心问题必须通过角色前面采取的行动、获得的信息或作出的选择解决，不能使用“角色理解了友谊、勇气或合作的意义，因此问题自动解决”作为结局机制。",
          "storyHighlight 用一句话说明最有辨识度且真正影响剧情的设定、人物关系、冲突、视角、选择或结构，不强制使用奇幻规则。growthCore 说明角色原先如何理解或应对问题，以及故事后可能发生什么变化，不使用心理学术语或抽象品质口号。whyFits 只说明该方向为什么符合老师要求，不重复 hook。",
          "完整保留老师明确指定的故事类型、人物或角色、学生参与方式和已确认资料边界；不得用自行新增角色替换老师点名的角色。老师明确排除某位课堂人物时必须遵守。",
          ...classroomGenerationRules(input),
          ...confirmedReferenceRules,
          "使用已有作品但老师未点名具体原作人物时，根据已确认参考资料选择与新剧情最相关的最小核心角色集合，每个方向默认最多选择 2 个原作角色；只有缺少第 3 个角色就无法成立核心冲突时才允许增加。老师明确点名的原作角色全部保留，不受默认上限影响；老师和学生不计入这个原作角色上限。",
          "老师选择“创作新剧情”时才设计新的故事主线；老师选择“按原剧情讲”时不得生成方向，应由流程判断直接进入大纲。当前存在未选择方向且老师提出新要求时，3 个新方向必须明显落实最新反馈并替换旧方向。",
          "mainCharacters 只列具体且需要保持视觉一致性的角色。机构、团队和背景群体只能写进 hook，不得作为主要角色；参考资料提到某个实体不等于它必须成为角色。",
          "老师要求冒险时，设计任务、旅程、挑战、选择和行动；只有老师明确要求时才使用调查、推理或解谜主线。",
          "3 个方向必须在故事目标、冲突来源、角色关系、世界运作方式或行动路径上形成本质差异，而不是只更换地点、道具或配角。先保证故事有趣、意外且因果连贯，再考虑课堂价值。",
          "输出前自行检查：hook 是否只有一条清楚的因果主线；每句话是否只承担一个信息任务；人物位置是否可判断；解决思路是否来自前面已经说明的信息或规则；不了解创作过程的老师能否快速复述这个方向。不要输出检查过程。",
          ...contextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<Array<{
        title: string;
        hook: string;
        storyHighlight: string;
        growthCore: string;
        whyFits: string;
        mainCharacters: string[];
      }>>(text, "故事方向解析失败，请重试");
      return parsed.map((direction) => ({
        ...direction,
        classroomValue: "",
        seedPrompt: direction.hook,
      }));
    },
    reviseDirection: async (input: StoryPromptContext & { task: string; direction: unknown }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_direction",
        prompt: [
          "你是一名富有想象力的儿童故事创意总监。根据老师最新要求，只调整指定的一张故事方向卡。",
          "必须保留老师没有要求改变的内容，并继续遵守已确认需求和背景资料。不要修改其他方向，不生成章节大纲。",
          "返回一份完整新版 JSON，字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits，不返回修改说明。",
          "方向卡用于快速判断主线，不是压缩版完整大纲。新版 hook 使用 4–6 个简短、连贯的句子，每句话只承担一个信息任务，分别讲清起因、核心任务与失败后果、主要阻碍或规则、核心解决思路；不展开逐章过程或完整结局。多人故事只概括团队的核心分工，不逐个罗列同时发生的动作，详细分工留给章节大纲。修改某个设定时必须同步检查它对后续事件和解决方式的影响，不能只替换名词后保留不成立的因果。",
          "不得新增未解释的魔法物品、特殊规则或抽象概念。核心问题必须通过角色行动、前面获得的信息或选择解决，不能通过突然领悟主题自动解决。storyHighlight 说明真正影响剧情的故事亮点；growthCore 描述角色通过具体经历发生的变化。",
          ...classroomGenerationRules(input),
          ...contextPrompt(input),
          "<target_direction>",
          JSON.stringify(directionForPrompt(input.direction)),
          "</target_direction>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<{
        title: string;
        hook: string;
        storyHighlight: string;
        growthCore: string;
        mainCharacters: string[];
        whyFits: string;
      }>(text, "故事方向修改失败，请重试");
      return {
        ...parsed,
        classroomValue: stringValue((input.direction as { classroomValue?: unknown }).classroomValue),
        seedPrompt: parsed.hook,
      };
    },
    reviseChapter: async (input: StoryPromptContext & { task: string; chapterOrder: number }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_chapter",
        prompt: [
          "你是一名资深儿童故事主编，只修改老师指定的一章故事大纲。",
          "不得改变故事标题、整体主线、角色名单、其他章节及章节数量。修改必须承接上一章并能自然推动下一章；如果老师的要求无法在不影响这些内容的情况下完成，返回 {status:'requires_outline_revision',reason}。",
          "可以修改本章标题、剧情概述、出场角色和知识点建议。只返回 JSON：成功时 {status:'ready',chapter:{order,title:{zh,en},whatHappens,characterIds,recommendedKnowledgePointKeys,knowledgePointRecommendationSummary}}。",
          "characterIds 只能逐字复制当前大纲角色 id；recommendedKnowledgePointKeys 只能使用全课可选知识点短键。",
          "whatHappens 使用 2–3 个简短句子，只说明本章当前目标或阻碍、一个核心行动和行动结果；修改后只产生一个主要的新状态，不把多人分工、多个转折或后续章节事件压进本章。",
          "修改前检查当前大纲中的人物位置、关键物品归属和已知线索。失踪角色在被找到前不能行动，未取得的物品不能被使用或交付，新规则必须先被发现或验证；修改后必须自然承接上一章，并为下一章提供成立的原因或条件。不得增加万能道具或无关支线。最后一章不需要引出下一章，但必须完成开头建立的同一项核心任务，并使用前文已经建立的信息、行动或规则解决核心问题。",
          "修改知识点建议时仍需从全课分布判断：只推荐与本章表达自然适配且能在同一语境中共存的知识点，不为平均分配强行组合。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。",
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
          knowledgePointRecommendationSummary: normalizeKnowledgePointSummary(chapter.knowledgePointRecommendationSummary, options),
        },
      };
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
          ...confirmedReferenceRules,
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
      storyMode?: "faithful" | "new_story";
      classroomPresence?: "observer" | "participant" | "absent";
      englishLevel?: string;
      durationMinutes?: 30 | 45 | 60;
      selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string }>;
    }) => {
      const referenceOptions = storyReferenceOptions(input.references);
      const referenceByKey = new Map(referenceOptions.map((reference) => [reference.key, reference]));
      const { text } = await client().generateOutline({
        writingProvider: input.writingProvider,
        operation: "story_generate_outline",
        prompt: [
          "你是一名资深儿童故事主编，只负责生成可确认的故事大纲，把老师已经选定的故事方向发展成完整、清楚且富有想象力的章节结构。不重新选择故事，不生成正式课文、练习、教学活动或图片提示。",
          "只返回 JSON 对象，字段为 title, summary, characters, chapters。故事 title 和章节 title 返回中英文双语对象 {zh,en}；英文标题应简洁、自然并忠实对应中文标题。其余面向老师展示的自然语言字段只返回中文。",
          "characters 每项字段为 key, displayName, englishName, sourceType, sourcePersonId?, sourceReferenceKey?, roleInStory；displayName 使用自然中文名，englishName 使用后续英文正文和生图都能稳定复用的自然英文名；key 使用 C1、C2 等响应内稳定短键，sourceType 只能是 person, referenced, original。不要生成视觉描述或是否出图标记。",
          "characters 是后续视觉资产名单，不是所有被故事提到的实体清单。只保留具体、持续参与剧情、需要保持视觉一致性的角色；机构、公司、团队、部门、监管方和其他背景群体不得进入 characters，只能在 summary 或章节 whatHappens 中按需提及。参考资料中出现某个实体，不代表它是角色。",
          "外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced，并且 sourceReferenceKey 必须逐字复制已保存参考资料中的 Rxx key；同一份组合资料可以由多个角色共同引用。原创人物才使用 original，且不得返回 sourceReferenceKey。",
          "如果角色的中文名或英文名已经出现在已保存参考资料中，该角色绝不能标记为 original，必须标记为 referenced 并返回对应 sourceReferenceKey。",
          "referenced 角色的 englishName 必须使用老师输入和参考资料能够确认的官方或通行英文名，不得把中文名临时直译成新的英文名。",
          "roleInStory 说明角色在本故事中的目标、剧情作用和必要关系，不写人物百科或空泛性格标签。课堂人物只能复用人物快照，不编造外貌、性格或背景；进入 characters 时 sourcePersonId、displayName 和 englishName 必须逐字复制对应人物快照。",
          "除忠实模式中的课堂旁观者外，老师点名且要求出场的角色必须通过行动推动故事；每个角色都必须服务核心叙事，AI 自行新增的原创角色最多 1 个，群像要求除外。",
          "引用角色只保留已选故事方向实际使用的引用角色；参考资料中的其他候选角色不得自动进入 characters。老师明确点名且要求出场的引用角色仍须全部保留。",
          "chapters 每项字段为 order, title:{zh,en}, whatHappens, characterKeys, recommendedKnowledgePointKeys, knowledgePointRecommendationSummary；characterKeys 只能引用 characters 中的 key。章节数量必须等于指定章节数。",
          "summary 使用 3–4 个简短句子，只概括：初始问题与核心任务；主要阻碍或特殊规则；关键转折与核心解决思路；最终任务状态。不要罗列逐章事件、同步动作或角色分组，不要逐句复述已选方向的 hook。老师读完后应能快速复述主线，但不需要从 summary 了解每一步执行细节。",
          "忠实保留已选方向的主要剧情、storyHighlight、growthCore 和核心角色。生成章节前，先在内部建立连续状态：每名角色当前所在位置、关键物品由谁持有或位于哪里、角色已经知道哪些线索、核心任务完成到什么程度；不要输出状态表。",
          "故事亮点必须贯穿并推动主要剧情。角色成长通过面对处境、作出有意义的选择并承担结果体现，不用旁白宣布品质，也不套用固定的失败—合作—成功结构。想象力必须服务剧情，不能随机堆叠。",
          "每章 whatHappens 使用 2–3 个简短句子，依次说明当前目标或阻碍、角色采取的一个核心行动、行动造成的结果。每章结束时只产生一个主要的新状态，并让这个结果成为下一章成立的前提；不要在一句话里同时塞入起因、多人分工、阻碍、转折和结果。大纲只规定核心事件，不写正式对话、环境描写或逐句课文。",
          "严格保持章节状态连续：下一章开头必须承接上一章结尾。失踪角色在被找到前不能参与团队行动；关键物品在被找到或取得前不能被保护、使用或交付；人物不能在没有移动或被救出的事件时突然换到另一地点；新能力、线索或规则必须先被发现或验证，之后才能用于解决问题。",
          "第一章建立具体事件和核心任务；中间章节每章只升级一次困难、改变一次计划或确认一条关键线索；最后一章使用前文已经建立的行动、信息、关系或规则解决核心问题。最终结果必须完成开头建立的同一项核心任务，受益人、物品去向和目的地不得在结尾被替换。不能突然出现新的解决工具。",
          "角色行动分散到完整大纲，不在 summary 或同一章集中点名所有角色。多人团队可以共享目标，但每章只突出对本次状态变化必要的角色；未在本章产生必要行动的角色不需要写入 whatHappens，但仍可通过 characterKeys 标记在场。",
          "角色成长必须通过行动、选择和结果表现，不能使用“理解友谊、勇气或合作”代替实际剧情，也不能让角色突然领悟主题后问题自动解决。",
          "先完成全部章节剧情，再从全课视角统一规划知识点分布。每章至少推荐 1 个知识点；recommendedKnowledgePointKeys 只能逐字复制“全课可选知识点”中的 key（例如 KP1），不要返回数据库 id、知识点名称或自行创造 key。",
          "知识点分布优先考虑本章表达适配性、同章知识点能否在同一语境中自然共存、英语难度与课程时长承载能力，再尽量覆盖老师选择的多样知识点；不得为了平均分配强行组合。不合适或密度过高的知识点可以不推荐。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。不要生成词数、题型或题量。",
          "需求优先级从高到低为：老师历史中明确要求；已选择方向；已确认参考资料；当前大纲；通用创作建议。低优先级内容不得覆盖高优先级要求。",
          ...classroomGenerationRules(input),
          ...confirmedReferenceRules,
          "根据人物年龄、老师要求、引用对象、故事模式和课堂人物参与方式选择合适的叙事结构与主角。课堂人物进入 characters 时，sourcePersonId 必须准确对应人物快照。",
          "保持老师明确指定的故事类型。冒险故事以任务、旅程、挑战、选择和行动推进；只有老师明确要求解谜、侦探、调查、线索或推理时，才使用相应主线。返回前自行检查章节因果、故事亮点是否贯穿、成长是否通过选择与结果表现，但不要输出检查过程。",
          ...contextPrompt({
            ...input,
            references: referenceOptions.map((reference) => ({
              key: reference.key,
              name: reference.name,
              type: reference.type,
              summary: reference.summary,
              usableFacts: reference.usableFacts,
              adaptationBoundary: reference.adaptationBoundary,
            })),
            currentOutline: input.currentOutline ?? null,
          }),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<{
        title: string | { zh: string; en: string };
        summary: string | { zh: string; en: string };
        storyHook?: string;
        characters: Array<{
          key: string;
          displayName: string;
          englishName: string;
          sourceType: "person" | "referenced" | "original";
          sourcePersonId?: string | null;
          sourceReferenceKey?: string | null;
          roleInStory: string;
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
      const characterKeys = parsed.characters.map((character) => character.key?.trim()).filter(Boolean);
      if (characterKeys.length !== parsed.characters.length || new Set(characterKeys).size !== characterKeys.length) {
        throw new Error("故事大纲角色 key 缺失或重复");
      }
      const knownCharacterKeys = new Set(characterKeys);
      for (const chapter of parsed.chapters) {
        const chapterKeys = chapter.characterKeys ?? [];
        if (new Set(chapterKeys).size !== chapterKeys.length || chapterKeys.some((key) => !knownCharacterKeys.has(key))) {
          throw new Error(`第 ${chapter.order} 章包含重复或未知角色 key`);
        }
      }
      return {
        ...parsed,
        title: bilingualChapterTitle(parsed.title),
        summary: bilingualText(parsed.summary),
        characters: parsed.characters.map((character, index) => {
          const person = character.sourcePersonId
            ? input.coursePeople.find((candidate) => candidate.personId === character.sourcePersonId)
            : null;
          if (character.sourceType === "person" && !person) {
            throw new Error(`人物档案角色 ${character.displayName || character.key || index + 1} 缺少有效 sourcePersonId`);
          }
          const explicitReference = character.sourceReferenceKey
            ? referenceByKey.get(character.sourceReferenceKey)
            : null;
          const recordedReferences = referenceOptions.filter((candidate) => referenceMentionsCharacter(candidate, character));
          if (character.sourceType === "original" && recordedReferences.length > 1) {
            throw new Error(`角色 ${character.displayName || character.key || index + 1} 同时匹配多份参考资料，无法自动确定引用关系`);
          }
          const inferredReference = character.sourceType === "original" ? recordedReferences[0] ?? null : null;
          const sourceType = inferredReference ? "referenced" as const : character.sourceType;
          const reference = explicitReference ?? inferredReference;
          if (sourceType === "referenced" && !reference) {
            throw new Error(`引用角色 ${character.displayName || character.key || index + 1} 缺少有效 sourceReferenceKey`);
          }
          const englishName = person?.englishName ?? character.englishName?.trim();
          if (!englishName) throw new Error(`角色 ${character.displayName || character.key || index + 1} 缺少英文名`);
          return {
            key: character.key || `C${index + 1}`,
            displayName: person?.chineseName ?? character.displayName,
            englishName,
            sourceType,
            sourcePersonId: sourceType === "person" ? person!.personId : null,
            sourceReferenceId: sourceType === "referenced" ? reference!.id : null,
            roleInStory: character.roleInStory,
            shortDescription: character.roleInStory,
            shouldAppearInImages: true,
          };
        }),
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
          knowledgePointRecommendationSummary: normalizeKnowledgePointSummary(chapter.knowledgePointRecommendationSummary, options),
        })),
      };
    },
  };
}
