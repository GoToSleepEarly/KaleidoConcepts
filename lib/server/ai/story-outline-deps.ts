import type {
  CourseResearchPlan,
  CourseSourceReferenceType,
  CourseSourceStatus,
  StoryAlignmentQuestion,
  StoryMainlineCard,
  StoryRequirementBrief,
  StoryComplexity,
  StoryWritingProvider,
  EnglishLevel,
} from "@/lib/contracts/api";
import { chineseTextLength, defaultStoryComplexity, storyLengthPolicy, type StoryLengthPolicy } from "@/lib/domain/story-length-policy";

import { devAiLog } from "./dev-ai-log";
import { createStoryOutlineProvider } from "./story-outline-provider";
import type { AiProviderSettingsInput } from "@/lib/ai-gateway";

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

export class StoryOutlineResponseError extends Error {
  readonly status = 502;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StoryOutlineResponseError";
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

function bilingualText(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const source = value as { zh?: unknown; en?: unknown };
  return stringValue(source.zh) || stringValue(source.en);
}

function bilingualChapterTitle(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const source = value as { zh?: unknown; en?: unknown };
  const zh = stringValue(source.zh);
  const en = stringValue(source.en);
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
  /** Legacy request compatibility only. Intentionally excluded from every prompt and length rule. */
  durationMinutes?: 30 | 45 | 60;
  storyComplexity?: StoryComplexity;
  lengthPolicy?: StoryLengthPolicy;
  selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string; bookTitle?: string; edition?: string; officialLevel?: string; unitStart?: number; unitEnd?: number; units?: Array<{ unitNumber: number; officialTitle: string }> }>;
  confirmedRequirement?: string;
  requirementBrief?: StoryRequirementBrief;
  storyMode?: "faithful" | "new_story";
  classroomPresence?: "observer" | "participant" | "absent";
  requiredNamedCharacters?: string[];
  mainlineCard?: StoryMainlineCard;
  onFormatRepair?: () => Promise<void>;
};

function resolvedStoryPolicy(input: Pick<StoryPromptContext, "englishLevel" | "storyComplexity" | "lengthPolicy" | "chapterCount">) {
  if (input.lengthPolicy) return input.lengthPolicy;
  const level = (input.englishLevel ?? "A2") as EnglishLevel;
  return storyLengthPolicy(level, input.storyComplexity ?? defaultStoryComplexity(level), input.chapterCount);
}

function enforceChineseGenerationMax(value: string, generationMax: number, label: string) {
  const actualLength = chineseTextLength(value);
  if (actualLength > generationMax) {
    throw new StoryOutlineResponseError(`${label}超过 ${generationMax} 字生成上限（实际 ${actualLength} 字），请重试本步`);
  }
}

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
    bookTitle: point.bookTitle,
    edition: point.edition,
    officialLevel: point.officialLevel,
    unitStart: point.unitStart,
    unitEnd: point.unitEnd,
    sourceUnits: point.units,
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

function directionReferenceForPrompt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const reference = value as Record<string, unknown>;
  return Object.fromEntries(
    ["name", "type", "summary", "usableFacts", "adaptationBoundary"]
      .filter((key) => reference[key] !== undefined)
      .map((key) => [key, reference[key]]),
  );
}

function generationLengthForPrompt(policy: StoryLengthPolicy) {
  return {
    chapterTargetWords: policy.english.chapterTargetWords,
    generationRange: policy.english.generationRange,
  };
}

function requirementForPrompt(input: Pick<StoryPromptContext, "requirementBrief" | "confirmedRequirement">) {
  if (input.requirementBrief) {
    return ["<requirement_brief>", JSON.stringify(input.requirementBrief), "</requirement_brief>"];
  }
  return input.confirmedRequirement ? [`已确认创作理解：${input.confirmedRequirement}`] : [];
}

function directionContextPrompt(input: StoryPromptContext) {
  const policy = resolvedStoryPolicy(input);
  const peopleSnapshots = input.coursePeople.map(({ personId, role, chineseName, englishName, age, gender }) => ({
    personId,
    role,
    chineseName,
    englishName,
    age,
    gender,
  }));
  const latestTeacherMessage = [...input.conversationHistory].reverse().find((message) => message.role === "teacher");
  return [
    "<course_context>",
    `故事容量：${input.chapterCount} 章；故事复杂度：${policy.storyComplexity}；每章英文正文容量：${JSON.stringify(generationLengthForPrompt(policy))}。只设计一条能在该容量内讲清的核心主线。`,
    `中文篇幅：方向概要推荐不超过 ${policy.chinese.directionOverview.recommendedMax} 字，硬上限 ${policy.chinese.directionOverview.hardMax} 字；中文没有强制下限，不得为凑长度填充。`,
    `老师和学生人物快照：${JSON.stringify(peopleSnapshots)}`,
    ...requirementForPrompt(input),
    ...(input.requiredNamedCharacters?.length ? [`必须出场的点名角色：${JSON.stringify(input.requiredNamedCharacters)}`] : []),
    ...(input.storyMode ? [`故事模式：${input.storyMode}`, `课堂人物参与方式：${input.classroomPresence ?? (input.storyMode === "faithful" ? "observer" : "participant")}`] : []),
    "</course_context>",
    ...(!input.requirementBrief ? ["<recent_effective_conversation>", JSON.stringify(latestTeacherMessage ? [latestTeacherMessage] : []), "</recent_effective_conversation>"] : []),
    "<confirmed_references>",
    JSON.stringify(input.references.map(directionReferenceForPrompt)),
    "</confirmed_references>",
  ];
}

function contextPrompt(input: StoryPromptContext, options: { includeCurrentDirections?: boolean; includeKnowledgePoints?: boolean } = {}) {
  const policy = resolvedStoryPolicy(input);
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
    ...(input.englishLevel ? [
      `英语难度：${input.englishLevel}`,
      `故事复杂度：${policy.storyComplexity}`,
      `每章英文正文容量：${JSON.stringify(generationLengthForPrompt(policy))}`,
      ...(options.includeKnowledgePoints ? [`全课可选知识点：${JSON.stringify(knowledgePointOptions(input).map((point) => ({ key: point.key, label: point.label, category: point.category })))}`] : []),
    ] : []),
    `老师和学生人物快照：${JSON.stringify(peopleSnapshots)}`,
    ...requirementForPrompt(input),
    ...(input.requiredNamedCharacters?.length ? [`必须出场的点名角色：${JSON.stringify(input.requiredNamedCharacters)}`] : []),
    ...(input.storyMode ? [`故事模式：${input.storyMode}`, `课堂人物参与方式：${input.classroomPresence ?? (input.storyMode === "faithful" ? "observer" : "participant")}`] : []),
    "</course_context>",
    ...(!input.requirementBrief ? ["<conversation_history>", JSON.stringify(input.conversationHistory), "</conversation_history>"] : []),
    "<current_state>",
    `已选择故事方向：${JSON.stringify(directionForPrompt(input.selectedDirection))}`,
    ...(options.includeCurrentDirections ? [`当前未选择的故事方向：${JSON.stringify((input.currentDirections ?? []).map(directionForPrompt))}`] : []),
    `已保存参考资料：${JSON.stringify(input.references)}`,
    `当前故事大纲：${JSON.stringify(input.currentOutline)}`,
    `已确认主线理解卡：${JSON.stringify(input.mainlineCard ?? null)}`,
    "</current_state>",
  ];
}

type AlignmentDecision = {
  status: "needs_clarification" | "ready_for_confirmation";
  planningMode: "explore_options" | "follow_defined_plot";
  storyMode: "faithful" | "new_story";
  classroomPresence: "observer" | "participant" | "absent";
  requiredNamedCharacters: string[];
  provisionalBriefKind?: StoryRequirementBrief["kind"];
  brief?: StoryRequirementBrief;
  assistantMessage: string;
  resolvedUnderstanding: string[];
  unresolvedIssues: string[];
  questions: StoryAlignmentQuestion[];
  summary?: string;
};

