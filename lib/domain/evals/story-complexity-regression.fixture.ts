import type { EnglishLevel, StoryComplexity } from "@/lib/contracts/api";

export type RegressionContentMode =
  "narrative" | "concept" | "factual" | "faithful";

export type StoryComplexityRegressionCase = {
  id: string;
  origin: "historical" | "constructed";
  label: string;
  contentMode: RegressionContentMode;
  englishLevel: EnglishLevel;
  storyComplexity: StoryComplexity;
  chapterCount: number;
  participantPattern: "single" | "ensemble" | "eight_students";
  tags: string[];
  hardRequirements: string[];
  sample: {
    hook: string;
    summary: string;
    chapterWhatHappens: string;
    storyHighlight: string;
    growthCore: string;
    estimatedEnglishWordsPerChapter: number;
  };
  semanticReview: {
    reviewedBy: "codex_task_semantic_review_2026-08-27";
    requirementsPreserved: true;
    classificationAndFidelityPreserved: true;
    teacherCanRetell: true;
    complexityIsAnUpperBound: true;
    noMechanicalTwist: true;
    growthFeelsNatural: true;
    englishCapacitySufficient: true;
    note: string;
  };
};

type CaseInput = Omit<StoryComplexityRegressionCase, "semanticReview"> & {
  reviewNote: string;
};

function regressionCase(input: CaseInput): StoryComplexityRegressionCase {
  const { reviewNote, ...value } = input;
  return {
    ...value,
    semanticReview: {
      reviewedBy: "codex_task_semantic_review_2026-08-27",
      requirementsPreserved: true,
      classificationAndFidelityPreserved: true,
      teacherCanRetell: true,
      complexityIsAnUpperBound: true,
      noMechanicalTwist: true,
      growthFeelsNatural: true,
      englishCapacitySufficient: true,
      note: reviewNote,
    },
  };
}

export const historicalStoryRegressionLabels = [
  "冰雪奇缘",
  "小马宝莉",
  "神探夏洛克",
  "哆啦A梦",
  "马斯克",
  "特朗普",
  "荣格",
  "未知网络小说",
  "Jett/Sage",
  "二战",
  "地理知识",
  "美人鱼",
  "四名超级英雄",
  "Call Me By Your Name",
  "MBTI",
  "灰姑娘冲突",
] as const;

