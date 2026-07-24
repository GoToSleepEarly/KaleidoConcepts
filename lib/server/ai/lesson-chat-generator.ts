import type {
  CourseBasicDetail,
  LessonChatMessage,
  LessonChatStoryDirection,
  LlmModel,
  PersonProfile,
} from "@/lib/contracts/api";

type LessonChatContext = {
  course: CourseBasicDetail;
  teacher: PersonProfile;
  students: PersonProfile[];
};

type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
  error?: { message?: string };
};

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
  error?: { message?: string };
};

export type LessonChatIntent = "story_options" | "draft" | "revise";

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function studentNames(students: PersonProfile[]) {
  return students.map(personName).filter(Boolean).join(" 和 ") || "the students";
}

function chapterCount(durationMinutes: number) {
  if (durationMinutes === 30) return 3;
  if (durationMinutes === 60) return 5;
  return 4;
}

function questionCount(durationMinutes: number) {
  if (durationMinutes === 30) return 30;
  if (durationMinutes === 60) return 60;
  return 50;
}

function vocabCount(durationMinutes: number) {
  if (durationMinutes === 30) return 12;
  if (durationMinutes === 60) return 24;
  return 20;
}

function phraseCount(durationMinutes: number) {
  if (durationMinutes === 30) return 3;
  if (durationMinutes === 60) return 6;
  return 5;
}

function hasReferenceStorySignal(text: string) {
  return /《[^》]+》|原作|小说|漫画|动漫|游戏|网文|影视|角色|主角|IP|二创|贺朝|谢俞/i.test(text);
}

function hasVisualDetailSignal(text: string) {
  return /外貌|形象|发型|头发|眼睛|眼神|眼镜|身高|服装|穿着|校服|标志|气质|表情|发色|瞳色|短发|长发|少年|少女|冷静|外向|待补充/.test(
    text,
  );
}

export function shouldRequestVisualAnchorInput({
  message,
  currentDraft,
  webSearchEnabled,
}: {
  message: string;
  currentDraft: string;
  webSearchEnabled: boolean;
}) {
  if (currentDraft.trim()) return false;
  if (webSearchEnabled) return false;
  if (!hasReferenceStorySignal(message)) return false;
  return !hasVisualDetailSignal(message);
}

export function visualAnchorInputRequest(message: string) {
  const quotedWorks = [...message.matchAll(/《([^》]+)》/g)].map((match) => `《${match[1]}》`);
  const scope = quotedWorks.length ? quotedWorks.join("、") : "你提到的第三方故事或角色";
  return [
    `我识别到这次会使用 ${scope}。第三方角色外观现在是进入 Step3 的卡点，否则后续图片很容易返工。`,
    "",
    "请先补充主要第三方角色的稳定形象锚点，例如：",
    "贺朝：高中男生，外向明亮，清爽短发，常带笑意，少年感强。",
    "谢俞：高中男生，冷静疏离，干净短发，眼神锐利，气质克制。",
    "",
    "如果你不确定，可以开启“联网搜索”后重新发送；如果当前链路不能联网，就需要手动补充到足够图片生成使用。",
  ].join("\n");
}