function alignmentContextPrompt(input: StoryPromptContext) {
  const people = input.coursePeople.map(({ personId, role, chineseName, englishName, age, gender }) => ({
    personId,
    role,
    chineseName,
    englishName,
    age,
    gender,
  }));
  return [
    "<course_context>",
    `课堂人物：${JSON.stringify(people)}`,
    `指定章节数：${input.chapterCount}`,
    ...(input.englishLevel ? [`英语难度：${input.englishLevel}`] : []),
    "</course_context>",
    "<conversation_history>",
    JSON.stringify(input.conversationHistory),
    "</conversation_history>",
  ];
}

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
      "除非老师明确排除，Step 1 中的老师和所有学生都要进入 characters；他们只观察、记录、见证或彼此交流，不承担推动、解决或改变事件的贡献。",
      "课堂人物不得提供关键物品、提醒、建议或帮助，不得被原作或历史人物依赖，也不得成为任何原事件发生、改变或解决的原因。人物传记同样不得虚构课堂人物影响真实人物的决定或历史结果。",
    ];
  }
  return [
    ...classroomParticipationRules,
    "这是新故事。课堂人物作为参与者进入故事并承担清楚、与共同目标相关的实际参与。默认不要求平均戏份，也不要求每个人单独制造一次状态变化，可以由两三人共同完成一次关键行动；但老师明确要求“每名学生都有高光时刻”或同义要求时，该要求优先，必须让每名学生各有一次能改变局面或帮助团队推进的可辨识行动，同时不必为每人建立独立支线或平均分配篇幅。老师不能代替学生解决核心问题。",
  ];
}

function confirmedReferenceRules(input: Pick<StoryPromptContext, "storyMode">) {
  return [
    "只使用与当前创作直接相关且能够确认的背景信息，不猜测细节，不混合不同版本。",
    input.storyMode === "faithful"
      ? "忠实讲述中，已确认事实、原作事件、因果和结局是最高边界；老师的视角、范围和呈现要求只能在该边界内执行。"
      : "背景资料用于提供事实和改编边界，不得覆盖老师已经确认的创作要求。",
  ];
}

const directionCardBaseRules = [
  "方向卡的最高验收标准：不了解创作过程的老师读一遍后就能用一句话讲清整个故事设计或讲述方案，包括被讲述的对象、核心内容、主要讲述路径，以及这个方向最独特的地方。",
  "方向卡用于快速选择主线，不是营销文案。hook 是老师可快速读懂的故事概要，按最自然的顺序组织，用 2 个短句说明开端、主要发展和结果方向；可以交代结果方向，不以隐藏结果制造悬念。",
  "mainCharacters 完整记录具体角色和需要保持视觉一致性的具名群体，但只能是 JSON 字符串数组，每一项只写一个名称；不得返回对象，不得把已经逐人列出的课堂成员再用“学生队”“师生团队”“英雄战队”等课堂团队称呼作为额外角色重复放入 mainCharacters。这里的具名群体只指外部作品真实存在且老师明确要求的团队。hook 可以使用自然的团队称呼表达共同参与。",
];

function directionCardWritingRules(input: Pick<StoryPromptContext, "storyMode" | "storyComplexity">) {
  const complexityRule = `故事复杂度 ${input.storyComplexity ?? "clear_linear"} 只是结构上限，不要求机械用满；每个方向始终只有一条主要主线，不得为显得复杂而强加受挫、冲突或反转。`;
  if (input.storyMode === "faithful") {
    return [
      ...directionCardBaseRules,
      complexityRule,
      "hook 只概括已经确认的原作或史实内容、当前叙事视角和事实焦点，不给课堂人物创造任务、障碍、解法或改变结局的行动。",
      "storyHighlight 只写这个叙事视角的辨识度。growthCore 是面向老师的“成长与理解”，只选择最自然的一个理解主题，不虚构被讲述人物的心理成长；whyFits 只解释与老师要求和难度的匹配。",
    ];
  }
  return [
    ...directionCardBaseRules,
    complexityRule,
    "每个 hook 只呈现一个决定性故事引擎，让核心问题、主要行动和独特之处彼此直接相关。辅助规则、逐人分工、阶段任务和具体解法由大纲展开。",
    "使用具体人物、地点、动作和清楚的行动对象。方向中的物品、规则或原创概念在首次出现时说明它怎样改变人物行动或核心问题。",
    "storyHighlight 只写真正影响剧情的辨识度，不复述主线。growthCore 是面向老师的“成长与理解”，从自我效能、情绪识别、同理心、合作、成长型思维、边界或独立判断等自然主题中只选最贴合故事的一个；不得说教，也不得为了表达主题强加冲突或反转。whyFits 只解释与老师要求和英语难度的匹配。",
  ];
}

function directionClassroomRules(input: Pick<StoryPromptContext, "storyMode" | "classroomPresence">) {
  const storyMode = input.storyMode ?? "new_story";
  const presence = input.classroomPresence ?? (storyMode === "faithful" ? "observer" : "participant");
  if (presence === "absent") return ["课堂人物按老师要求不进入方向或角色名单。"];
  if (storyMode === "faithful") {
    return ["课堂人物只观察，可以记录、见证或彼此交流，但不承担剧情贡献，不帮助原作或历史人物，也不改变原有事件、因果和结局。"];
  }
  return [
    "课堂人物作为共同参与团队进入每个方向；mainCharacters 完整保留 Step 1 人物，并逐字使用人物快照中的 englishName，hook 及其他方向文案提到课堂人物时也只使用 englishName，不混用中文名。hook 使用自然的团队称呼表达课堂人物共同参与，但课堂团队称呼不能作为额外角色重复放入 mainCharacters。方向阶段呈现团队对核心问题的作用，具体成员分工通常由大纲安排；老师明确要求每名学生都有高光时刻时，方向必须保留这一强约束，不得降级为只有团队整体行动。",
  ];
}

function directionSetDiversityRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return [
      "三个方向只能改变叙事视角、事实焦点或讲述范围，必须保留相同的既定事件、因果、人物行为和结局；不得生成三种不同剧情、任务、冲突或结局。",
      "每个方向用一句独有概括说明它关注哪一段事实或从谁的既定经历切入，差异来自讲述选择，不来自改写事实。",
    ];
  }
  return [
    "生成前先在内部构思多种候选。每个方向都应有一句只能描述自身的核心概括；比较核心问题、主要行动和角色关系，选择差异最大的 3 个，让老师看到三种真正不同的故事可能性。",
    "候选之间的差异优先来自故事本身；原作角色能力、关键道具和世界规则分别承担与当前核心问题直接相关的剧情作用。",
  ];
}

function outlineNarrativeRules(input: Pick<StoryPromptContext, "storyMode" | "storyComplexity">) {
  if (input.storyMode === "faithful") {
    return [
      "写作前只根据已确认资料梳理既定事件、时间顺序、人物关系和可确认因果；资料没有支持的心理动机、对话、冲突、行动或结果不得补写为事实。",
      "章节按真实时间、既定因果或老师确认的讲述范围组织。每章推进的是对既定事件的讲述，不是课堂人物的任务；不得为了制造戏剧性增加障碍、道具、规则、反派或解决方案。",
      "课堂人物只观察，不承担推动、解决或改变事件的贡献。老师即使要求每名学生都有高光，也不能把课堂人物改成历史或原作事件的行动者。",
    ];
  }
  return [
    "写作前在内部明确核心矛盾、事件之间为什么相互导致、每章使局面发生什么变化，以及结局如何由前文自然产生；再自行选择最适合当前故事的叙事结构，不输出内部规划。不要套用固定的“受挫—调整—成功”框架，也不预设行动路径数量、转折次数或计划改变次数。保留会改变人物决定、升级冲突或影响结果的事件；删除不影响后续，或无法在指定章节与英文容量内解释清楚的内容。",
    `故事复杂度 ${input.storyComplexity ?? "clear_linear"} 是结构上限，不要求机械用满：clear_linear 只用一条直接的目标—行动—结果主线；conflict_driven 允许一个核心矛盾、受挫、选择或策略调整；layered 允许复杂动机、信息回收和有铺垫的反转，但仍只有一条主要主线。不得为了达到档位机械增加冲突或反转。`,
    "生成章节时在内部检查连续状态：人物位置、关键物品归属、角色已知信息和核心矛盾进展。下一章必须承接上一章的实际结果，本章结果必须改变下一章成立时的局面；失踪角色在被找到前不能行动，未取得的物品不能使用或交付，新规则必须先被发现或验证。最终结果必须回应开头建立的核心矛盾，结局只能来自前文已经建立的行动、信息、关系或规则，不能突然出现新的解决工具。",
    "角色行动分散到完整大纲，并通过选择和结果体现成长，不在 summary 或单章集中点名所有角色。多人、具名团队或不可分割的群像共享核心矛盾，每章只突出当前事件需要的成员；默认不要求逐人发言、平均戏份，也不要求每名成员拥有独立支线或成长线。老师明确要求“每名学生都有高光时刻”或同义要求时，该要求优先：每名学生都要有一次能改变局面或帮助团队推进的可辨识行动，但仍不需要独立支线、平均篇幅或逐章轮流点名。",
  ];
}