export const storyComplexityRegressionCases: StoryComplexityRegressionCase[] = [
  regressionCase({
    id: "h-frozen",
    origin: "historical",
    label: "冰雪奇缘",
    contentMode: "faithful",
    englishLevel: "A2",
    storyComplexity: "clear_linear",
    chapterCount: 4,
    participantPattern: "ensemble",
    tags: ["ip", "fidelity"],
    hardRequirements: ["冰雪奇缘"],
    sample: {
      hook: "冰雪奇缘的姐妹因失控的冰雪分开。妹妹找到姐姐，姐妹用彼此的关心化解危机。",
      summary:
        "冰雪奇缘中的姐姐因害怕伤人而离开。妹妹踏上寻找她的旅程。两人面对冰雪危机并重新理解彼此。姐妹的行动让家园恢复安全。",
      chapterWhatHappens:
        "妹妹抵达冰雪宫殿并说明家园的困境。姐姐仍害怕自己的力量，局面没有立刻解决。",
      storyHighlight: "姐妹关系直接推动冰雪危机的解决。",
      growthCore: "同理心",
      estimatedEnglishWordsPerChapter: 90,
    },
    reviewNote: "忠实边界优先，只压缩表达，不改变原作核心因果。",
  }),
  regressionCase({
    id: "h-pony",
    origin: "historical",
    label: "小马宝莉",
    contentMode: "narrative",
    englishLevel: "A2",
    storyComplexity: "clear_linear",
    chapterCount: 4,
    participantPattern: "ensemble",
    tags: ["ip", "new_story"],
    hardRequirements: ["小马宝莉"],
    sample: {
      hook: "小马宝莉的朋友们发现庆典地图遗失。她们沿着留下的标记找回地图，让庆典按时开始。",
      summary:
        "小马宝莉的庆典地图突然遗失。朋友们沿一条明确路线寻找。她们分工核对标记并在旧仓库找到地图。庆典最终顺利开始。",
      chapterWhatHappens:
        "朋友们在广场找到第一枚标记。她们决定沿标记共同前往旧仓库。",
      storyHighlight: "熟悉角色用各自能力完成同一项寻找任务。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 90,
    },
    reviewNote: "新剧情与原作角色区分清楚，没有复制或篡改既定剧情。",
  }),
  regressionCase({
    id: "h-sherlock",
    origin: "historical",
    label: "神探夏洛克",
    contentMode: "narrative",
    englishLevel: "B2",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "single",
    tags: ["mystery", "information_recovery"],
    hardRequirements: ["神探夏洛克"],
    sample: {
      hook: "神探夏洛克调查一封看似寄错的信。早先被忽略的邮戳与证词相互印证，最终指向故意制造的不在场证明。",
      summary:
        "神探夏洛克收到一封寄错的信。调查中，证人的说法与邮戳时间矛盾。夏洛克重新核对早先的细节，发现寄信人利用转寄制造假象。他用完整证据还原真相。",
      chapterWhatHappens:
        "夏洛克把邮戳与车站记录并列比较。早先无关的时间差成为识破不在场证明的关键。",
      storyHighlight: "同一枚邮戳在结尾获得新的解释。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 170,
    },
    reviewNote: "反转由已铺垫信息回收产生，并未额外叠加第二案件。",
  }),
  regressionCase({
    id: "h-doraemon",
    origin: "historical",
    label: "哆啦A梦",
    contentMode: "narrative",
    englishLevel: "A1",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "ensemble",
    tags: ["ip", "simple_mainline"],
    hardRequirements: ["哆啦A梦"],
    sample: {
      hook: "哆啦A梦借给大雄一件整理道具。大雄学会先分类再使用道具，终于找回作业。",
      summary:
        "哆啦A梦给大雄一件整理道具。大雄急着使用，房间反而更乱。他停下来给物品分类，随后找到作业并收好道具。",
      chapterWhatHappens:
        "大雄发现道具不能替他决定物品的位置。他开始把书本和玩具分开放。",
      storyHighlight: "道具放大了整理方法是否清楚的差别。",
      growthCore: "自我效能",
      estimatedEnglishWordsPerChapter: 80,
    },
    reviewNote: "保持一条直接任务线，失败只是行动结果而非复杂冲突。",
  }),
  regressionCase({
    id: "h-musk",
    origin: "historical",
    label: "马斯克",
    contentMode: "factual",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["real_person", "fact_priority"],
    hardRequirements: ["马斯克"],
    sample: {
      hook: "课程梳理马斯克参与创业与航天项目的公开经历。重点解释目标、工程受挫与后续调整，不虚构私人动机。",
      summary:
        "马斯克参与创办和发展多项科技企业。他把可重复使用火箭视为降低成本的一条路径。项目经历公开记录中的失败后继续测试。课程以可核实节点说明结果与争议。",
      chapterWhatHappens:
        "本章介绍一次公开记录的测试失败及工程团队随后采取的调整。内容只采用已确认资料。",
      storyHighlight: "用可核实工程节点呈现长期目标与迭代。",
      growthCore: "成长型思维",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "真实人物的事实与争议边界优先，复杂度没有被用来补写戏剧。",
  }),
  regressionCase({
    id: "h-trump",
    origin: "historical",
    label: "特朗普",
    contentMode: "factual",
    englishLevel: "B2",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "single",
    tags: ["real_person", "multi_perspective"],
    hardRequirements: ["特朗普"],
    sample: {
      hook: "课程依据已确认资料介绍特朗普的一段公共经历。不同立场被标明来源，结论与评价分开呈现。",
      summary:
        "特朗普在所选时期采取了公开行动。支持者与反对者对影响有不同解释。课程按时间线列出事实，再比较有出处的观点。结尾保留证据能够支持的结论范围。",
      chapterWhatHappens:
        "本章并列两种有来源的评价，并区分共同承认的事实与各自推断。",
      storyHighlight: "事实、观点与推断在同一时间线上清楚分层。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 170,
    },
    reviewNote: "多层来自观点与证据关系，不虚构秘密动机或戏剧性反转。",
  }),
  regressionCase({
    id: "h-jung",
    origin: "historical",
    label: "荣格",
    contentMode: "concept",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["theory", "abstract"],
    hardRequirements: ["荣格"],
    sample: {
      hook: "课程用一个选择情境解释荣格理论中的相关概念。情境只作理解支架，理论含义与适用边界保持优先。",
      summary:
        "学习者先观察同一人在不同情境中的反应。课程引入荣格的相关概念解释这些差异。随后比较概念能说明什么、不能说明什么。结尾回到证据与谨慎使用。",
      chapterWhatHappens:
        "本章通过两个对照反应说明概念差异。例子服务定义，不发展额外剧情。",
      storyHighlight: "同一情境帮助比较抽象概念的边界。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "理论目标优先，故事包装没有取代理论或把概念人格化为因果。",
  }),
  regressionCase({
    id: "h-unknown-novel",
    origin: "historical",
    label: "未知网络小说",
    contentMode: "faithful",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["unknown_source", "fidelity"],
    hardRequirements: ["未知网络小说"],
    sample: {
      hook: "未知网络小说的资料不足，课程只整理老师已经提供的情节。无法确认的角色关系与结局保持未定，不自行补写。",
      summary:
        "老师提供了未知网络小说的一段开端。主角接到任务并遇到一个已知阻碍。现有资料只说明主角作出选择，尚未给出最终结局。大纲明确停在资料边界。",
      chapterWhatHappens:
        "主角面对资料中已经出现的阻碍并作出原文记载的选择。后续结果因资料不足不补写。",
      storyHighlight: "把可用情节与未知部分清楚分开。",
      growthCore: "边界",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "未知来源不触发猜测；忠实边界比完成戏剧结构更重要。",
  }),
  regressionCase({
    id: "h-jett-sage",
    origin: "historical",
    label: "Jett/Sage",
    contentMode: "narrative",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "ensemble",
    tags: ["named_characters", "game_ip"],
    hardRequirements: ["Jett", "Sage"],
    sample: {
      hook: "Jett急于追上目标，Sage则发现队友需要保护。两人调整策略后完成同一任务并安全撤离。",
      summary:
        "Jett先快速追击目标，Sage负责保护队伍。前方路线突然封闭，两人的原计划无法继续。她们交换信息并调整分工。团队完成任务后安全撤离。",
      chapterWhatHappens:
        "路线封闭让Jett无法继续追击。Sage指出安全通道，两人决定先保护队伍再前进。",
      storyHighlight: "速度与保护能力在一次策略调整中互补。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "两名点名角色都推动同一主线，没有被合并或遗漏。",
  }),
  regressionCase({
    id: "h-wwii",
    origin: "historical",
    label: "二战",
    contentMode: "factual",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["history", "multi_perspective"],
    hardRequirements: ["二战"],
    sample: {
      hook: "课程按时间与因果梳理二战中的指定主题。不同地区与群体的经历依据资料并列呈现，不把历史简化为虚构英雄故事。",
      summary:
        "二战由多项长期因素与具体事件共同推动。课程按时间线说明所选战场和社会变化。不同群体在同一事件中承担不同后果。结尾依据史料说明战争结束及其持续影响。",
      chapterWhatHappens:
        "本章从两份已确认资料说明同一事件对不同群体的影响。共同事实与视角差异分别标注。",
      storyHighlight: "一条时间线承载相互关联的多视角证据。",
      growthCore: "同理心",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "多视角不改变史实与既定因果，八章只分担信息而不扩写剧情。",
  }),
  regressionCase({
    id: "h-geography",
    origin: "historical",
    label: "地理知识",
    contentMode: "concept",
    englishLevel: "A2",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "single",
    tags: ["geography", "concept_priority"],
    hardRequirements: ["地理知识"],
    sample: {
      hook: "学生用一张地图理解地理知识中的方向与地形。每一步观察都对应一个明确概念，最后完成路线说明。",
      summary:
        "学生先在地图上找到起点。接着辨认方向和两种地形。学生用这些地理知识选择合适路线。最后，他清楚说明选择依据。",
      chapterWhatHappens:
        "学生比较山地与平原在地图上的标记。他据此选出更合适的路线。",
      storyHighlight: "地图上的一次路线选择串起核心概念。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 90,
    },
    reviewNote: "概念目标清楚，包装保持轻量且没有虚构冲突。",
  }),
  regressionCase({
    id: "h-mermaid",
    origin: "historical",
    label: "美人鱼",
    contentMode: "narrative",
    englishLevel: "Starter",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "single",
    tags: ["fairy_tale", "young_learner"],
    hardRequirements: ["美人鱼"],
    sample: {
      hook: "小美人鱼找到一只迷路的小海龟。她带它穿过珊瑚路，送它回到家。",
      summary:
        "小美人鱼听见小海龟求助。她带小海龟沿珊瑚路游泳。她们找到海龟妈妈。小海龟安全回家。",
      chapterWhatHappens:
        "小美人鱼看见发光的珊瑚标记。她带小海龟沿标记继续前进。",
      storyHighlight: "发光珊瑚组成清楚的海底回家路线。",
      growthCore: "同理心",
      estimatedEnglishWordsPerChapter: 70,
    },
    reviewNote: "Starter 容量下目标、行动、结果完整且不填充。",
  }),
  regressionCase({
    id: "h-four-heroes",
    origin: "historical",
    label: "四名超级英雄",
    contentMode: "narrative",
    englishLevel: "A2",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "ensemble",
    tags: ["four_characters", "ensemble"],
    hardRequirements: ["四名超级英雄"],
    sample: {
      hook: "四名超级英雄护送能源核心，却发现单独使用能力会让核心失衡。他们调整顺序并共同把核心送回城市。",
      summary:
        "四名超级英雄接到护送能源核心的任务。每个人都先按自己的方法行动，核心因此失衡。他们观察变化并重新安排能力顺序。团队最终安全送达核心。",
      chapterWhatHappens:
        "核心因四种能力同时作用而失衡。四名超级英雄停止争抢，开始测试更安全的使用顺序。",
      storyHighlight: "四种能力的先后顺序决定任务成败。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 110,
    },
    reviewNote: "四人各有贡献，但仍围绕一次护送任务而非四条支线。",
  }),
  regressionCase({
    id: "h-cmbyn",
    origin: "historical",
    label: "Call Me By Your Name",
    contentMode: "faithful",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["abstract_emotion", "age_boundary"],
    hardRequirements: ["Call Me By Your Name"],
    sample: {
      hook: "课程以适龄、克制的方式概括Call Me By Your Name中的相遇、情感变化与分别。重点是人物如何理解感受，不扩写亲密细节。",
      summary:
        "Call Me By Your Name中的两人在夏日相识。相处让他们逐渐确认复杂情感。既定环境与选择使关系走向分别。结尾保留人物对这段经历的理解。",
      chapterWhatHappens:
        "两人在共同活动中更坦诚地辨认彼此的感受。既定边界仍然存在，并影响后续选择。",
      storyHighlight: "季节变化承载关系从靠近到分别的节奏。",
      growthCore: "情绪识别",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "抽象情感完整但适龄，忠实结局与边界不因复杂度改变。",
  }),
  regressionCase({
    id: "h-mbti",
    origin: "historical",
    label: "MBTI",
    contentMode: "concept",
    englishLevel: "B2",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "ensemble",
    tags: ["theory", "information_heavy"],
    hardRequirements: ["MBTI"],
    sample: {
      hook: "课程把MBTI作为一种描述偏好的框架来理解。学生比较示例、辨认局限，最后避免把类型当成固定命运。",
      summary:
        "课程先说明MBTI描述的是偏好。学生比较两组行为示例。随后，他们检查类型标签可能忽略的情境差异。结尾强调谨慎解释而非给人定型。",
      chapterWhatHappens:
        "学生比较同一人在两种情境下的不同选择。他们发现单一标签不能解释全部行为。",
      storyHighlight: "同一人的对照例子直接显示框架边界。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "高 CEFR 不强制高故事复杂度；理论边界比包装更重要。",
  }),
  regressionCase({
    id: "h-cinderella",
    origin: "historical",
    label: "灰姑娘冲突",
    contentMode: "faithful",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["fairy_tale", "core_conflict"],
    hardRequirements: ["灰姑娘", "冲突"],
    sample: {
      hook: "灰姑娘冲突来自她想参加舞会却被阻止。帮助出现后，她把握机会前往舞会，既定结局保持不变。",
      summary:
        "灰姑娘想参加舞会，却被家人阻止。她得到原故事中的帮助并前往舞会。时间限制迫使她离开。王子凭留下的信物找到她，故事走向既定结局。",
      chapterWhatHappens:
        "灰姑娘完成要求仍被阻止参加舞会。原故事中的帮助随后出现，为她提供一次行动机会。",
      storyHighlight: "时间限制让愿望、行动与结果紧密相连。",
      growthCore: "自我效能",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "只保留原作核心冲突与因果，不为冲突档位增加新反派或反转。",
  }),

  regressionCase({
    id: "n-gravity-one",
    origin: "constructed",
    label: "一章重力实验",
    contentMode: "concept",
    englishLevel: "Starter",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "single",
    tags: ["gravity", "one_chapter", "self_efficacy"],
    hardRequirements: ["地球引力"],
    sample: {
      hook: "乐乐让球从手中落下。她观察结果，明白地球引力会把物体拉向地面。",
      summary:
        "乐乐举起一个球。她松手后，球落到地面。她再次实验并看到相同结果。乐乐用这个现象说明地球引力。",
      chapterWhatHappens:
        "乐乐松开球并观察它落地。她重复一次，确认地球引力的作用。",
      storyHighlight: "一个可重复动作直接呈现科学概念。",
      growthCore: "自我效能",
      estimatedEnglishWordsPerChapter: 70,
    },
    reviewNote: "一章仍能完成观察、验证与结论，科学概念没有被冒险包装稀释。",
  }),
  regressionCase({
    id: "n-gravity-conflict",
    origin: "constructed",
    label: "月球模型选择",
    contentMode: "concept",
    englishLevel: "A2",
    storyComplexity: "conflict_driven",
    chapterCount: 3,
    participantPattern: "ensemble",
    tags: ["gravity", "strategy_adjustment"],
    hardRequirements: ["重力"],
    sample: {
      hook: "两名学生用错误模型解释月球上的跳跃。实验结果不符合预测后，他们比较证据并调整模型，最终讲清重力差异。",
      summary:
        "两名学生先预测月球跳跃与地球相同。模型实验的结果与预测不符。他们检查变量并调整对重力的解释。新的模型能够说明观察结果。",
      chapterWhatHappens:
        "实验结果与原预测不符。两名学生检查模型，决定先比较不同重力条件。",
      storyHighlight: "一次预测落差推动概念模型的修正。",
      growthCore: "成长型思维",
      estimatedEnglishWordsPerChapter: 110,
    },
    reviewNote: "核心矛盾是证据与预测不符，服务概念而非人为制造人际冲突。",
  }),
  regressionCase({
    id: "n-gravity-layered",
    origin: "constructed",
    label: "轨道信息回收",
    contentMode: "concept",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["gravity", "information_recovery", "abstract"],
    hardRequirements: ["万有引力"],
    sample: {
      hook: "学生起初把轨道理解为没有引力。前面的速度数据在比较模型时重新获得意义，最终说明轨道其实是持续自由落体。",
      summary:
        "学生先用无引力假设解释轨道。速度与方向数据却无法被该假设同时说明。他重新比较两个模型，并回收早先忽略的数据。最终，他用万有引力与切向速度解释轨道。",
      chapterWhatHappens:
        "学生把早先记录的速度方向放回模型。该信息排除无引力假设，并支持持续自由落体的解释。",
      storyHighlight: "早先的速度数据在模型比较中完成信息回收。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "层次来自证据重释，不来自虚构阴谋或第二主线。",
  }),
  regressionCase({
    id: "n-photosynthesis",
    origin: "constructed",
    label: "光合作用观察",
    contentMode: "factual",
    englishLevel: "A1",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "single",
    tags: ["photosynthesis", "science"],
    hardRequirements: ["光合作用"],
    sample: {
      hook: "小雨观察一株植物在光下的变化。她按步骤记录，最后用光合作用的基本事实解释结果。",
      summary:
        "小雨把植物放在有光的位置。她按时观察并记录变化。老师帮助她联系光、水和空气。小雨用光合作用解释观察结果。",
      chapterWhatHappens:
        "小雨比较两次观察记录。她用已学的光合作用条件说明植物的变化。",
      storyHighlight: "连续观察记录连接事实与解释。",
      growthCore: "自我效能",
      estimatedEnglishWordsPerChapter: 80,
    },
    reviewNote: "事实优先且因果克制，没有为故事性虚构植物意图。",
  }),
  regressionCase({
    id: "n-emotion-regulation",
    origin: "constructed",
    label: "比赛前的情绪调节",
    contentMode: "narrative",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "single",
    tags: ["emotion_regulation", "peer_conflict"],
    hardRequirements: ["安安"],
    sample: {
      hook: "安安在比赛前因同伴一句话生气，差点退出。她先辨认情绪并让自己平静，再与同伴说明需要，最终回到比赛。",
      summary:
        "安安误解同伴的提醒并感到生气。冲动让她想离开比赛。她暂停行动，辨认情绪并清楚表达自己的感受。两人澄清后继续合作完成比赛。",
      chapterWhatHappens:
        "安安察觉自己越说越快，于是先暂停并慢慢呼吸。平静后，她向同伴说明那句话带来的感受。",
      storyHighlight: "一次可见的暂停改变了沟通结果。",
      growthCore: "情绪识别",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "调节来自自然行动，不靠旁白说教或强制反转。",
  }),
  regressionCase({
    id: "n-many-events-simple",
    origin: "constructed",
    label: "简单主线的多事件接力",
    contentMode: "narrative",
    englishLevel: "A2",
    storyComplexity: "clear_linear",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["many_events", "simple_mainline", "eight_chapters"],
    hardRequirements: ["送达药箱"],
    sample: {
      hook: "小队要在天黑前送达药箱。他们依次过桥、乘船和走山路，最终按时抵达。",
      summary:
        "小队接到送达药箱的任务。他们沿唯一规划路线依次通过多个地点。每次行动都让药箱更接近目的地。天黑前，药箱安全送到。",
      chapterWhatHappens:
        "小队到达河边并按计划乘船过河。下船后，他们继续沿山路前进。",
      storyHighlight: "多个地点都服务同一个清楚的送达目标。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 90,
    },
    reviewNote: "事件虽多，但没有因此升级为多线叙事或制造额外冲突。",
  }),
  regressionCase({
    id: "n-failure-recovery",
    origin: "constructed",
    label: "失败后的重新选择",
    contentMode: "narrative",
    englishLevel: "B2",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "single",
    tags: ["failure_recovery", "abstract_emotion", "self_efficacy"],
    hardRequirements: ["宁宁"],
    sample: {
      hook: "宁宁在选拔失败后把结果理解成自己没有能力。早先的训练记录帮助她重看进步，她据此选择新的目标并恢复行动。",
      summary:
        "宁宁在选拔中失败，开始否定自己的能力。她回避训练，却再次看到长期记录中的真实进步。宁宁区分一次结果与持续能力，并选择更具体的训练目标。她带着新的判断重新开始。",
      chapterWhatHappens:
        "宁宁重读早先记录，发现失败前已有稳定进步。她据此把笼统的自我否定改成一个可练习的问题。",
      storyHighlight: "同一份训练记录从成绩表变成恢复行动的证据。",
      growthCore: "自我效能",
      estimatedEnglishWordsPerChapter: 170,
    },
    reviewNote: "信息回收服务抽象情感理解，没有安排虚假胜利来证明成长。",
  }),
  regressionCase({
    id: "n-eight-students",
    origin: "constructed",
    label: "八名学生修复温室",
    contentMode: "narrative",
    englishLevel: "B1",
    storyComplexity: "conflict_driven",
    chapterCount: 5,
    participantPattern: "eight_students",
    tags: [
      "eight_students",
      "each_contributes",
      "photosynthesis",
      "eight_chapters",
    ],
    hardRequirements: [
      "Mia",
      "Noah",
      "Lily",
      "Leo",
      "Emma",
      "Jack",
      "Ruby",
      "Ben",
    ],
    sample: {
      hook: "Mia、Noah、Lily、Leo、Emma、Jack、Ruby和Ben共同修复温室。错误方案让植物状况变差后，八人依据各自观察调整同一套光照与供水方案，温室恢复稳定。",
      summary:
        "八名学生要修复温室。Mia和Noah检查光照，Lily与Leo记录水量，Emma和Jack核对叶片，Ruby与Ben整理时间表。第一套方案失败后，他们合并证据并调整。新方案让植物逐步恢复。",
      chapterWhatHappens:
        "Ruby发现时间表与光照记录不一致，Ben重新排列数据。两人的结果帮助全组修正下一轮方案。",
      storyHighlight: "八项可辨识贡献汇入同一次温室方案调整。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote:
      "八人均有可追踪贡献，但不拆成八条支线；光合作用事实仍约束方案。",
  }),
  regressionCase({
    id: "n-history-eight",
    origin: "constructed",
    label: "真实历史多视角档案",
    contentMode: "faithful",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: [
      "real_history",
      "multi_perspective",
      "information_heavy",
      "eight_chapters",
    ],
    hardRequirements: ["史料"],
    sample: {
      hook: "课程沿一条真实历史时间线比较政府记录、士兵书信与平民日记。各资料的视角和局限被保留，结论只到史料能够支持的位置。",
      summary:
        "课程先确定事件的共同时间线。政府记录说明决策，书信与日记呈现不同群体的经历。相互矛盾之处通过来源与写作处境解释。结尾综合史料，同时保留无法确定的问题。",
      chapterWhatHappens:
        "本章对照同一天的两份史料。共同事实被确认，立场造成的描述差异则保留并解释。",
      storyHighlight: "同一时间线让不同史料互相校正而不互相取代。",
      growthCore: "同理心",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "多视角与不确定性来自真实资料，不用虚构角色填补史料空白。",
  }),
  regressionCase({
    id: "n-info-light-event",
    origin: "constructed",
    label: "一章气候信息图",
    contentMode: "factual",
    englishLevel: "B2",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "single",
    tags: ["information_heavy", "event_light", "one_chapter", "geography"],
    hardRequirements: ["气候数据"],
    sample: {
      hook: "学生读取一组气候数据并回答地区为何呈现特定降水模式。过程以信息整理和解释为主，不虚构冒险事件。",
      summary:
        "学生先识别气候数据中的温度与降水模式。随后把模式与纬度、海陆位置和地形联系起来。他比较可能解释并排除证据不足的说法。最后给出有限而清楚的结论。",
      chapterWhatHappens:
        "学生整理气候数据并比较三项地理因素。他用证据选出最能解释降水模式的组合。",
      storyHighlight: "一张信息图承载完整的证据比较。",
      growthCore: "独立判断",
      estimatedEnglishWordsPerChapter: 130,
    },
    reviewNote: "信息多而事件少时仍保持清晰说明，不强行制造剧情。",
  }),
  regressionCase({
    id: "n-peer-boundary",
    origin: "constructed",
    label: "同伴冲突与边界",
    contentMode: "narrative",
    englishLevel: "A1",
    storyComplexity: "clear_linear",
    chapterCount: 3,
    participantPattern: "ensemble",
    tags: ["peer_conflict", "boundary", "emotion_regulation"],
    hardRequirements: ["请先问我"],
    sample: {
      hook: "乐乐没有先问就拿走同伴的画笔。同伴说出“请先问我”，乐乐归还画笔并重新请求，两人继续画画。",
      summary:
        "乐乐拿了同伴的画笔。同伴不开心，并说请先问我。乐乐归还画笔，再礼貌请求使用。两人说好规则后继续画画。",
      chapterWhatHappens:
        "同伴说出请先问我，并说明自己还在使用。乐乐听见后归还画笔。",
      storyHighlight: "一句清楚的边界表达直接改变行动。",
      growthCore: "边界",
      estimatedEnglishWordsPerChapter: 80,
    },
    reviewNote: "同伴冲突保持儿童可理解的直接因果，没有升级成反派关系。",
  }),
  regressionCase({
    id: "n-science-community",
    origin: "constructed",
    label: "社区池塘证据链",
    contentMode: "factual",
    englishLevel: "C1",
    storyComplexity: "layered",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["science", "causal_chain", "information_recovery"],
    hardRequirements: ["溶解氧"],
    sample: {
      hook: "学生调查社区池塘鱼类减少的原因。早期温度、藻类与溶解氧记录在后续比较中形成证据链，结论保持在数据支持范围内。",
      summary:
        "学生记录池塘变化并提出多个解释。单一温度数据不足以确定原因。团队把藻类、时间与溶解氧记录放在一起比较，并排除不符合数据的解释。最终报告给出最有支持的因果链及不确定性。",
      chapterWhatHappens:
        "团队把早期藻类记录与夜间溶解氧数据对齐。时间关系支持一个解释，但他们仍标明尚未测量的变量。",
      storyHighlight: "分散记录在时间轴上组成可检验的证据链。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 180,
    },
    reviewNote: "层次来自科学证据整合；没有把不确定性包装成揭露阴谋。",
  }),
  regressionCase({
    id: "n-four-builders",
    origin: "constructed",
    label: "四人搭桥",
    contentMode: "narrative",
    englishLevel: "A2",
    storyComplexity: "conflict_driven",
    chapterCount: 4,
    participantPattern: "ensemble",
    tags: ["four_people", "strategy_adjustment", "self_efficacy"],
    hardRequirements: ["Ava", "Bo", "Chen", "Dina"],
    sample: {
      hook: "Ava、Bo、Chen和Dina要搭一座模型桥。第一次测试失败后，四人分别检查材料、连接、重量和记录，调整方案后让桥承重成功。",
      summary:
        "Ava、Bo、Chen和Dina共同搭桥。第一次承重测试失败。四人从不同方面检查同一座桥，并找出连接方式的问题。调整后的桥通过测试。",
      chapterWhatHappens:
        "模型桥在测试中断开。Ava与Bo检查材料，Chen和Dina用记录定位连接问题。",
      storyHighlight: "四种检查汇入一次明确的工程调整。",
      growthCore: "成长型思维",
      estimatedEnglishWordsPerChapter: 110,
    },
    reviewNote: "每人有贡献，失败后恢复以可操作证据为基础。",
  }),
  regressionCase({
    id: "n-time-travel-four-students",
    origin: "constructed",
    label: "四名学生时空冒险",
    contentMode: "narrative",
    englishLevel: "A2",
    storyComplexity: "clear_linear",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["time_travel", "simple_mainline", "each_contributes"],
    hardRequirements: ["四名学生", "时空穿越"],
    sample: {
      hook: "四名学生经历时空穿越，来到恐龙时代并寻找散落的三个手表齿轮。大家沿同一条线索合作，修好手表后回到教室。",
      summary: "四名学生被旧手表带到恐龙时代。为了回家，他们依次找回三个齿轮，并用各自的观察和行动避开危险。手表修复后，四人一起返回教室。",
      chapterWhatHappens: "四名学生发现第一个齿轮卡在恐龙脚印旁。他们分工观察路线并安全取回齿轮。",
      storyHighlight: "一条清楚的寻物主线让四名学生都有可见贡献。",
      growthCore: "合作",
      estimatedEnglishWordsPerChapter: 90,
    },
    reviewNote: "五章只展开同一条寻物与返程主线，角色贡献不会膨胀成四条支线。",
  }),
  regressionCase({
    id: "n-faust-two-observers",
    origin: "constructed",
    label: "两名学生见证浮士德",
    contentMode: "faithful",
    englishLevel: "B2",
    storyComplexity: "conflict_driven",
    chapterCount: 5,
    participantPattern: "ensemble",
    tags: ["literature", "fidelity", "observer", "consequences"],
    hardRequirements: ["浮士德", "两名学生"],
    sample: {
      hook: "两名学生作为观察者进入《浮士德》第一部的关键场景。他们见证浮士德的交易、格蕾琴的悲剧与最终选择，理解欲望如何带来无法收回的后果。",
      summary: "两名学生见证浮士德因不满足而与魔鬼交易。他追求格蕾琴，却让她和家人卷入悲剧。来到监狱后，学生看到格蕾琴拒绝逃走并承担自己的选择，故事保留原作的因果与结局。",
      chapterWhatHappens: "浮士德在梅菲斯特的帮助下接近格蕾琴。两名学生只观察事件，不能改变原作人物的决定。",
      storyHighlight: "观察者视角串起原作因果，却不改写关键行动与结局。",
      growthCore: "为选择负责",
      estimatedEnglishWordsPerChapter: 150,
    },
    reviewNote: "B2容量承载核心因果；非图像化处理悲剧内容，同时保持原作人物的决定权。",
  }),
];