function buildStrictTemplateContract(context: LessonChatContext) {
  const stages = chapterCount(context.course.durationMinutes);
  const questions = questionCount(context.course.durationMinutes);
  const vocab = vocabCount(context.course.durationMinutes);
  const phrases = phraseCount(context.course.durationMinutes);

  return [
    "你是面向中国英语老师的 PBL 英文阅读教案共创助手。",
    "本轮只产出可预览、可编辑的文本教案。不要输出 JSON、HTML、图片 prompt 或解释性说明。",
    "",
    "必须先内部判断 story_mode：",
    "- original_story：用户没有指定第三方作品、网络人物、游戏人物、真实人物或已有 IP 角色。",
    "- reference_story：用户指定第三方剧情、作品、网络人物、游戏人物、真实人物或已有 IP 角色。第三方人物是故事主角，讲的是别人的故事。",
    "- hybrid_adaptation：Step1 老师/学生进入或改编第三方故事世界，第三方人物可出现。",
    "",
    "全文必须使用以下四块结构：",
    "1. 【Content Intent】必填，写 Theme、Story Mode、Reference、Protagonists、Classroom Cast。",
    "2. 【Character Visual Bible】仅 reference_story / hybrid_adaptation 必填。这里是硬卡点，所有第三方主要角色都必须是“形象状态：已补全”。不得输出“待补充”。",
    "3. 【Lesson Draft】必填，从 Hello class! 开始，严格对齐样例课堂文案。",
    "4. 【教师答案区 / Answer Key】必填，覆盖正文所有题号。",
    "",
    "第三方角色视觉设定规则：",
    "- 只写图片一致性需要的信息：身份、形象状态、稳定特征、可变状态、避免变化。",
    "- 如果用户提供了外观，整理为稳定视觉锚点。",
    "- 如果开启联网且资料可用，基于资料整理视觉锚点。",
    "- 如果没有足够资料，不要继续生成 reference/hybrid 完整教案；先要求用户补充外观。",
    "- 不要承诺复刻官方画风或具体官方图，只做教学插画版本的稳定锚点。",
    "",
    "课堂人物规则：",
    `- 老师：${personName(context.teacher)}`,
    `- 学生：${studentNames(context.students)}`,
    "- original_story 中老师/学生可以是故事行动主角。",
    "- reference_story 中老师/学生必须作为课堂引导者、读者、观察者或讨论者出现，不能替代原作主角。",
    "",
    "强模板要求：",
    `- 阶段数量必须是 ${stages} 个，使用【Stage 1】、【Stage 2】这种标记。`,
    `- 题目总数目标为 ${questions} 道；核心词汇 V1-V${vocab}；关键动词短语 P1-P${phrases}。`,
    "- 开场必须以 `Hello class!` 开头，出现老师名、学生名、故事主题、课堂视角或课堂挑战。",
    "- 每个 Stage 内部依次包含 `Title:`、`English Title:`、`Teacher Tip:`、【Reading】。",
    "- Reading 中每一句单独一行，用 `S1:`、`S2:` 编号；每个 S 行最多 1 道题。",
    "- 词汇题格式：`(1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)]`。",
    "- 短语题格式：`(9) [P1: p _ _ _ _ _ t (提示：保护，7个字母)]`。",
    "- 语法填空格式：`(4) ________ (meet) (提示：过去发生的动作，过去式)`。",
    "- 选择题格式：`(11) ________ (who / which)`。",
    "- V/P 编号不得跳号、重号；题号从 (1) 连续递增。",
    "- Closing 使用【Closing Reading】，内部用 `S1:`、`S2:` 分句，给出 70-100 词英文总结。",
    "- 每个阶段英文正文目标为 120-160 English words。",
    "- 答案区用 `1. answer` 逐条列出，不要把答案泄露在题目提示里。",
    "",
    "课程硬约束：",
    `英语等级：${context.course.englishLevel}`,
    `课长：${context.course.durationMinutes} 分钟`,
    `语法目标：${context.course.grammar.join(" / ") || "由故事自然决定"}`,
    `课程标题：${context.course.title}`,
  ].join("\n");
}

function buildDraftPrompt(message: string, currentDraft: string, context: LessonChatContext, webSearchEnabled: boolean) {
  if (!currentDraft.trim()) {
    return [
      "用户的故事想法、补充信息或生成要求如下：",
      message,
      "",
      webSearchEnabled
        ? "用户已请求联网搜索。如果当前模型链路具备可验证联网能力，请优先依据可靠剧情和角色外观资料生成；如果没有足够外观资料，先追问，不要输出待补充的第三方视觉设定。"
        : "当前未启用联网搜索。第三方角色外观不足时必须先追问用户，不要输出待补充的第三方视觉设定。",
      "",
      "如果信息足够，请直接输出完整文本教案。",
      "如果完全没想法，请不要生成教案，改为建议用户点击“给我 3 个方向”。",
      `必须按 ${chapterCount(context.course.durationMinutes)} 个阶段组织，并尽量达到 ${questionCount(context.course.durationMinutes)} 道嵌入式题目。`,
    ].join("\n");
  }

  return [
    "用户要修改右侧当前文本教案。",
    "",
    "用户修改要求：",
    message,
    "",
    "当前文本教案：",
    currentDraft,
    "",
    "请输出修改后的完整文本教案。不要只输出差异，不要寒暄，不要解释。",
    "必须保留【Content Intent】、【Lesson Draft】、【教师答案区 / Answer Key】。",
    "如果是 reference_story / hybrid_adaptation，必须保留并补全【Character Visual Bible】，所有第三方主要角色形象状态必须是“已补全”。",
  ].join("\n");
}