function contentPriorityRules(input: Pick<StoryPromptContext, "storyMode" | "requirementBrief">) {
  if (input.storyMode === "faithful" || input.requirementBrief?.kind === "factual") {
    return ["事实与既定因果优先于故事包装；不得因故事复杂度虚构冲突、动机、反转或结果。信息很多但事件少时，按事实关系清楚组织，不把信息数量伪装成更多事件。"];
  }
  if (input.requirementBrief?.kind === "concept") {
    return ["理论学习目标优先于故事包装；只保留帮助理解和应用概念的事件，复杂度不足时先简化包装，不删减已确认学习目标，也不靠虚构冲突证明概念。"];
  }
  return ["叙事目标优先；故事复杂度只控制结构上限，不改变老师已确认的角色、主线、排除项和硬要求。"];
}

function outlineStoryQualityRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return ["storyHighlight 作为贯穿讲述的事实焦点，不得反向改写事件。不能用未经资料支持的心理成长、道德领悟或戏剧冲突替代真实人物、原作人物的既定经历。"];
  }
  return ["故事亮点必须贯穿并推动主要剧情。想象力必须服务剧情，不能随机堆叠；不能使用“理解友谊、勇气或合作”代替实际剧情，也不能让角色突然领悟主题后问题自动解决。"];
}

function outlineGenreRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return ["保持老师确认的讲述对象、范围和叙事形式，不把人物传记、真实历史或原作复述擅自改写成冒险、解谜、侦探或任务故事。返回前检查每一项因果和结果都有已确认资料支持，但不要输出检查过程。"];
  }
  return ["保持老师明确指定的故事类型。冒险故事以任务、旅程、挑战、选择和行动推进；只有老师明确要求解谜、侦探、调查、线索或推理时，才使用相应主线。返回前自行检查章节因果、故事亮点是否贯穿、成长是否通过选择与结果表现，但不要输出检查过程。"];
}

function chapterRevisionNarrativeRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return [
      "这是忠实讲述的章节修改。whatHappens 使用 1–2 个自然短句，只按已确认资料讲清本章既定事件及其与相邻章节的真实时间或因果关系，不新增或改变事实、原作事件、人物行为、转折或结局。",
      "不得为了增强戏剧性新增地点、物品、规则、线索、任务、障碍或解决方案；资料没有支持的心理动机和对话不能写成事实。",
      "课堂人物只观察、记录、见证或彼此交流，不采访、提醒或帮助原作与历史人物，不承担推动、解决或改变事件的贡献。",
    ];
  }
  return [
    "whatHappens 仍是一个自然的故事段落，使用 1–2 个自然短句，语义完整优先于凑固定句数。自然讲清承接的具体局面、本章必要行动和行动造成的直接结果，不显示结构标签；每句话只表达一个主要事件。本章结果必须改变下一章成立时的局面，但不预设行动数量或转折结构，也不把命令、发现、选择、移动、多人分工和多个转折压进同一句。",
    "本章新增的地点、物品、规则、路线关系或信息必须在首次出现时说明它与当前任务的关系，不能使用只有作者知道所指的模糊位置词。检查相邻章节的动作结构，不得重复同一种“发现信息—重新选择路线—继续前进”或其他相同模板。",
    "修改前检查当前大纲中的人物位置、关键物品归属和已知线索。失踪角色在被找到前不能行动，未取得的物品不能被使用或交付，新规则必须先被发现或验证；修改后必须自然承接上一章，并为下一章提供成立的原因或条件。不得增加万能道具或无关支线。最后一章不需要引出下一章，但必须完成开头建立的同一项核心任务，并使用前文已经建立的信息、行动或规则解决核心问题。",
  ];
}

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

function proseValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  const parts = value.map(stringValue).filter(Boolean);
  return parts.length === value.length ? parts.join(" ") : "";
}

function objectValue(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s._'’·-]+/gu, "");
}

function nameValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  const source = objectValue(value);
  if (!source) return "";
  for (const key of ["englishName", "displayName", "chineseName", "name", "label"]) {
    const candidate = stringValue(source[key]);
    if (candidate) return candidate;
  }
  return "";
}

function uniquePersonByName(coursePeople: CoursePersonPrompt, value: string) {
  const target = normalizedName(value);
  if (!target) return null;
  const matches = coursePeople.filter((person) => [person.chineseName, person.englishName]
    .some((name) => normalizedName(name) === target));
  return matches.length === 1 ? matches[0] : null;
}

function resolveCoursePerson(
  coursePeople: CoursePersonPrompt,
  sourcePersonId: string,
  names: string[],
) {
  const byId = sourcePersonId ? coursePeople.find((person) => person.personId === sourcePersonId) : null;
  if (byId) return byId;
  const matches = [...new Map(names.flatMap((name) => {
    const person = uniquePersonByName(coursePeople, name);
    return person ? [[person.personId, person] as const] : [];
  })).values()];
  return matches.length === 1 ? matches[0] : null;
}

function replaceAllLiteral(value: string, search: string, replacement: string) {
  if (!search || search === replacement) return value;
  return value.split(search).join(replacement);
}

function canonicalizeClassroomNames(value: string, coursePeople: CoursePersonPrompt) {
  return coursePeople
    .flatMap((person) => [person.chineseName, person.englishName]
      .filter((name) => name && name !== person.englishName)
      .map((name) => ({ name, replacement: person.englishName })))
    .sort((left, right) => right.name.length - left.name.length)
    .reduce((text, entry) => replaceAllLiteral(text, entry.name, entry.replacement), value);
}

function isGenericClassroomTeamName(value: string) {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase();
  return /^(?:the\s+)?(?:class|classroom|student|teacher.?student|hero|superhero).*(?:team|group|squad)$/u.test(normalized)
    || /^(?:学生|师生|课堂|超级英雄).*(?:队|团队|战队|小组)$/u.test(normalized);
}

type NormalizedDirection = {
  title: string;
  hook: string;
  storyHighlight: string;
  growthCore: string;
  whyFits: string;
  mainCharacters: string[];
};

function normalizeDirection(value: unknown, coursePeople: CoursePersonPrompt, fallbackMessage: string): NormalizedDirection {
  const source = objectValue(value);
  if (!source) throw new StoryOutlineResponseError(fallbackMessage);
  const title = proseValue(source.title);
  const hook = proseValue(source.hook);
  const storyHighlight = proseValue(source.storyHighlight);
  const growthCore = proseValue(source.growthCore);
  const whyFits = proseValue(source.whyFits);
  if (!title || !hook || !storyHighlight || !growthCore || !whyFits || !Array.isArray(source.mainCharacters)) {
    throw new StoryOutlineResponseError(fallbackMessage);
  }
  const extractedNames = source.mainCharacters.map(nameValue);
  if (extractedNames.some((name) => !name)) throw new StoryOutlineResponseError(fallbackMessage);
  const canonicalNames = extractedNames.map((name) => uniquePersonByName(coursePeople, name)?.englishName || name);
  const hasConcreteClassroomPerson = canonicalNames.some((name) => Boolean(uniquePersonByName(coursePeople, name)));
  const mainCharacters = [...new Map(canonicalNames
    .filter((name) => !(hasConcreteClassroomPerson && isGenericClassroomTeamName(name)))
    .map((name) => [normalizedName(name), name])).values()];
  if (!mainCharacters.length) throw new StoryOutlineResponseError(fallbackMessage);
  return {
    title: canonicalizeClassroomNames(title, coursePeople),
    hook: canonicalizeClassroomNames(hook, coursePeople),
    storyHighlight: canonicalizeClassroomNames(storyHighlight, coursePeople),
    growthCore: canonicalizeClassroomNames(growthCore, coursePeople),
    whyFits: canonicalizeClassroomNames(whyFits, coursePeople),
    mainCharacters,
  };
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
  const rawOptions = Array.isArray(source.options) ? source.options : undefined;
  const options = rawOptions ? rawOptions.flatMap((item) => {
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
  if (rawOptions && options?.length !== rawOptions.length) return null;
  const recommendationReason = stringValue(source.recommendationReason);
  const requestedRecommendedId = stringValue(source.recommendedOptionId);
  const recommendedOption = options?.find((option) => option.id === requestedRecommendedId);
  const orderedOptions = recommendedOption
    ? [recommendedOption, ...(options ?? []).filter((option) => option.id !== recommendedOption.id)]
    : options;
  return {
    id,
    label,
    ...(stringValue(source.impact) ? { impact: stringValue(source.impact) } : {}),
    answerMode,
    ...(orderedOptions?.length ? { options: orderedOptions } : {}),
    allowCustom: source.allowCustom !== false,
    ...(recommendedOption && recommendationReason ? {
      recommendedOptionId: recommendedOption.id,
      recommendationReason,
    } : {}),
  };
}

function normalizeSourceRequirements(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const name = stringValue(source.name);
    const useInCourse = stringValue(source.useInCourse);
    return name && useInCourse ? [{ name, useInCourse }] : [];
  });
}

