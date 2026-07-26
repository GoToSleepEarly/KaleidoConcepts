import type { CourseBasicDetail, LessonChatAction, LessonChatMessage, LlmModel, PersonProfile } from "@/lib/contracts/api";

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

export type LessonChatIntent = "outline" | "draft" | "revise";

export const outlineActions: LessonChatAction[] = [
  {
    id: "confirm_outline",
    label: "确认并生成最终文案",
    message: "我确认这个故事大纲，请严格基于它生成最终文案。",
    intent: "draft",
  },
  {
    id: "revise_outline",
    label: "修改大纲",
    message: "我想修改这个故事大纲：",
    intent: "outline",
  },
  {
    id: "new_outline",
    label: "换一个方向",
    message: "请基于我的原始想法换一个故事方向，重新生成简单故事大纲。",
    intent: "outline",
  },
  {
    id: "add_reference",
    label: "补充参考信息",
    message: "我补充一些参考信息：",
    intent: "outline",
  },
];

function personName(person: PersonProfile) {
  return person.englishName?.trim() || person.chineseName?.trim() || person.name.trim();
}

function studentNames(students: PersonProfile[]) {
  return students.map(personName).filter(Boolean).join(", ") || "the students";
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

function buildSystemPrompt(context: LessonChatContext) {
  const stages = chapterCount(context.course.durationMinutes);
  const questions = questionCount(context.course.durationMinutes);
  const vocab = vocabCount(context.course.durationMinutes);
  const phrases = phraseCount(context.course.durationMinutes);

  return [
    "You are an expert PBL English reading lesson co-writer for Chinese English teachers.",
    "The product flow is strict: first produce a short story outline for teacher confirmation; only after confirmation produce the final lesson text.",
    "Do not output JSON, HTML, image prompts, internal state names, story modes, content intent blocks, or character visual bible blocks.",
    "",
    "Course constraints:",
    `- Course title: ${context.course.title}`,
    `- English level: ${context.course.englishLevel}`,
    `- Duration: ${context.course.durationMinutes} minutes`,
    `- Stage count: exactly ${stages}`,
    `- Target question count: about ${questions}`,
    `- Vocabulary labels: V1-V${vocab}`,
    `- Verb phrase labels: P1-P${phrases}`,
    `- Grammar targets: ${context.course.grammar.join(" / ") || "choose naturally from the story"}`,
    `- Teacher: ${personName(context.teacher)}`,
    `- Students: ${studentNames(context.students)}`,
    "",
    "Outline rules:",
    "- Keep it short and easy to judge.",
    "- Use these headings exactly: 故事题目, 参考来源, 主要角色, 故事目标, 章节大纲, 课堂适配, 需要确认.",
    "- The chapter outline must contain exactly the required stage count, one sentence per stage.",
    "- If the teacher mentions a source story, historical person, real person, game, IP, or fixed character, explain the intended adaptation boundary in normal user-facing language.",
    "- Do not create exercises, answers, or full reading paragraphs in the outline.",
    "",
    "Final lesson rules:",
    "- Generate only the final lesson content. Do not include the confirmed outline, image prompts, or explanations.",
    "- Start with 【Lesson Draft】.",
    "- Add one line immediately after it: `Story Title: English story title`. This must be the story title, not the course title.",
    "- The opening must begin with `Hello class!` and naturally introduce the teacher, students, story premise, and classroom challenge.",
    "- Use exactly the required number of stages with markers like 【Stage 1】, 【Stage 2】.",
    "- Each stage must contain Title, English Title, Teacher Tip, and 【Reading】.",
    "- Each Reading sentence must be on its own line with labels S1:, S2:, etc. Each S line may contain at most one embedded question.",
    "- Vocab question format: `(1) [V1: d _ _ _ _ _ _ e (提示：伪装，8个字母)]`.",
    "- Phrase question format: `(9) [P1: p _ _ _ _ _ t (提示：保护，7个字母)]`.",
    "- Grammar blank format: `(4) ________ (meet) (提示：过去发生的动作，过去式)`.",
    "- Choice format: `(11) ________ (who / which)`.",
    "- Question numbers must increase continuously from (1). V/P labels must not skip or repeat.",
    "- Add 【Closing Reading】 with S1:, S2:, etc. The closing should summarize the story in 70-100 English words.",
    "- End with 【教师答案区 / Answer Key】 using `1. answer`, one answer per line.",
    "- Do not leak answers in the question hints.",
  ].join("\n");
}

function buildOutlinePrompt(userMessage: string, existingMessages: LessonChatMessage[]) {
  const priorOutline = [...existingMessages].reverse().find((message) => message.role === "assistant" && message.actions?.length)?.content;
  return [
    priorOutline ? "The teacher is revising or replacing this previous outline:" : "The teacher's story idea or starting request is:",
    priorOutline ? priorOutline : userMessage,
    priorOutline ? ["", "Teacher's new request:", userMessage].join("\n") : "",
    "",
    "Produce a simple story outline only. Do not write the final lesson yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDraftPrompt(userMessage: string, currentDraft: string) {
  if (currentDraft.trim()) {
    return [
      "The teacher wants to revise the current final lesson text.",
      "",
      "Teacher request:",
      userMessage,
      "",
      "Current final lesson text:",
      currentDraft,
      "",
      "Output the complete revised final lesson text only. Keep the same clean final lesson format.",
    ].join("\n");
  }

  return [
    "The teacher has confirmed the latest story outline in the chat history.",
    "Generate the final lesson text strictly based on that confirmed outline.",
    "Do not change the main plot, protagonists, reference boundary, or chapter order from the outline.",
    "",
    "Teacher confirmation/request:",
    userMessage,
  ].join("\n");
}

function mockOutline(context: LessonChatContext, idea: string) {
  const stages = chapterCount(context.course.durationMinutes);
  return [
    "故事题目：The Hidden School Challenge",
    `参考来源：${idea.trim() ? "基于老师输入的想法进行课堂化改编。" : "无，原创故事。"}`,
    `主要角色：${personName(context.teacher)}老师，${studentNames(context.students)}，以及一位需要完成挑战的故事主角。`,
    "故事目标：主角需要通过阅读线索、团队讨论和语言任务解决一个逐步升级的问题。",
    "章节大纲：",
    ...Array.from({ length: stages }, (_, index) => `${index + 1}. 第${index + 1}阶段推进一个关键线索，并嵌入适合当前等级的阅读和语法挑战。`),
    "课堂适配：故事结构清晰，方便承载词汇、短语、语法填空和选择题，也便于老师带学生讨论人物选择。",
    "需要确认：无，可直接生成最终文案。",
  ].join("\n");
}

function mockDraft(context: LessonChatContext) {
  const stages = chapterCount(context.course.durationMinutes);
  const teacher = personName(context.teacher);
  const students = studentNames(context.students);
  const lines = [
    "【Lesson Draft】",
    "Story Title: The Hidden School Challenge",
    `Hello class! ${teacher} is opening a special story mission for ${students}. Today, we will read about a hidden school challenge, notice clues from God's Eye view, and practice grammar while the characters learn to be brave.`,
    "",
    "【Lesson Meta】",
    `Level: ${context.course.englishLevel}`,
    `Question Count: ${Math.min(questionCount(context.course.durationMinutes), stages * 5)}`,
    "Vocabulary: V1-V6",
    "Phrases: P1-P2",
    "",
  ];

  let question = 1;
  for (let index = 1; index <= stages; index += 1) {
    lines.push(
      `【Stage ${index}】`,
      `Title: 第${index}个线索`,
      `English Title: Clue ${index}`,
      `Teacher Tip: ${teacher} reminds the class to read each sentence carefully and find the grammar clue.`,
      "【Reading】",
      `S1: The team entered a quiet room and found a ( ${question} ) [V${question}: c _ _ e (提示：线索，4个字母)] on the desk.`.replace("( ", "("),
      `S2: ${students} ( ${question + 1} ) ________ (look) at the map before they made a plan.`.replace("( ", "("),
      `S3: The main character learned to ( ${question + 2} ) [P1: s _ _ _ d b _ (提示：支持，5+2个字母)] a friend in trouble.`.replace("( ", "("),
      "",
    );
    question += 3;
  }

  lines.push(
    "【Closing Reading】",
    "S1: At the end of the story, the class understands that every clue matters.",
    "S2: The characters do not win because they are perfect.",
    "S3: They win because they listen, think, and help each other.",
    "S4: This mission reminds us that learning English can also be a way to become braver.",
    "",
    "【教师答案区 / Answer Key】",
  );
  for (let index = 1; index < question; index += 1) {
    lines.push(`${index}. ${index % 3 === 1 ? "clue" : index % 3 === 2 ? "looked" : "stand by"}`);
  }
  return lines.join("\n");
}

async function callProvider(messages: ProviderMessage[], llmModel: LlmModel, stream: boolean) {
  const isGpt = llmModel === "gpt_5_5" && process.env.QUICKROUTER_API_KEY;
  const apiKey = isGpt ? process.env.QUICKROUTER_API_KEY : process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("AI service is not configured.");

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
  if (!response.ok) throw new Error(data.error?.message ?? `AI request failed: HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function* readStreamingContent(response: Response): AsyncGenerator<string> {
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    throw new Error(data.error?.message ?? `AI request failed: HTTP ${response.status}`);
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
    { role: "system", content: buildSystemPrompt(context) },
    ...messages.slice(-10).map((message): ProviderMessage => ({ role: message.role, content: message.content })),
    { role: "user", content: userPrompt },
  ];
}

export async function generateLessonChatOutline({
  context,
  messages,
  userMessage,
  llmModel,
}: {
  context: LessonChatContext;
  messages: LessonChatMessage[];
  userMessage: string;
  llmModel: LlmModel;
}) {
  if (process.env.QUICKROUTER_API_KEY === "mock" || process.env.DEEPSEEK_API_KEY === "mock") {
    return mockOutline(context, userMessage);
  }

  const response = await callProvider(providerMessages(context, messages, buildOutlinePrompt(userMessage, messages)), llmModel, false);
  return readFullContent(response);
}

export async function* streamLessonChatDraft({
  context,
  messages,
  userMessage,
  currentDraft,
  llmModel,
}: {
  context: LessonChatContext;
  messages: LessonChatMessage[];
  userMessage: string;
  currentDraft: string;
  llmModel: LlmModel;
}) {
  if (process.env.QUICKROUTER_API_KEY === "mock" || process.env.DEEPSEEK_API_KEY === "mock") {
    const draft = mockDraft(context);
    for (let index = 0; index < draft.length; index += 24) {
      await new Promise((resolve) => setTimeout(resolve, 12));
      yield draft.slice(index, index + 24);
    }
    return;
  }

  const response = await callProvider(providerMessages(context, messages, buildDraftPrompt(userMessage, currentDraft)), llmModel, true);
  yield* readStreamingContent(response);
}