function buildDirectionsPrompt(message: string, context: LessonChatContext, webSearchEnabled: boolean) {
  return [
    "用户还没有明确故事方向，需要你给 3 个可选方向。",
    "",
    "用户输入：",
    message,
    "",
    webSearchEnabled ? "用户请求联网搜索；如果当前模型不支持真实联网，不要声称已搜索。" : "不要声称已经联网搜索。",
    "",
    "只输出 JSON，格式如下：",
    `{"options":[{"id":"option-1","title":"方向标题","storyline":"120字以内的故事主线","stages":["阶段1","阶段2","阶段3"],"reason":"为什么适合这堂课"}]}`,
    `stages 数量必须是 ${chapterCount(context.course.durationMinutes)}。`,
    "三个方向要有明显差异，但都能自然承载英语阅读、语法和嵌入式练习。",
    "默认给原创方向，不要凭空引入第三方 IP 人物。",
  ].join("\n");
}

function mockDirections(context: LessonChatContext): LessonChatStoryDirection[] {
  const stageTotal = chapterCount(context.course.durationMinutes);
  const baseStages = ["面具与误会", "暗线与试探", "真相与并肩", "选择与成长", "回望与告别"].slice(0, stageTotal);
  return [
    {
      id: "option-1",
      title: "校园伪装与并肩发光",
      storyline: "两个看似不在意学习的少年在课堂、竞赛和误会中逐渐发现彼此真正的能力，最后摘下面具并完成成长。",
      stages: baseStages,
      reason: "贴近样例结构，适合承载人物反差、过去时态、定语从句和成长主题词汇。",
    },
    {
      id: "option-2",
      title: "秘密社团的阅读挑战",
      storyline: "学生进入隐藏在校园里的阅读社团，每完成一轮英文任务，就解开一段关于勇气、友谊和自我认同的线索。",
      stages: baseStages,
      reason: "任务感强，方便把填空、判断、连线和语法选择自然嵌进剧情。",
    },
    {
      id: "option-3",
      title: "错拿成绩单之后",
      storyline: "一次错拿成绩单让主角发现同学长期隐藏真实能力。两人从互相试探到互相保护，在关键考试前完成和解。",
      stages: baseStages,
      reason: "冲突清晰、节奏短平快，适合快速生成完整文本教案。",
    },
  ];
}