function normalizeAdditionalConstraints(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    required: stringArray(source.required),
    preferred: stringArray(source.preferred),
    excluded: stringArray(source.excluded),
  };
}

function normalizeRequirementBrief(value: unknown): StoryRequirementBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const sourceRequirements = normalizeSourceRequirements(source.sourceRequirements);
  const additionalConstraints = normalizeAdditionalConstraints(source.additionalConstraints);
  if (source.kind === "narrative") {
    const objective = stringValue(source.objective);
    if (!objective) return null;
    return {
      kind: "narrative",
      objective,
      sourceRequirements,
      requiredNamedCharacters: stringArray(source.requiredNamedCharacters),
      fixedPlot: stringValue(source.fixedPlot) || null,
      additionalConstraints,
    };
  }
  if (source.kind === "concept") {
    const objective = stringValue(source.objective);
    const learningTargets = Array.isArray(source.learningTargets) ? source.learningTargets.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const target = item as Record<string, unknown>;
      const concept = stringValue(target.concept);
      const expectedUnderstanding = stringValue(target.expectedUnderstanding);
      return concept && expectedUnderstanding ? [{ concept, expectedUnderstanding }] : [];
    }) : [];
    if (!objective || !learningTargets.length) return null;
    return {
      kind: "concept",
      objective,
      learningTargets,
      assumedPriorKnowledge: stringArray(source.assumedPriorKnowledge),
      sourceRequirements,
      requiredNamedCharacters: stringArray(source.requiredNamedCharacters),
      fixedPlot: stringValue(source.fixedPlot) || null,
      additionalConstraints,
    };
  }
  if (source.kind === "factual") {
    const subjects = Array.isArray(source.subjects) ? source.subjects.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const subject = item as Record<string, unknown>;
      const name = stringValue(subject.name);
      const kind: "person" | "event" | "topic" | null = subject.kind === "person" || subject.kind === "event" || subject.kind === "topic" ? subject.kind : null;
      return name && kind ? [{ name, kind }] : [];
    }) : [];
    const factualFocus = stringValue(source.factualFocus);
    if (!subjects.length || !factualFocus) return null;
    return { kind: "factual", subjects, factualFocus, sourceRequirements, additionalConstraints };
  }
  return null;
}

function validateAlignmentQuestions(questions: StoryAlignmentQuestion[]) {
  if (questions.length > 3) return false;
  const ids = new Set<string>();
  for (const question of questions) {
    if (ids.has(question.id) || !question.impact) return false;
    ids.add(question.id);
    if (question.answerMode === "text") {
      if (!question.allowCustom || question.options?.length) return false;
      continue;
    }
    if (!question.options || question.options.length < 2 || question.options.length > 3) return false;
    if (new Set(question.options.map((option) => option.id)).size !== question.options.length) return false;
    if (!question.recommendedOptionId || !question.recommendationReason) return false;
    if (!question.options.some((option) => option.id === question.recommendedOptionId)) return false;
  }
  return true;
}

function parseMainlineCard(text: string): Omit<StoryMainlineCard, "status" | "confirmedAt"> {
  const parsed = parseJson<Record<string, unknown>>(text, "AI 返回的主线理解卡不是有效 JSON");
  const classroomRoles = Array.isArray(parsed.classroomRoles) ? parsed.classroomRoles.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const role = item as Record<string, unknown>;
    const personId = stringValue(role.personId);
    const roleInStory = stringValue(role.roleInStory);
    return personId && roleInStory ? [{ personId, roleInStory }] : [];
  }) : [];
  const result = {
    protagonistStructure: stringValue(parsed.protagonistStructure),
    classroomRoles,
    incitingEvent: stringValue(parsed.incitingEvent),
    goal: stringValue(parsed.goal),
    mainObstacle: stringValue(parsed.mainObstacle),
    progression: stringValue(parsed.progression),
    endingDirection: stringValue(parsed.endingDirection),
    mustKeep: stringArray(parsed.mustKeep),
    mayExpand: stringArray(parsed.mayExpand),
  };
  if (!result.protagonistStructure || !result.incitingEvent || !result.goal || !result.mainObstacle || !result.progression || !result.endingDirection) {
    throw new StoryOutlineResponseError("AI 返回的主线理解卡结构不完整");
  }
  return result;
}

function parseAlignmentDecision(
  text: string,
  input: Pick<StoryPromptContext, "onFormatRepair"> & { replyContext?: "initial" | "requirement_change"; needsBackgroundRefresh?: boolean; requiredQuestionIds?: string[] },
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
  const validStatus = parsed.status === "ready_for_confirmation" || parsed.status === "needs_clarification";
  const validReadyModes = parsed.status !== "ready_for_confirmation" || (
    (parsed.planningMode === "follow_defined_plot" || parsed.planningMode === "explore_options")
    && (parsed.storyMode === "faithful" || parsed.storyMode === "new_story")
    && (parsed.classroomPresence === "observer" || parsed.classroomPresence === "participant" || parsed.classroomPresence === "absent")
    && !(parsed.storyMode === "faithful" && parsed.classroomPresence === "participant")
  );
  if (!validStatus || !validReadyModes) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  const status = parsed.status as AlignmentDecision["status"];
  const normalizedQuestions = Array.isArray(parsed.questions) ? parsed.questions.map(normalizeAlignmentQuestion).filter((item): item is StoryAlignmentQuestion => Boolean(item)) : [];
  const questions = normalizedQuestions;
  const brief = normalizeRequirementBrief(parsed.brief);
  const provisionalBriefKind = parsed.provisionalBriefKind === "narrative" || parsed.provisionalBriefKind === "concept" || parsed.provisionalBriefKind === "factual"
    ? parsed.provisionalBriefKind
    : undefined;
  const planningMode = parsed.planningMode === "follow_defined_plot" ? "follow_defined_plot" : "explore_options";
  const storyMode = parsed.storyMode === "faithful" ? "faithful" : provisionalBriefKind === "factual" ? "faithful" : "new_story";
  const classroomPresence = parsed.classroomPresence === "observer" || parsed.classroomPresence === "participant" || parsed.classroomPresence === "absent"
    ? parsed.classroomPresence
    : storyMode === "faithful" ? "observer" : "participant";
  const requiredNamedCharacters = brief && (brief.kind === "narrative" || brief.kind === "concept") ? brief.requiredNamedCharacters : [];
  const result: AlignmentDecision = {
    status,
    planningMode,
    storyMode,
    classroomPresence,
    requiredNamedCharacters,
    ...(provisionalBriefKind ? { provisionalBriefKind } : {}),
    ...(brief ? { brief } : {}),
    assistantMessage: stringValue(parsed.assistantMessage) || (status === "ready_for_confirmation" ? "我已经整理好创作理解，请确认。" : "还需要确认几个会影响故事方向的问题。"),
    resolvedUnderstanding: stringArray(parsed.resolvedRequirements).length ? stringArray(parsed.resolvedRequirements) : stringArray(parsed.resolvedUnderstanding),
    unresolvedIssues: stringArray(parsed.unresolvedIssues).length ? stringArray(parsed.unresolvedIssues) : questions.map((question) => question.label),
    questions,
  };
  if (!validateAlignmentQuestions(result.questions)) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  if (status === "ready_for_confirmation" && (!result.brief || result.questions.length)) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  const readyBrief = result.brief;
  if (status === "ready_for_confirmation" && readyBrief && result.storyMode === "new_story" && result.planningMode === "follow_defined_plot" && readyBrief.kind !== "factual" && !readyBrief.fixedPlot) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  if (status === "needs_clarification" && (result.questions.length < 1 || result.questions.length > 3)) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构不完整，自动修复后仍未通过。",
    );
  }
  if (input.requiredQuestionIds?.some((id) => !result.questions.some((question) => question.id === id))) {
    throw new StoryAlignmentResponseError(
      "STORY_ALIGNMENT_INVALID_STRUCTURE",
      "AI 返回的需求对齐结构遗漏了尚未回答的问题，自动修复后仍未通过。",
    );
  }
  return result;
}

