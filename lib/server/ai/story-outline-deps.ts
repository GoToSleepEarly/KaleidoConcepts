import type {
  CourseResearchPlan,
  CourseSourceReferenceType,
  CourseSourceStatus,
  StoryAlignmentQuestion,
  StoryWritingProvider,
} from "@/lib/contracts/api";

import { devAiLog } from "./dev-ai-log";
import { createStoryOutlineProvider } from "./story-outline-provider";
import type { AiGateway } from "@/lib/ai-gateway";

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
  durationMinutes?: 30 | 45 | 60;
  selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string }>;
  confirmedRequirement?: string;
  storyMode?: "faithful" | "new_story";
  classroomPresence?: "observer" | "participant" | "absent";
  requiredNamedCharacters?: string[];
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

function directionReferenceForPrompt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const reference = value as Record<string, unknown>;
  return Object.fromEntries(
    ["name", "type", "summary", "usableFacts", "adaptationBoundary"]
      .filter((key) => reference[key] !== undefined)
      .map((key) => [key, reference[key]]),
  );
}

function directionContextPrompt(input: StoryPromptContext) {
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
    `故事容量：${input.chapterCount} 章${input.durationMinutes ? ` / ${input.durationMinutes} 分钟` : ""}；只设计一条能在该容量内讲清的核心主线。`,
    `老师和学生人物快照：${JSON.stringify(peopleSnapshots)}`,
    ...(input.confirmedRequirement ? [`已确认创作理解：${input.confirmedRequirement}`] : []),
    ...(input.requiredNamedCharacters?.length ? [`必须出场的点名角色：${JSON.stringify(input.requiredNamedCharacters)}`] : []),
    ...(input.storyMode ? [`故事模式：${input.storyMode}`, `课堂人物参与方式：${input.classroomPresence ?? (input.storyMode === "faithful" ? "observer" : "participant")}`] : []),
    "</course_context>",
    "<recent_effective_conversation>",
    JSON.stringify(latestTeacherMessage ? [latestTeacherMessage] : []),
    "</recent_effective_conversation>",
    "<confirmed_references>",
    JSON.stringify(input.references.map(directionReferenceForPrompt)),
    "</confirmed_references>",
  ];
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
    ...(input.requiredNamedCharacters?.length ? [`必须出场的点名角色：${JSON.stringify(input.requiredNamedCharacters)}`] : []),
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
  requiredNamedCharacters: string[];
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
  "方向卡用于快速选择主线，不是压缩版大纲。hook 使用 2–4 个简短自然句，通常约 3 句，按最自然的顺序组织完整意思。",
  "mainCharacters 完整记录具体角色和需要保持视觉一致性的具名群体，但只能是 JSON 字符串数组，每一项只写一个名称；不得返回对象，不得把已经逐人列出的课堂成员再用“学生队”“师生团队”“英雄战队”等课堂团队称呼作为额外角色重复放入 mainCharacters。这里的具名群体只指外部作品真实存在且老师明确要求的团队。hook 可以使用自然的团队称呼表达共同参与。",
];

function directionCardWritingRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return [
      ...directionCardBaseRules,
      "hook 只概括已经确认的原作或史实内容、当前叙事视角和事实焦点，不给课堂人物创造任务、障碍、解法或改变结局的行动。",
      "storyHighlight 用一句话指出这个叙事视角最值得关注的既定事实、事件或关系；growthCore 只说明课堂理解可能发生的变化，不虚构被讲述人物的心理成长；whyFits 精简说明该视角与老师要求的对应关系。",
    ];
  }
  return [
    ...directionCardBaseRules,
    "每个 hook 只呈现一个决定性故事引擎，让核心问题、主要行动和独特之处彼此直接相关。辅助规则、逐人分工、阶段任务和具体解法由大纲展开。",
    "使用具体人物、地点、动作和清楚的行动对象。方向中的物品、规则或原创概念在首次出现时说明它怎样改变人物行动或核心问题。",
    "storyHighlight 用一句话指出真正影响剧情、最有辨识度的亮点。growthCore 说明角色原先的应对方式和故事经历可能带来的具体变化。whyFits 精简说明该方向与老师要求的对应关系。",
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

function outlineNarrativeRules(input: Pick<StoryPromptContext, "storyMode">) {
  if (input.storyMode === "faithful") {
    return [
      "写作前只根据已确认资料梳理既定事件、时间顺序、人物关系和可确认因果；资料没有支持的心理动机、对话、冲突、行动或结果不得补写为事实。",
      "章节按真实时间、既定因果或老师确认的讲述范围组织。每章推进的是对既定事件的讲述，不是课堂人物的任务；不得为了制造戏剧性增加障碍、道具、规则、反派或解决方案。",
      "课堂人物只观察，不承担推动、解决或改变事件的贡献。老师即使要求每名学生都有高光，也不能把课堂人物改成历史或原作事件的行动者。",
    ];
  }
  return [
    "写作前在内部明确核心矛盾、事件之间为什么相互导致、每章使局面发生什么变化，以及结局如何由前文自然产生；再自行选择最适合当前故事的叙事结构，不输出内部规划。不要套用固定的“受挫—调整—成功”框架，也不预设行动路径数量、转折次数或计划改变次数。保留会改变人物决定、升级冲突或影响结果的事件；删除不影响后续，或无法在指定章节与课时内解释清楚的内容。",
    "复杂度根据章节数和课时决定，不预设魔法机制、地点、物品或新信息的数量；它们可以有多个，但都必须容易解释、持续影响人物行动或后续结果。不断追加规则、没有后续作用或只让名词变多的内容必须删除。",
    "生成章节时在内部检查连续状态：人物位置、关键物品归属、角色已知信息和核心矛盾进展。下一章必须承接上一章的实际结果，本章结果必须改变下一章成立时的局面；失踪角色在被找到前不能行动，未取得的物品不能使用或交付，新规则必须先被发现或验证。最终结果必须回应开头建立的核心矛盾，结局只能来自前文已经建立的行动、信息、关系或规则，不能突然出现新的解决工具。",
    "角色行动分散到完整大纲，并通过选择和结果体现成长，不在 summary 或单章集中点名所有角色。多人、具名团队或不可分割的群像共享核心矛盾，每章只突出当前事件需要的成员；默认不要求逐人发言、平均戏份，也不要求每名成员拥有独立支线或成长线。老师明确要求“每名学生都有高光时刻”或同义要求时，该要求优先：每名学生都要有一次能改变局面或帮助团队推进的可辨识行动，但仍不需要独立支线、平均篇幅或逐章轮流点名。",
  ];
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
      "这是忠实讲述的章节修改。whatHappens 使用 2–4 个自然短句，只按已确认资料讲清本章既定事件及其与相邻章节的真实时间或因果关系，不新增或改变事实、原作事件、人物行为、转折或结局。",
      "不得为了增强戏剧性新增地点、物品、规则、线索、任务、障碍或解决方案；资料没有支持的心理动机和对话不能写成事实。",
      "课堂人物只观察、记录、见证或彼此交流，不采访、提醒或帮助原作与历史人物，不承担推动、解决或改变事件的贡献。",
    ];
  }
  return [
    "whatHappens 仍是一个自然的故事段落，使用 2–4 个自然短句，语义完整优先于凑固定句数。自然讲清承接的具体局面、本章必要行动和行动造成的直接结果，不显示结构标签；每句话只表达一个主要事件。本章结果必须改变下一章成立时的局面，但不预设行动数量或转折结构，也不把命令、发现、选择、移动、多人分工和多个转折压进同一句。",
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
    requiredNamedCharacters: stringArray(parsed.requiredNamedCharacters),
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

export function createStoryOutlineGenerationDeps(aiGateway: AiGateway = "quickrouter") {
  let provider: ReturnType<typeof createStoryOutlineProvider> | null = null;
  const client = () => (provider ??= createStoryOutlineProvider(undefined, aiGateway));
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
          "忠实讲述原作、真实人物传记或历史事实时使用 faithful + observer：课堂人物默认进入场景但只观察、记录、见证或彼此交流，不承担剧情贡献，也不能影响原作或史实的关键事件、因果、转折和结局。只有老师明确要求课堂人物不进入时才使用 absent。",
          "适龄删减或弱化成熟、成人、亲密关系内容，只改变呈现尺度，不等于改变原作剧情。只要关键事件、人物关系发展、因果和结局保持不变，继续使用 faithful + observer；按原作剧情讲述时，原作主线视为已经明确，planningMode 使用 follow_defined_plot。",
          "重新判断时必须结合完整对话继承已经确认的故事使用方式。不得仅因老师回答了内容边界问题就改成 explore_options；只有老师明确新增剧情、改变关键事件或结局，或让课堂人物影响原作人物和事件时，才按新要求重新判断 storyMode 和 planningMode。",
          "原创故事、改编原作、让课堂人物影响事件，或要求改变原作/史实关键因果与结局时使用 new_story + participant。即使保留原作角色、世界观或部分经典情节，只要产生新的行动和因果，也属于新故事。禁止 faithful + participant。",
          "人物传记与真实历史使用同一规则：事实讲述属于 faithful；让课堂人物参与并推动新事件属于 new_story。不要根据课堂人物是否进入来判断故事模式。",
          "后续在 new_story 中根据实际人数自动设计单人、双人或团队行动；在 faithful 中只设计不改变因果的观察、记录、见证和彼此交流。人物身份、相遇方式、任务、冲突、奇幻机制和结局由后续方向与大纲决定，不要向老师追问。",
          "老师明确提及 IP 或作品时，视为希望实际使用其中的原作人物；老师同时提出老师和学生经历新冒险时，默认理解为使用原作世界或核心人物创作新剧情，不追问是复述原作还是新编，也不主动提供只参考主题、氛围或风格的选项。",
          "老师未点名原作人物时，不要求老师列人物名单；后续根据背景资料选择与故事最相关的最小核心角色集合。只有版本歧义、点名人物冲突或其他差异会实质改变故事时，才需要确认。",
          "requiredNamedCharacters 必须逐个保留老师明确点名且要求出场的角色原名，按老师表述去重后返回；不得归纳成“核心角色”“主要角色”“某某等人”，也不得把作品名、团队名、机构、老师或学生姓名放入该数组。老师没有点名具体作品角色时返回空数组。summary 和 resolvedUnderstanding 提及这些角色时也要逐个写出，不能用集合称呼替代。",
          "通常不提问：信息足以生成 3 个明显不同的故事方向时，直接返回 ready_for_confirmation 和整理后的创作理解。只有确实存在会改变故事本质、且无法安全推断的阻断歧义时才提问；通常只问 1 题，两个互相独立的阻断歧义并存时最多问 2 题。",
          "需要提问时，每个问题都必须给出 2-3 个可直接选择的选项，并从这些选项中指定一项具体推荐及简短理由；推荐项作为安全默认答案，老师可以直接确认。除非缺少无法推断的专有名称或版本，不使用纯文本题。每题仍允许自定义输入。",
          "对齐完成后不直接生成故事，返回简短创作理解摘要等待老师确认。摘要须用面向老师的中文明确说明是忠实讲述还是新故事，以及课堂人物是旁观、参与还是不进入；没有具体主线时，说明将通过 3 个候选方向选择，不继续追问剧情细节。",
          input.replyContext === "requirement_change"
            ? "这是一次创作需求修改。summary 只概括修改后的创作理解，不使用“建议”“已确认”“已确定”等措辞；系统会统一添加“我理解你想将创作需求调整为：”和后续资料提示。"
            : "summary 只概括你对老师创作需求的理解，不使用“建议”“已确认”“已确定”等措辞；系统会统一添加“我理解你的创作需求是：”。",
          "老师提到任何作品、IP、真实人物、历史事件、知识主题或其他来源时，summary 必须明确说明该来源在故事中如何使用，不能只写“基于”或“参考”。作品与 IP 需要说明是使用原作世界和核心角色创作新剧情，还是忠实讲述已给出的原剧情；真实人物与历史事件需要说明事实叙事和适龄改编边界；知识主题需要说明知识如何通过故事事件呈现。",
          "summary 不得向老师播报“不继续追问”“正在分析”“系统将处理”等内部流程。需求对齐阶段尚未判断是否需要背景资料，不能承诺确认后立刻展示方向或大纲。planningMode 为 explore_options 时以“确认后，我会准备 3 个不同的故事方向；如需背景资料，会先整理必要内容。”收尾；为 follow_defined_plot 时以“确认后，我会准备故事大纲；如需背景资料，会先整理必要内容。”收尾。",
          "只返回 JSON：{status, planningMode, storyMode, classroomPresence, requiredNamedCharacters, assistantMessage, resolvedUnderstanding, unresolvedIssues, questions, summary?}。status 只能是 needs_clarification 或 ready_for_confirmation；planningMode 只能是 explore_options 或 follow_defined_plot；storyMode 只能是 faithful 或 new_story；classroomPresence 只能是 observer、participant 或 absent；requiredNamedCharacters 必须是字符串数组。",
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
              "expectedSchema: {status:'needs_clarification'|'ready_for_confirmation',planningMode:'explore_options'|'follow_defined_plot',storyMode:'faithful'|'new_story',classroomPresence:'observer'|'participant'|'absent',requiredNamedCharacters:string[],assistantMessage:string,resolvedUnderstanding:string[],unresolvedIssues:string[],questions:array,summary?:string}",
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
        return { ...direction, classroomValue: "", seedPrompt: direction.hook };
      });
    },
    reviseDirection: async (input: StoryPromptContext & { task: string; direction: unknown }) => {
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
          ...chapterRevisionNarrativeRules(input),
          "修改知识点建议时仍需从全课分布判断：先完成本章故事，再只推荐与既有剧情自然适配且能在同一语境中共存的知识点；通常推荐 2 个、最多 3 个，只有确实找不到自然组合时才保留 1 个。不得为知识点新增道具、规则、人物行为或支线，不为平均分配强行组合。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。",
          ...confirmedReferenceRules(input),
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
      const title = bilingualChapterTitle(chapter.title);
      const whatHappens = proseValue(chapter.whatHappens);
      if (!title || !whatHappens) throw new StoryOutlineResponseError("章节修改返回的内容结构不完整，请重试本步");
      return {
        status: "ready" as const,
        chapter: {
          order: Number(chapter.order) || input.chapterOrder,
          title,
          whatHappens: canonicalizeClassroomNames(whatHappens, input.coursePeople),
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
      durationMinutes?: 30 | 45 | 60;
      selectedKnowledgePoints?: Array<{ id: string; label: string; category?: string }>;
    }) => {
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
          "summary 使用 3–4 个自然短句，按故事自身顺序讲清起点、关键发展、决定性行动和最终结果；故事没有某类环节时不要强行补齐。每句都有清楚的行动者、具体动作或局面变化，不得用“情况发生变化”“重新判断”“经历挑战”“大家共同努力”等抽象概括替代关键事件。老师只读 summary 就应能快速复述主线。",
          "每章 whatHappens 写成 2–4 个自然短句，语义完整优先于凑固定句数。讲清从上一章承接的具体局面、本章必要行动、这些行动造成的直接结果，以及结果怎样影响后续；每句话只表达一个主要事件，不显示结构标签，也不把命令、发现、选择、移动和结果塞进同一句。大纲只规定核心事件，不写正式对话或环境描写。",
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
          "全部章节剧情完成后再从全课视角统一规划知识点分布。每章至少推荐 1 个知识点；recommendedKnowledgePointKeys 只能逐字复制“全课可选知识点”中的 key（例如 KP1），不要返回数据库 id、知识点名称或自行创造 key。",
          "推荐数量使用软容量基准：通常每章推荐 2 个知识点，每章最多 3 个；只有本章确实找不到两个能够自然共存的表达语境时才保留 1 个，不要默认每章只选 1 个。",
          ...(knowledgePointCoverageTarget ? [`知识点覆盖软基准：全课优先覆盖 ${knowledgePointCoverageTarget} 个不同知识点。这是自然适配后的选择目标，不是必须凑满的硬校验；无法自然使用时允许少于该数量，也不得为达到数量改写剧情。`] : []),
          "知识点分布优先考虑本章表达适配性、同章知识点能否在同一语境中自然共存、英语难度与课程时长承载能力，再覆盖老师选择的多样知识点；不得为了平均分配强行组合。同一知识点可以在多章复用，但复用不应挤占其他同样自然适配的知识点。knowledgePointRecommendationSummary 用一条精简中文逐个引用对应 KP 短键并说明使用语境；多个知识点还要说明如何自然配合，无法说明时不要同时推荐。不要生成词数、题型或题量。",
          input.storyMode === "faithful"
            ? "忠实讲述的优先级为：已确认事实及原作事件、因果和结局；老师在该边界内明确的讲述范围与呈现要求；已选择方向；当前大纲；通用写作建议。任何要求都不能把课堂人物变成事件推动者。"
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
          }),
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
        return {
          order,
          title: chapterTitle,
          storyGoal: canonicalizeClassroomNames(whatHappens, input.coursePeople),
          keyEvents: [characterActions, mainlineProgress, ...keyEvents]
            .filter(Boolean)
            .map((item) => canonicalizeClassroomNames(item, input.coursePeople)),
          setting: canonicalizeClassroomNames(proseValue(chapter.setting), input.coursePeople),
          endingHook: canonicalizeClassroomNames(proseValue(chapter.endingHook), input.coursePeople),
          whatHappens: canonicalizeClassroomNames(whatHappens, input.coursePeople),
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
        summary: canonicalizeClassroomNames(summary, input.coursePeople),
        storyHook: canonicalizeClassroomNames(proseValue(parsed.storyHook), input.coursePeople),
        characters,
        chapters,
      };
    },
  };
}