function mockDraft(context: LessonChatContext, idea: string) {
  const teacher = personName(context.teacher);
  const students = studentNames(context.students);
  const leadStudent = personName(context.students[0] ?? context.teacher);
  const theme = idea || "校园成长与自我认同";
  return [
    "【Content Intent】",
    `Theme: ${theme}`,
    "Story Mode: original_story",
    "Reference: none",
    `${leadStudent ? `Protagonists: ${leadStudent}` : "Protagonists: classroom students"}`,
    `Classroom Cast: ${teacher}, ${students}`,
    "",
    "【Lesson Draft】",
    `Hello class! 你们最爱的 ${teacher}老师 带着全新的魔法课堂走来啦！✨`,
    `今天，我看到 ${students} 的眼睛亮亮的。原来，你们刚刚走进了一个关于 ${theme} 的校园成长故事。`,
    "",
    `在这堂课里，${teacher}老师会带着 ${students} 获得 “God's Eye View”，温柔地观察人物如何隐藏光芒，又如何勇敢成为自己。`,
    "",
    `本次 ${context.course.englishLevel} 级别的阅读与语法挑战，包含填空、判断、连线与语法选择，共计 ${questionCount(context.course.durationMinutes)} 道题！并内含 ${vocabCount(context.course.durationMinutes)} 个核心词汇 (V1-V${vocabCount(context.course.durationMinutes)}) 和 ${phraseCount(context.course.durationMinutes)} 个关键动词短语 (P1-P${phraseCount(context.course.durationMinutes)})。`,
    "",
    "【Lesson Meta】",
    `Level: ${context.course.englishLevel}`,
    "Question Count: 15",
    "Vocabulary: V1-V9",
    "Phrases: P1-P3",
    "",
    "【Stage 1】",
    "Title: 面具下的少年",
    "English Title: The Student Behind the Mask",
    `Teacher Tip: ${teacher}老师的语法提示：故事的开端发生在过去。`,
    "【Reading】",
    `S1: From our God's Eye view, ${leadStudent} saw a clever (1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)] in the classroom story.`,
    `S2: Some classmates thought the quiet student was an (2) [V2: u _ _ _ _ _ _ _ _ _ _ r (提示：后进生，13个字母)].`,
    `S3: However, ${students} noticed that the student was actually a (3) [V3: t _ p s _ _ _ _ _ t (提示：学霸，3+7个字母)].`,
    `S4: Before the challenge started, ${teacher} (4) ________ (meet) everyone near the board.`,
    `S5: The class became (5) [V4: d _ _ _ _ _ _ _ s (提示：同桌，9个字母)] with the hidden story character in their imagination.`,
    "",
    "【Stage 2】",
    "Title: 匿名对手与无声默契",
    "English Title: Anonymous Rivals and Silent Agreement",
    `Teacher Tip: ${teacher}老师的语法提示：注意定语从句和过去进行时。`,
    "【Reading】",
    `S1: ${leadStudent} found a character (6) ________ (who / which) always made jokes.`,
    `S2: Another character looked cold and (7) [V5: d _ _ _ _ _ t (提示：疏离的，7个字母)].`,
    `S3: ${teacher} turned the scene into an online (8) [V6: c _ _ _ _ _ _ _ _ _ n (提示：竞赛，11个字母)].`,
    `S4: ${students} used (9) [V7: a _ _ _ _ _ _ _ s (提示：匿名的，9个字母)] cards to guess the hidden identities.`,
    `S5: They (10) [P1: c _ _ _ _ _ _ _ d a _ _ _ _ _ t (提示：竞争/对抗-过去式，8+7个字母)] each other in a friendly grammar game.`,
    "",
    "【Stage 3】",
    "Title: 真相揭开，并肩发光",
    "English Title: The Truth Revealed",
    `Teacher Tip: ${teacher}老师的语法提示：注意过去完成时和动词短语。`,
    "【Reading】",
    `S1: Eventually, the hidden truth was (11) [V8: r _ _ _ _ _ _ d (提示：揭露-过去分词，8个字母)] by ${students}.`,
    `S2: ${leadStudent} realized that one character (12) ________ (hide) his talent for a long time.`,
    `S3: Instead of laughing, ${teacher} guided the students to (13) [P2: s _ _ _ d b _ (提示：支持/站在……身边，5+2个字母)] each other.`,
    `S4: The class found a source of (14) [V9: c _ _ _ _ _ e (提示：勇气，7个字母)].`,
    `S5: In the end, ${students} learned to (15) [P3: t _ _ k o _ f (提示：摘下-过去式，4+3个字母)] their own masks.`,
    "",
    "【Closing Reading】",
    "S1: This story is about courage, honesty, and friendship.",
    "S2: The student looked careless at first, yet a bright light was hidden inside.",
    "S3: When the truth appeared, the class did not laugh or judge.",
    "S4: Instead, they stood side by side and became stronger.",
    "S5: The lesson reminds us that real excellence means having the courage to become yourself.",
    "",
    "【教师答案区 / Answer Key】",
    "1. disguise",
    "2. underachiever",
    "3. top student",
    "4. met",
    "5. deskmates",
    "6. who",
    "7. distant",
    "8. competition",
    "9. anonymous",
    "10. competed against",
    "11. revealed",
    "12. had hidden",
    "13. stand by",
    "14. courage",
    "15. took off",
  ].join("\n");
}