export function createStoryOutlineGenerationDeps(settings: AiProviderSettingsInput = "quickrouter") {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider(undefined, settings));
  return {
    alignRequirements: async (input: StoryPromptContext & { task: string; replyContext?: "initial" | "requirement_change"; needsBackgroundRefresh?: boolean; requiredQuestionIds?: string[] }): Promise<AlignmentDecision> => {
      let { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_align_requirements",
        prompt: [
          "你是课程故事需求对齐引擎。你只负责把老师输入归一化为后续流程可直接消费的结构化需求；不创作方向、大纲或背景资料。",
          "先按课程成功标准分类：真实人物、真实事件或真实历史的准确性决定成功时为 factual；否则学生理解、应用或体验理论概念决定成功时为 concept；其余以角色经历和情节结果为核心时为 narrative。故事包装不改变 factual 或 concept，知识只作兴趣素材时仍为 narrative。",
          "planningMode 只判断是否需要比较不同核心方向。老师已经固定核心因果、特定真实历程或原作主线时为 follow_defined_plot；只有主题、人物、类型、知识素材或宽泛真实历史范围时为 explore_options。宽泛真实历史仍是 factual + faithful + observer，方向只能比较真实视角。",
          "默认 0 题。只有来源或版本差异会改变内容、硬要求互相冲突、明确学习理论但可验证学习目标未知，或上一答案新激活必要条件时才提问。地点、配角、奇幻机制、人物如何进入、具体转折和结尾细节交给后续设计。",
          "需要澄清时通常 1 题；同一轮最多返回 3 个当前已成立、彼此独立的阻塞问题。依赖上一答案的问题不得提前展示。不得因为轮数或成本自动采用推荐。",
          "推荐必须满足老师明确目标的最低复杂度，并受课堂人物年龄、英语等级、章节数和英文容量约束；不能为了简单而降低目标。明确要求学习某个理论时，推荐必须形成可验证的理解或应用结果，不能降成只知道宽泛口号，也不机械要求记忆整个分类体系。",
          ...classroomParticipationRules,
          "把“故事是否忠实”和“课堂人物是否进入”分开判断。storyMode 只能是 faithful 或 new_story；classroomPresence 只能是 observer、participant 或 absent。",
          "忠实讲述原作、真实人物传记或历史事实时使用 faithful + observer：课堂人物默认进入场景但只观察、记录、见证或彼此交流，不承担剧情贡献，也不能影响原作或史实的关键事件、因果、转折和结局。只有老师明确要求课堂人物不进入时才使用 absent。",
          "适龄删减或弱化成熟、成人、亲密关系内容，只改变呈现尺度，不等于改变原作剧情。只要关键事件、人物关系发展、因果和结局保持不变，继续使用 faithful + observer；按原作剧情讲述时，原作主线视为已经明确，planningMode 使用 follow_defined_plot。",
          "重新判断时必须结合完整对话继承已经确认的故事使用方式。不得仅因老师回答了内容边界问题就改成 explore_options；只有老师明确新增剧情、改变关键事件或结局，或让课堂人物影响原作人物和事件时，才按新要求重新判断 storyMode 和 planningMode。",
          "原创故事、改编原作、让课堂人物影响事件，或要求改变原作/史实关键因果与结局时使用 new_story + participant。即使保留原作角色、世界观或部分经典情节，只要产生新的行动和因果，也属于新故事。禁止 faithful + participant。",
          "人物传记与真实历史使用同一规则：事实讲述属于 faithful；让课堂人物参与并推动新事件属于 new_story。不要根据课堂人物是否进入来判断故事模式。",
          "后续在 new_story 中根据实际人数自动设计单人、双人或团队行动；在 faithful 中只设计不改变因果的观察、记录、见证和彼此交流。人物身份、相遇方式、任务、冲突、奇幻机制和结局由后续方向与大纲决定，不要向老师追问。",
          "老师明确提及 IP 或作品时，视为希望实际使用其中的原作人物；老师同时提出老师和学生经历新冒险时，默认理解为使用原作世界或核心人物创作新剧情，不追问是复述原作还是新编，也不主动提供只参考主题、氛围或风格的选项。",
          "老师未点名原作人物时，不要求老师列人物名单；后续根据背景资料选择与故事最相关的最小核心角色集合。只有版本歧义、点名人物冲突或其他差异会实质改变故事时，才需要确认。",
          "narrative 和 concept 的 requiredNamedCharacters 只逐个保存老师明确点名且要求出场的外部角色原名；不放入 Step 1 师生、团队、机构、作品名或推测角色。真实人物只进入 factual.subjects。",
          "fixedPlot 是老师已经固定的核心因果的一段简洁归纳；没有固定主线时为 null，不要补写老师未决定的触发、转折或结局。new_story + follow_defined_plot 必须有 fixedPlot。",
          "additionalConstraints 只保存没有被其他字段表达的老师要求；preferred 只放老师明确偏好，不放你的建议或系统适龄政策。所有数组必须存在。concept 在 ready 时必须至少有一个 learningTarget，每项包含 concept 和 expectedUnderstanding。",
          "needs_clarification 只返回 {status, provisionalBriefKind?, resolvedRequirements, questions}。每题字段为 id,label,impact,answerMode,options?,allowCustom,recommendedOptionId?,recommendationReason?；选择题必须有 2-3 个选项和属于现有选项的推荐，纯文本只用于名称、版本、链接或精确来源。ID 必须稳定且唯一。",
          "ready_for_confirmation 只返回 {status,planningMode,storyMode,classroomPresence,brief}。brief 必须是 narrative、concept、factual 三种联合结构之一。不要返回 summary、assistantMessage、工作流字段或数据库字段。",
          "narrative brief={kind,objective,sourceRequirements:[{name,useInCourse}],requiredNamedCharacters,fixedPlot,additionalConstraints:{required,preferred,excluded}}。",
          "concept brief={kind,objective,learningTargets:[{concept,expectedUnderstanding}],assumedPriorKnowledge,sourceRequirements,requiredNamedCharacters,fixedPlot,additionalConstraints}。",
          "factual brief={kind,subjects:[{name,kind:'person'|'event'|'topic'}],factualFocus,sourceRequirements,additionalConstraints}。",
          input.replyContext === "requirement_change" ? "这是创作需求修改：保留未受影响的已确认要求，只改变老师明确修改的部分。" : "这是首次需求对齐。",
          ...(input.requiredQuestionIds?.length ? [`以下问题尚未回答，下一响应必须保留相同 ID，不能放行确认：${JSON.stringify(input.requiredQuestionIds)}`] : []),
          ...teacherFacingReplyRules,
          ...alignmentContextPrompt(input),
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
              "修复需求对齐响应，使其满足协议；保留老师已表达的目标和所有真正阻塞项。",
              "允许合并同义问题并把当前问题数收敛到最多 3 个；不得截断阻塞项、静默采用推荐、重命名重复 ID 或改变推荐语义。",
              "needs_clarification schema: {status,provisionalBriefKind?,resolvedRequirements:string[],questions:1..3}。ready_for_confirmation schema: {status,planningMode,storyMode,classroomPresence,brief}。",
              ...(input.requiredQuestionIds?.length ? [`必须保留的未回答问题 ID：${JSON.stringify(input.requiredQuestionIds)}`] : []),
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
    generateMainlineCard: async (input: StoryPromptContext & { task: string; requirementBrief: StoryRequirementBrief }) => {
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_generate_mainline_card",
        prompt: [
          "你负责把老师已确认的需求展开成一张可确认的故事主线理解卡，不生成章节大纲，不改变需求。",
          "只补足写作所需的主线设计；brief 中的目标、来源使用、固定因果、事实边界、点名角色和约束都是最高优先级。",
          "忠实讲述只能整理既定事件，课堂人物只旁观、记录、见证或彼此交流，不能新增会改变原作或史实因果的行动。",
          "新故事根据课堂人物数量形成单人、双人或团队结构。老师明确要求每名学生有高光时，角色作用必须分别推进同一个共同目标，不能拆成互不相关的小任务。",
          "classroomRoles 只使用提供的 personId，不得重复；除非课堂人物明确不进入，否则必须逐个包含所有课堂人物。课堂人物不进入时返回空数组。mayExpand 只能列出后续可以创作补充、且不会改变已确认需求的部分。",
          "只返回 JSON：{protagonistStructure,classroomRoles:[{personId,roleInStory}],incitingEvent,goal,mainObstacle,progression,endingDirection,mustKeep:string[],mayExpand:string[]}。",
          ...alignmentContextPrompt(input),
          `<requirement_brief>${JSON.stringify(input.requirementBrief)}</requirement_brief>`,
          `<references>${JSON.stringify(input.references)}</references>`,
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const card = parseMainlineCard(text);
      const allowedPersonIds = new Set(input.coursePeople.map((person) => person.personId));
      const returnedPersonIds = card.classroomRoles.map((role) => role.personId);
      if (new Set(returnedPersonIds).size !== returnedPersonIds.length || returnedPersonIds.some((id) => !allowedPersonIds.has(id))) {
        throw new StoryOutlineResponseError("AI 返回的主线理解卡包含无效或重复的课堂人物");
      }
      if (input.classroomPresence === "absent" ? returnedPersonIds.length > 0 : input.coursePeople.some((person) => !returnedPersonIds.includes(person.personId))) {
        throw new StoryOutlineResponseError("AI 返回的主线理解卡遗漏或错误加入了课堂人物");
      }
      return card;
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
          ...confirmedReferenceRules(input),
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
          ...contextPrompt(input, { includeCurrentDirections: true }),
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
      const policy = resolvedStoryPolicy(input);
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_generate_directions",
        prompt: [
          input.storyMode === "faithful"
            ? "你是一名严谨的儿童叙事策划，只把已经确认的原作或史实整理成 3 个可供老师选择的讲述视角，不改写事实，不展开章节大纲。"
            : "你是一名富有想象力的儿童故事创意总监，擅长把已经确认的创作需求发展成新奇、有吸引力且适合学生的故事构想。只生成 3 个可供老师选择的故事方向，不展开章节大纲。",
          "只返回包含 3 项的 JSON 数组；每项字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits。自然语言说明使用中文；Step 1 课堂人物逐字使用快照中的 englishName，外部角色使用老师输入或参考资料确认的名称并在三个方向中保持一致。",
          ...directionCardWritingRules(input),
          "完整保留老师明确指定的故事类型、人物、课堂参与方式和已确认资料边界。老师点名的角色优先于 AI 自选角色。",
          "把“必须出场的点名角色”完整保留在每个方向的 mainCharacters；hook 只点出理解该方向所必需的角色，点名角色较多时允许使用老师已确认的团队称呼，不能为逐人点名破坏方向卡的可读性。旧数据没有该数组时，从已确认创作理解中提取逐个写明的角色。",
          ...directionClassroomRules(input),
          ...confirmedReferenceRules(input),
          input.storyMode === "faithful"
            ? "只保留已确认讲述范围内实际存在且理解事件所必需的人物；不得为了凑角色数量新增人物，也不得用角色上限删除既定事件不可缺少的人物。老师明确点名且资料确认的人物全部保留。"
            : "使用已有作品但老师未点名具体原作人物时，根据已确认参考资料选择最适合当前方向的核心角色，默认最多 2 个；核心冲突需要更多角色时按需增加。老师明确点名的原作角色全部保留，老师和学生不计入该上限。具名团队、不可分割的群像或老师明确要求的完整群体按整体保留。",
          input.storyMode === "faithful"
            ? "保持老师指定的讲述类型和最新反馈，所有人物行为、事件关系和结果都必须来自已确认内容。"
            : "保持老师指定的故事类型和最新反馈，让人物行动、世界规则与解决方式形成完整因果。",
          ...directionSetDiversityRules(input),
          input.storyMode === "faithful"
            ? "优先选择准确、清楚、适龄且符合课程容量的讲述视角，不以意外性或戏剧性覆盖事实。"
            : "优先选择有趣、意外、因果连贯且符合课程容量的方向，再提炼课堂价值。",
          ...directionContextPrompt(input),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = parseJson<unknown>(text, "故事方向解析失败，请重试");
      if (!Array.isArray(parsed) || parsed.length !== 3) {
        throw new StoryOutlineResponseError("故事方向返回的内容结构不完整，请重试本步");
      }
      return parsed.map((value) => {
        const direction = normalizeDirection(value, input.coursePeople, "故事方向返回的内容结构不完整，请重试本步");
        enforceChineseGenerationMax(direction.hook, policy.chinese.directionOverview.hardMax, "方向概要");
        return { ...direction, classroomValue: "", seedPrompt: direction.hook };
      });
    },
    reviseDirection: async (input: StoryPromptContext & { task: string; direction: unknown }) => {
      const policy = resolvedStoryPolicy(input);
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_direction",
        prompt: [
          input.storyMode === "faithful"
            ? "你是一名严谨的儿童叙事策划。根据老师最新要求，只调整指定的一张忠实讲述方向卡。"
            : "你是一名富有想象力的儿童故事创意总监。根据老师最新要求，只调整指定的一张故事方向卡。",
          "必须保留老师没有要求改变的内容，并继续遵守已确认需求和背景资料。不要修改其他方向，不生成章节大纲。",
          "返回一份完整新版 JSON，字段为 title, hook, storyHighlight, growthCore, mainCharacters, whyFits，不返回修改说明。",
          ...directionCardWritingRules(input),
          input.storyMode === "faithful"
            ? "修改后仍只调整叙事视角、事实焦点、讲述范围或表达清晰度，不新增任务、冲突、行动、因果或结局。"
            : "修改后让核心问题、主要行动和独特之处形成完整因果，并继续符合老师最新要求。",
          "把“必须出场的点名角色”完整保留在新版 mainCharacters 中；hook 只点出理解该方向所必需的角色，点名角色较多时允许使用老师已确认的团队称呼。旧数据没有该数组时，从已确认创作理解中提取逐个写明的角色。",
          ...directionClassroomRules(input),
          ...confirmedReferenceRules(input),
          ...directionContextPrompt(input),
          "<target_direction>",
          JSON.stringify(directionForPrompt(input.direction)),
          "</target_direction>",
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = normalizeDirection(
        parseJson<unknown>(text, "故事方向修改失败，请重试"),
        input.coursePeople,
        "故事方向修改返回的内容结构不完整，请重试本步",
      );
      enforceChineseGenerationMax(parsed.hook, policy.chinese.directionOverview.hardMax, "方向概要");
      return {
        ...parsed,
        classroomValue: stringValue((input.direction as { classroomValue?: unknown }).classroomValue),
        seedPrompt: parsed.hook,
      };
    },
    reviseChapter: async (input: StoryPromptContext & { task: string; chapterOrder: number }) => {
      const policy = resolvedStoryPolicy(input);
      const { text } = await client().generateOutline({
        writingProvider: "quickrouter_gpt",
        operation: "story_revise_chapter",
        prompt: [
          "你是一名资深儿童故事主编，只修改老师指定的一章故事大纲。",
          "不得改变故事标题、整体主线、角色名单、其他章节及章节数量。修改必须承接上一章并能自然推动下一章；如果老师的要求无法在不影响这些内容的情况下完成，返回 {status:'requires_outline_revision',reason}。",
          "可以修改本章标题、剧情概述、出场角色和知识点建议。只返回 JSON：成功时 {status:'ready',chapter:{order,title:{zh,en},whatHappens,characterIds,recommendedKnowledgePointKeys,knowledgePointRecommendationSummary}}。",
          "characterIds 只能逐字复制当前大纲角色 id；recommendedKnowledgePointKeys 只能使用全课可选知识点短键。",
          ...chapterRevisionNarrativeRules(input),
          "修改知识点建议时仍需从全课分布判断：先完成本章故事，再只推荐与既有剧情自然适配且能在同一语境中共存的知识点；通常推荐 2 个、最多 3 个，只有确实找不到自然组合时才保留 1 个。不得为知识点新增道具、规则、人物行为或支线，不为平均分配强行组合。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。",
          ...confirmedReferenceRules(input),
          ...contextPrompt(input, { includeKnowledgePoints: true }),
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
      const title = bilingualChapterTitle(chapter.title);
      const whatHappens = proseValue(chapter.whatHappens);
      if (!title || !whatHappens) throw new StoryOutlineResponseError("章节修改返回的内容结构不完整，请重试本步");
      const normalizedWhatHappens = canonicalizeClassroomNames(whatHappens, input.coursePeople);
      enforceChineseGenerationMax(normalizedWhatHappens, policy.chinese.chapterOverview.hardMax, "单章概述");
      return {
        status: "ready" as const,
        chapter: {
          order: Number(chapter.order) || input.chapterOrder,
          title,
          whatHappens: normalizedWhatHappens,
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
          ...confirmedReferenceRules(input),
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
      requiredNamedCharacters?: string[];
      englishLevel?: string;
      /** Legacy request compatibility only. Intentionally ignored. */
      durationMinutes?: 30 | 45 | 60;
      storyComplexity?: StoryComplexity;
      lengthPolicy?: StoryLengthPolicy;
      requirementBrief?: StoryRequirementBrief;
      mainlineCard?: StoryMainlineCard;
      selectedKnowledgePoints?: StoryPromptContext["selectedKnowledgePoints"];
    }) => {
      const policy = resolvedStoryPolicy(input);
      const referenceOptions = storyReferenceOptions(input.references);
      const referenceByKey = new Map(referenceOptions.map((reference) => [reference.key, reference]));
      const knowledgePointCoverageTarget = Math.min(knowledgePointOptions(input).length, input.chapterCount * 2);
      const { text } = await client().generateOutline({
        writingProvider: input.writingProvider,
        operation: "story_generate_outline",
        prompt: [
          input.storyMode === "faithful"
            ? "你是一名严谨的儿童叙事主编，只负责把老师已经选定的原作或史实讲述视角整理成可确认的章节大纲。不改写事实，不生成正式课文、练习、教学活动或图片提示。"
            : "你是一名资深儿童故事主编，只负责生成可确认的故事大纲，把老师已经选定的故事方向发展成完整、清楚且富有想象力的章节结构。不重新选择故事，不生成正式课文、练习、教学活动或图片提示。",
          input.storyMode === "faithful"
            ? "首先保证老师能够快速读懂内容。完整保留已选方向的讲述对象、范围、主要人物、事实焦点；允许删除、合并或简化不必要的解释，不要求逐字扩写方向文案。"
            : "首先保证老师能够快速读懂故事。完整保留已选方向的核心任务、主要冲突、主要角色或群体、故事亮点和成长方向，但允许删除、合并或简化方向中不必要的道具、规则和解释，不要求逐字扩写方向文案。",
          ...outlineNarrativeRules(input),
          ...contentPriorityRules(input),
          "summary 使用 2–3 个自然短句，按故事自身顺序讲清起点、关键发展和最终结果；故事没有某类环节时不要强行补齐。每句都有清楚的行动者、具体动作或局面变化，不得用“情况发生变化”“重新判断”“经历挑战”“大家共同努力”等抽象概括替代关键事件。老师只读 summary 就应能快速复述主线。",
          "每章 whatHappens 写成 1–2 个自然短句，语义完整优先于凑固定句数。只保留本章最必要的 2–3 个关键事件，讲清承接局面、主要行动和直接结果；每句话只表达一个主要事件，不显示结构标签，也不把命令、发现、选择、移动和结果塞进同一句。大纲只规定核心事件，不写正式对话或环境描写。",
          `中文篇幅不设强制下限，不得填充。summary 推荐不超过 ${policy.chinese.outlineSummary.recommendedMax} 字、生成上限 ${policy.chinese.outlineSummary.hardMax} 字；每章 whatHappens 推荐不超过 ${policy.chinese.chapterOverview.recommendedMax} 字、生成上限 ${policy.chinese.chapterOverview.hardMax} 字。超出推荐值时先删除重复修饰，不能程序截断；超过生成上限会整步失败，不得截断保存。`,
          "任何新地点、物品、规则、路线关系或信息首次出现时立刻说明它与当前任务的关系，不能先使用后解释；避免“连接处”“上方区域”“另一边”“旧痕迹”等只有作者知道所指的表达。相邻章节不得重复同一种“发现信息—重新选择路线—继续前进”或其他相同动作模板；每章承担不同功能并造成不同类型的局面变化。",
          "先在不考虑知识点的情况下完成故事概括和全部章节剧情，再从全课视角根据已经形成的自然语境匹配知识点。不得为使用某个知识点新增道具、规则、人物行为或支线；summary 和 whatHappens 不得出现语法、知识点或教学安排说明。",
          "只返回 JSON 对象，字段为 title, summary, characters, chapters。故事 title 和章节 title 返回中英文双语对象 {zh,en}；英文标题应简洁、自然并忠实对应中文标题。面向老师展示的说明使用中文，但课堂人物名称按下述规则使用人物快照英文名。",
          "characters 每项字段为 key, displayName, englishName, sourceType, sourcePersonId?, sourceReferenceKey?, roleInStory；displayName 保存自然中文名，englishName 保存后续英文正文、界面展示和生图都能稳定复用的自然英文名；key 使用 C1、C2 等响应内稳定短键，sourceType 只能是 person, referenced, original。不要生成视觉描述或是否出图标记。summary、roleInStory 和 chapters 中提到课堂人物时统一使用人物快照的 englishName，不混用中文名。",
          "characters 是后续视觉资产名单，不是所有被故事提到的实体清单。只保留具体、持续参与剧情、需要保持视觉一致性的角色；机构、公司、团队、部门、监管方和其他背景群体不得进入 characters，只能在 summary 或章节 whatHappens 中按需提及。参考资料中出现某个实体，不代表它是角色。",
          "外部真实人物或已有作品角色实际出场时，sourceType 必须为 referenced，并且 sourceReferenceKey 必须逐字复制已保存参考资料中的 Rxx key；同一份组合资料可以由多个角色共同引用。原创人物才使用 original，且不得返回 sourceReferenceKey。",
          "如果角色的中文名或英文名已经出现在已保存参考资料中，该角色绝不能标记为 original，必须标记为 referenced 并返回对应 sourceReferenceKey。",
          "referenced 角色的 englishName 必须使用老师输入和参考资料能够确认的官方或通行英文名，不得把中文名临时直译成新的英文名。",
          input.storyMode === "faithful"
            ? "roleInStory 对原作或历史人物只说明资料确认的既定身份和事件关系；对课堂人物只说明其观察位置，不分配目标、任务或剧情功能。课堂人物只能复用人物快照，不编造外貌、性格或背景；进入 characters 时 sourcePersonId、displayName 和 englishName 必须逐字复制对应人物快照。"
            : "roleInStory 说明角色在本故事中的目标、剧情作用和必要关系，不写人物百科或空泛性格标签。课堂人物只能复用人物快照，不编造外貌、性格或背景；进入 characters 时 sourcePersonId、displayName 和 englishName 必须逐字复制对应人物快照。",
          input.storyMode === "faithful"
            ? "原作或历史人物只保留已确认讲述范围实际需要的角色；课堂旁观者不需要服务核心事件。不得新增原创角色填补史实或原作空白。"
            : "老师点名且要求出场的角色必须通过行动推动故事；每个角色都必须服务核心叙事，AI 自行新增的原创角色最多 1 个，群像要求除外。",
          "引用角色只保留已选故事方向实际使用的引用角色；参考资料中的其他候选角色不得自动进入 characters。老师明确点名且要求出场的引用角色仍须全部保留。",
          "chapters 每项字段为 order, title:{zh,en}, whatHappens, characterKeys, recommendedKnowledgePointKeys, knowledgePointRecommendationSummary；characterKeys 只能引用 characters 中的 key。章节数量必须等于指定章节数。",
          ...outlineStoryQualityRules(input),
          "全部章节剧情完成后再从全课视角统一规划知识点分布。recommendedKnowledgePointKeys 只能逐字复制“全课可选知识点”中的 key（例如 KP1），不要返回数据库 id、知识点名称或自行创造 key。某章没有自然语境时允许返回空数组，并把 knowledgePointRecommendationSummary 留空；不得为覆盖知识点改写剧情。",
          "有自然语境的章节通常推荐 1–2 个知识点，每章最多 3 个；书籍、版本、官方难度、Section 与 Unit 来源用于理解语法范围和相邻 Unit 差异，不得作为必须出现的硬约束。",
          ...(knowledgePointCoverageTarget ? [`知识点覆盖软基准：全课优先覆盖 ${knowledgePointCoverageTarget} 个不同知识点。这是自然适配后的选择目标，不是必须凑满的硬校验；无法自然使用时允许少于该数量，也不得为达到数量改写剧情。`] : []),
          "知识点分布优先考虑本章表达适配性、同章知识点能否在同一语境中自然共存、英语难度与已给出的每章英文容量，再覆盖老师选择的多样知识点；不得为了平均分配强行组合。同一知识点可以在多章复用，但复用不应挤占其他同样自然适配的知识点。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。不要生成词数、题型或题量。",
          input.storyMode === "faithful"
            ? "忠实讲述的优先级为：已确认事实及原作事件、因果和结局；老师在该边界内明确的讲述范围与呈现要求；已选择方向；当前大纲；通用写作建议。任何要求都不能把课堂人物变成事件推动者。"
            : input.requirementBrief
              ? "需求优先级从高到低为：已确认结构化需求卡；已选择方向；已确认参考资料；当前大纲；通用创作建议。低优先级内容不得覆盖高优先级要求。"
              : "需求优先级从高到低为：老师历史中明确要求；已选择方向；已确认参考资料；当前大纲；通用创作建议。低优先级内容不得覆盖高优先级要求。",
          ...classroomGenerationRules(input),
          ...confirmedReferenceRules(input),
          "根据人物年龄、老师要求、引用对象、故事模式和课堂人物参与方式选择合适的叙事结构与主角。课堂人物进入 characters 时，sourcePersonId 必须准确对应人物快照。",
          ...outlineGenreRules(input),
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
          }, { includeKnowledgePoints: true }),
          "<current_task>",
          input.task,
          "</current_task>",
        ].join("\n"),
      });
      const parsed = objectValue(parseJson<unknown>(text, "故事大纲解析失败，请重试"));
      if (!parsed || !Array.isArray(parsed.characters) || !Array.isArray(parsed.chapters)) {
        throw new StoryOutlineResponseError("故事大纲返回的内容结构不完整，请重试本步");
      }
      const title = bilingualChapterTitle(parsed.title);
      const summary = proseValue(parsed.summary) || bilingualText(parsed.summary);
      if (!title || !summary || !parsed.chapters.length) {
        throw new StoryOutlineResponseError("故事大纲返回的内容结构不完整，请重试本步");
      }
      const normalizedSummary = canonicalizeClassroomNames(summary, input.coursePeople);
      enforceChineseGenerationMax(normalizedSummary, policy.chinese.outlineSummary.hardMax, "整体概要");
      const options = knowledgePointOptions(input);
      const resolveKnowledgePointIds = (values: string[] = []) => [...new Set(values.flatMap((value) => {
        const normalized = value.trim().toLowerCase();
        const match = options.find((option) => option.key.toLowerCase() === normalized || option.id.toLowerCase() === normalized || option.label.trim().toLowerCase() === normalized);
        return match ? [match.id] : [];
      }))];
      const characters = parsed.characters.map((value, index) => {
        const character = objectValue(value);
        if (!character) throw new StoryOutlineResponseError("故事大纲返回的角色结构不完整，请重试本步");
        const key = stringValue(character.key);
        const modelDisplayName = nameValue(character.displayName);
        const modelEnglishName = nameValue(character.englishName);
        const roleInStory = proseValue(character.roleInStory);
        const requestedSourceType = character.sourceType === "person" || character.sourceType === "referenced" || character.sourceType === "original"
          ? character.sourceType
          : null;
        if (!key || !modelDisplayName || !roleInStory || !requestedSourceType) {
          throw new StoryOutlineResponseError("故事大纲返回的角色结构不完整，请重试本步");
        }
        const person = resolveCoursePerson(
          input.coursePeople,
          stringValue(character.sourcePersonId),
          [modelDisplayName, modelEnglishName],
        );
        const sourceType: "person" | "referenced" | "original" = person ? "person" : requestedSourceType;
        if (requestedSourceType === "person" && !person) {
          throw new StoryOutlineResponseError(`人物档案角色 ${modelEnglishName || modelDisplayName || key || index + 1} 无法与本课人物唯一对应，请重试本步`);
        }
        const displayName = person?.chineseName || modelDisplayName;
        const englishName = person?.englishName || modelEnglishName;
        if (!englishName) throw new StoryOutlineResponseError(`角色 ${displayName || key || index + 1} 缺少英文名，请重试本步`);
        const explicitReference = stringValue(character.sourceReferenceKey)
          ? referenceByKey.get(stringValue(character.sourceReferenceKey))
          : null;
        const recordedReferences = referenceOptions.filter((candidate) => referenceMentionsCharacter(candidate, { displayName, englishName }));
        if (sourceType === "original" && recordedReferences.length > 1) {
          throw new StoryOutlineResponseError(`角色 ${displayName} 同时匹配多份参考资料，无法自动确定引用关系`);
        }
        const inferredReference = sourceType === "original" ? recordedReferences[0] ?? null : null;
        const normalizedSourceType: "person" | "referenced" | "original" = inferredReference ? "referenced" : sourceType;
        const reference = explicitReference ?? inferredReference;
        if (normalizedSourceType === "referenced" && !reference) {
          throw new StoryOutlineResponseError(`引用角色 ${displayName} 缺少有效 sourceReferenceKey`);
        }
        return {
          key,
          displayName,
          englishName,
          sourceType: normalizedSourceType,
          sourcePersonId: normalizedSourceType === "person" ? person!.personId : null,
          sourceReferenceId: normalizedSourceType === "referenced" ? reference!.id : null,
          roleInStory: canonicalizeClassroomNames(roleInStory, input.coursePeople),
          shortDescription: canonicalizeClassroomNames(roleInStory, input.coursePeople),
          shouldAppearInImages: true,
        };
      });
      const characterKeys = characters.map((character) => character.key);
      if (new Set(characterKeys).size !== characterKeys.length) {
        throw new Error("故事大纲角色 key 缺失或重复");
      }
      const knownCharacterKeys = new Set(characterKeys);
      const chapters = parsed.chapters.map((value, index) => {
        const chapter = objectValue(value);
        if (!chapter) throw new StoryOutlineResponseError("故事大纲返回的章节结构不完整，请重试本步");
        const order = Number(chapter.order);
        const chapterTitle = bilingualChapterTitle(chapter.title);
        const whatHappens = proseValue(chapter.whatHappens) || proseValue(chapter.storyGoal);
        if (!Number.isInteger(order) || order < 1 || !chapterTitle || !whatHappens || (chapter.characterKeys !== undefined && !Array.isArray(chapter.characterKeys))) {
          throw new StoryOutlineResponseError(`第 ${index + 1} 章返回的内容结构不完整，请重试本步`);
        }
        const chapterKeys = stringArray(chapter.characterKeys);
        if (Array.isArray(chapter.characterKeys) && chapterKeys.length !== chapter.characterKeys.length) {
          throw new StoryOutlineResponseError(`第 ${order} 章返回的角色结构不完整，请重试本步`);
        }
        if (new Set(chapterKeys).size !== chapterKeys.length || chapterKeys.some((key) => !knownCharacterKeys.has(key))) {
          throw new StoryOutlineResponseError(`第 ${order} 章包含重复或未知角色 key`);
        }
        const characterActions = proseValue(chapter.characterActions);
        const mainlineProgress = proseValue(chapter.mainlineProgress);
        const keyEvents = stringArray(chapter.keyEvents);
        const recommendedKeys = stringArray(chapter.recommendedKnowledgePointKeys).length
          ? stringArray(chapter.recommendedKnowledgePointKeys)
          : stringArray(chapter.recommendedKnowledgePointIds);
        const normalizedWhatHappens = canonicalizeClassroomNames(whatHappens, input.coursePeople);
        enforceChineseGenerationMax(normalizedWhatHappens, policy.chinese.chapterOverview.hardMax, `第 ${order} 章概述`);
        return {
          order,
          title: chapterTitle,
          storyGoal: normalizedWhatHappens,
          keyEvents: [characterActions, mainlineProgress, ...keyEvents]
            .filter(Boolean)
            .map((item) => canonicalizeClassroomNames(item, input.coursePeople)),
          setting: canonicalizeClassroomNames(proseValue(chapter.setting), input.coursePeople),
          endingHook: canonicalizeClassroomNames(proseValue(chapter.endingHook), input.coursePeople),
          whatHappens: normalizedWhatHappens,
          characterActions: canonicalizeClassroomNames(characterActions, input.coursePeople),
          mainlineProgress: canonicalizeClassroomNames(mainlineProgress, input.coursePeople),
          characterKeys: chapterKeys,
          characterIds: [],
          recommendedKnowledgePointIds: resolveKnowledgePointIds(recommendedKeys),
          knowledgePointRecommendationSummary: normalizeKnowledgePointSummary(chapter.knowledgePointRecommendationSummary, options),
        };
      });
      return {
        title,
        summary: normalizedSummary,
        storyHook: canonicalizeClassroomNames(proseValue(parsed.storyHook), input.coursePeople),
        characters,
        chapters,
      };
    },
  };
}