function parseDirections(content: string, context: LessonChatContext): LessonChatStoryDirection[] {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return mockDirections(context);

  try {
    const parsed = JSON.parse(match[0]) as { options?: LessonChatStoryDirection[] };
    const stageTotal = chapterCount(context.course.durationMinutes);
    const options = parsed.options
      ?.filter((option) => option.title && option.storyline && Array.isArray(option.stages))
      .slice(0, 3)
      .map((option, index) => ({
        id: option.id || `option-${index + 1}`,
        title: option.title,
        storyline: option.storyline,
        stages: option.stages.slice(0, stageTotal),
        reason: option.reason || "适合承载本课主题、词汇和语法目标。",
      }));
    return options?.length === 3 ? options : mockDirections(context);
  } catch {
    return mockDirections(context);
  }
}

export function supportsLessonChatWebSearch() {
  return process.env.LESSON_CHAT_WEB_SEARCH_ENABLED === "true";
}

async function callProvider(messages: ProviderMessage[], llmModel: LlmModel, stream: boolean) {
  const isGpt = llmModel === "gpt_5_5" && process.env.QUICKROUTER_API_KEY;
  const apiKey = isGpt ? process.env.QUICKROUTER_API_KEY : process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("AI 服务未配置");

  const url = isGpt
    ? "https://api.quickrouter.ai/v1/chat/completions"
    : `${(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`;
  const model = isGpt
    ? process.env.QUICKROUTER_LESSON_CHAT_MODEL ?? process.env.QUICKROUTER_RESPONSES_MODEL ?? "gpt-5.5"
    : process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 16000, stream }),
  });
}

async function readFullContent(response: Response) {
  const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  if (!response.ok) throw new Error(data.error?.message ?? `AI 请求失败：HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function* readStreamingContent(response: Response): AsyncGenerator<string> {
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    throw new Error(data.error?.message ?? `AI 请求失败：HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const payload = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!payload || payload === "[DONE]") continue;

      const parsed = JSON.parse(payload) as StreamChunk;
      if (parsed.error?.message) throw new Error(parsed.error.message);
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

function providerMessages(context: LessonChatContext, messages: LessonChatMessage[], userPrompt: string): ProviderMessage[] {
  return [
    { role: "system", content: buildStrictTemplateContract(context) },
    ...messages.slice(-8).map((message): ProviderMessage => ({ role: message.role, content: message.content })),
    { role: "user", content: userPrompt },
  ];
}

export async function generateLessonChatDirections({
  context,
  messages,
  userMessage,
  llmModel,
  webSearchEnabled,
}: {
  context: LessonChatContext;
  messages: LessonChatMessage[];
  userMessage: string;
  llmModel: LlmModel;
  webSearchEnabled: boolean;
}) {
  if (process.env.QUICKROUTER_API_KEY === "mock" || process.env.DEEPSEEK_API_KEY === "mock") {
    return mockDirections(context);
  }

  const response = await callProvider(
    providerMessages(context, messages, buildDirectionsPrompt(userMessage, context, webSearchEnabled)),
    llmModel,
    false,
  );
  return parseDirections(await readFullContent(response), context);
}

export async function* streamLessonChatDraft({
  context,
  messages,
  userMessage,
  currentDraft,
  llmModel,
  webSearchEnabled,
}: {
  context: LessonChatContext;
  messages: LessonChatMessage[];
  userMessage: string;
  currentDraft: string;
  llmModel: LlmModel;
  webSearchEnabled: boolean;
}) {
  if (process.env.QUICKROUTER_API_KEY === "mock" || process.env.DEEPSEEK_API_KEY === "mock") {
    const draft = mockDraft(context, userMessage);
    for (let index = 0; index < draft.length; index += 24) {
      await new Promise((resolve) => setTimeout(resolve, 12));
      yield draft.slice(index, index + 24);
    }
    return;
  }

  const response = await callProvider(
    providerMessages(context, messages, buildDraftPrompt(userMessage, currentDraft, context, webSearchEnabled)),
    llmModel,
    true,
  );

  yield* readStreamingContent(response);
}
