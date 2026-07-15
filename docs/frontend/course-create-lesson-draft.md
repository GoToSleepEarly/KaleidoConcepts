# 新建课程 Step 3：英文互动阅读草稿模块说明

## 模块目标

本模块覆盖新建课程流程第三步：基于 Step 2 已选择的中文故事大纲，一次性生成完整英文互动阅读草稿。

Step 3 负责：

- 英文故事正文
- 嵌入式练习题锚点
- 答案
- closing reading

Step 3 不负责：

- 图片分镜
- visual style
- character visual lock
- image prompt
- 页面分页
- HTML / PDF

图片、绘本页面和生图资源统一移到 Step 4，根据 Step 3 最终 clean text 生成。

## 本期重构目标

针对 MVP 反馈“Step3 耗时和稳定性严重问题”，本期将 Step 3 从“正文 + 练习 + 图片分镜 + 视觉描述”的混合生成，收敛为“英文互动阅读内容生成”。

核心变化：

1. AI 一次性生成整篇英文阅读内容，保证故事连贯。
2. AI 输出 JSON，不输出 Markdown。
3. AI 只输出一份句子片段结构；练习答案本身就是原文片段，不再单独引用 sentenceId。
4. AI 不输出最终 blanks、题号、sentenceId、segments、pattern、letterCount、图片字段。
5. 代码从同一份片段结构派生 clean sentence、exercise、segments、题号和词汇 pattern。
6. 前端展示最终拼接好的带题阅读文本和答案列表，并支持文字级编辑（章节标题 / 正文文字 / 答案 / 提示 / closing），不改变题目数量与结构。

## 输入边界

必须读取：

- Step 1 课程基础信息
- 老师和学生人物画像
- Step 2 已选择的中文故事大纲：`storyline` 与每章 `summary`

对齐规则：

- `sourceStoryOptionId` 必须等于课程已选择的故事方案 id
- 章节数量必须等于 Step 2 选中方案的章节数量
- 每章必须对应 Step 2 的同序号章节
- 每章英文正文扩写 Step 2 该章的 `summary`，并服务全局 `storyline`
- 知识点来自 Step 1，不再读取 Step 2 的知识点字段
- 不重新设计主线，不改变章节顺序，不新增主要角色

## AI 输出结构

AI 返回的是中间计划 `AiLessonContentPlan`，不是最终数据库结构。

```ts
type AiLessonContentPlan = {
  title: string;
  chapters: AiLessonChapter[];
  closingReading: AiClosingReading;
};

type AiLessonChapter = {
  title: string;
  paragraphs: [AiParagraph, AiParagraph];
};

type AiParagraph = {
  sentences: AiSentence[];
};

type AiSentence = {
  parts: AiSentencePart[];
};

type AiSentencePart =
  | { type: "text"; text: string }
  | {
      type: "given_word_blank";
      answer: string;
      target: string;
      prompt: string;
      baseWord?: string;
    }
  | {
      type: "choice_blank";
      answer: string;
      target: string;
      choices: string[];
    }
  | {
      type: "vocab_hint";
      answer: string;
      hint: string;
    }
  | {
      type: "phrase_hint";
      answer: string;
      hint: string;
    };

type AiClosingReading = {
  title: string;
  sentences: string[];
};
```

### 单一事实来源

AI 不输出 sentenceId，也不在独立数组中重复 answer。代码按章节、段落和句子顺序生成 sentenceId，并将所有 part 拼接为 clean sentence：

```ts
const cleanSentence = sentence.parts
  .map((part) => (part.type === "text" ? part.text : part.answer))
  .join("");
```

同一份 part 同时决定原文内容、答案和挖空位置，因此不存在答案与原文不同步的问题。最终编译出的 `sentence.text` 继续作为 Step 4 生图语义的 clean text。

### Clean sentence 规则

story sentence 必须是完整英文句子，不允许包含：

- `(1)`、`(2)` 等题号
- `________`
- `[V1]`
- Markdown
- HTML
- 答案标签

错误示例：

```text
Yesterday morning, Ms. PAN ________ (leave) the school quietly.
```

正确示例：

```text
Yesterday morning, Ms. PAN left the school quietly.
```

### Exercise part 规则

- 每个 sentence 最多包含一个 exercise part，从结构上禁止 overlap。
- `answer` 作为 exercise part 直接参与 clean sentence 拼接。
- `targetCategory` 不由 AI 输出；代码根据题型和知识点派生。
- `vocab_hint` 和 `phrase_hint` 的 target 分别固定由代码生成 `Vocabulary` 和 `Verb Phrases`。
- `answer` 在拼接后的 sentence 中必须只出现一次。
- 同一章不重复使用相同 answer；比较时忽略大小写并合并空白。
- exercises 要分布在两个 paragraph 中。
- `verb_blank` 为主，`vocabulary_hint` 为辅。
- `vocabulary_hint.hint` 必须是中文。
- AI 不输出 pattern / letterCount / label / order，这些由代码生成。

## 练习策略配置

Prompt 要求 AI 每章输出 8 题并在返回前逐章自检：

- `given_word_blank`：6 题
- `vocab_hint`：1 题
- `phrase_hint`：1 题
- 本版本不要求 AI 输出 `choice_blank`

代码不硬性校验上述精确比例，仅拒绝极端题量：每章少于 4 题或多于 10 题。

### 课文长度与时态

- 不区分课程时长，Prompt 目标为每章 120-160 个英文词。
- 后端按 `text.text + exercise.answer` 拼接后的真实正文计数，只在明显偏离时拒绝：少于 100 词或多于 180 词。
- AI 根据故事和动态知识点选择主要叙事时态；非对话旁白保持连贯，只在时间关系或语义需要时切换。
- 对话可以自然使用其他时态，不能仅为制造题目而切换旁白时态。
- Closing Reading 由 Prompt 要求生成约 150 个英文词，建议范围 130-170 词；代码不做词数硬校验。

题量规范不随课程时长变化。

## 后端编译结构

代码将 `AiLessonContentPlan` 编译为数据库结构 `lesson_content_v1`。

```ts
type LessonContentDraft = {
  schemaVersion: "lesson_content_v1";
  sourceStoryOptionId: string;
  generationMode: "ai";
  title: string;
  language: "en";
  chapters: LessonContentChapter[];
  closingReading: LessonClosingReading;
};

type LessonContentChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  paragraphs: LessonParagraph[];
  exercises: LessonExercise[];
};

type LessonParagraph = {
  id: string;
  order: 1 | 2;
  sentences: LessonSentence[];
};

type LessonSentence = {
  id: string;
  text: string;
  segments: LessonSegment[];
};

type LessonSegment =
  { type: "text"; text: string } | { type: "exercise"; exerciseId: string };

type LessonExercise =
  | {
      id: string;
      order: number;
      type: "verb_blank";
      sentenceId: string;
      answer: string;
      prompt: string;
      baseVerb: string;
    }
  | {
      id: string;
      order: number;
      type: "vocabulary_hint";
      sentenceId: string;
      answer: string;
      hint: string;
      pattern: string;
      letterCount: number;
    };

type LessonClosingReading = {
  title: string;
  sentences: string[];
  vocabularyTerms: string[];
};
```

编译职责：

- 生成 chapter / paragraph / sentence / exercise id
- 从 sentence parts 派生 clean sentence
- 将 exercise part 直接编译为 sentence segments
- 校验一句最多一题、同章 answer 唯一
- 生成题号 `order`
- 生成 vocabulary pattern，例如 `destiny -> d _ _ _ _ _ y`
- 生成 `letterCount`
- 生成学生版阅读文本
- 生成答案列表
- 给 Step 4 提供 clean text

## 前端行为

入口：

- `/courses/:id/create/lesson-draft`

进入页面先拉取生成状态与草稿：`GET /api/courses/:id/lesson-draft`，响应含 `draft` 与 `generation` 两块（见下方 API 合同）。据此进入三种界面之一：未生成 / 生成中 / 已生成。

未生成（`generation.status = "idle"` 且无 draft）：

- 显示生成按钮。
- 点击后调用 `POST /api/courses/:id/lesson-draft/generate`。
- 请求返回后立即进入“生成中”界面并开始轮询（不再依赖前端本地 `isGenerating`）。

生成中（`generation.status = "running"`，参见 Bug3 恢复方案）：

- 显示阶段进度：
  - 规划英文阅读结构
  - 生成故事正文与互动题
  - 校验题目锚点
  - 保存草稿
- 进度按 `generation.startedAt` 到当前时间的真实间隔推算，刷新页面后进度不清零。
- 前端每 5 秒轮询 `GET /api/courses/:id/lesson-draft`；`status` 变为 `succeeded` 后停止轮询并展示草稿，变为 `failed` 后停止轮询并展示错误与“重新生成”。
- 刷新 / 关闭标签页 / 切走再回来都不影响服务端生成，回来后读到 `running` 继续轮询，不会重复触发付费生成。

已生成（存在 draft）：

- 顶部按章节切换。
- 主区域展示最终拼接好的带题阅读文本，支持文字级编辑（见 Bug4 方案）。
- 右侧或下方展示本章答案列表，支持编辑答案与提示。
- Closing Reading 单独展示，不带题，支持编辑标题与正文。
- 不提供学生版/答案版切换。
- 不改变题目数量、题型与嵌入位置（编辑仅限文字）。
- 不显示图片提示编辑。
- 显示提示：图片将在资源生成步骤根据最终正文自动生成。
- 点击进入资源生成。

### 学生阅读文本渲染

`verb_blank` 渲染：

```text
(1) ________ (leave)
```

`vocabulary_hint` 渲染：

```text
(4) [V1: d _ _ _ _ _ y（提示：天命/使命，7个字母）]
```

答案列表示例：

```text
1. left
2. had already sent
3. has just recorded
4. destiny
```

## Step 4 边界

Step 4 后续升级为“绘本页面与图片资源生成”：

- 读取 Step 3 clean text
- 设计页面结构
- 总结每页画面
- 生成 visualStyle
- 生成角色视觉一致性
- 生成 image prompt
- 调用图片模型
- 生成 Preview/PDF 所需资源

Step 4 不应读取学生版挖空文本作为图片语义来源。

## DeepSeek 参数

Step 3 默认开启 thinking 以保证长篇故事和练习质量，并提高输出预算避免推理内容挤占最终 JSON：

```json
{
  "model": "deepseek-v4-pro",
  "response_format": { "type": "json_object" },
  "thinking": { "type": "enabled" },
  "reasoning_effort": "medium",
  "max_tokens": 48000
}
```

仅在本地排障时可显式配置 `DEEPSEEK_THINKING=disabled`：

```json
{
  "model": "deepseek-v4-pro",
  "response_format": { "type": "json_object" },
  "thinking": { "type": "disabled" },
  "temperature": 0.2,
  "max_tokens": 48000
}
```

## 预期耗时

基于测试样例：

- 目标是在 Pro thinking 模式下减少无效深度推理；真实耗时需重新采样记录。
- 产品生成进度按约 5 分钟展示，超过 5 分钟后保持等待状态并继续显示实际耗时。

## 验证重点

- JSON 通过运行时 Schema 校验，错误可定位到具体字段路径。
- 没有图片字段。
- sentence 中没有 blank / 题号 / Markdown。
- sentenceId 全部由代码生成。
- answer、原文内容和挖空位置来自同一个 exercise part。
- 每句最多一题，同章答案不重复。
- 每章题量优先符合 policy 建议，且不超出 4-10 题安全边界。
- 每章 clean text 目标为 120-160 个英文词；后端安全边界为 100-180 词。
- 非对话旁白的叙事时态保持连贯。
- vocabulary_hint hint 为中文。
- 生成的学生阅读文本符合嵌入式题目预期。

## 变更记录：生成刷新可恢复（Bug 3 修复）

背景：Step 3 生成是同步阻塞请求（`POST .../generate` 内直接 `await generateLessonDraft`，约 5 分钟）。前端“生成中”只存于本地 `isGenerating` state，一旦刷新 / 切标签页，`isGenerating` 归 false，`GET .../lesson-draft` 又还没有 draft，界面就退回“生成阅读草稿”按钮，误导老师再点一次，重复消耗 DeepSeek 费用。

产品决策：服务端持续生成 + 持久生成状态 + 前端轮询恢复 + 超时释放，参考 Step 4 图片 `submitting/generating` + `submittingTimeoutMs` 的成熟模式，不引入 Worker / MQ / WebSocket（遵循 MVP 单体约束）。

### 数据结构（新增持久生成状态）

在 `Course` 上新增生成状态字段（不新增独立表，生成状态与课程 1:1，随课程级联删除，且清空重做时天然一起清）：

```prisma
model Course {
  // ...existing fields
  lessonDraftGenStatus   LessonDraftGenStatus @default(idle)
  lessonDraftGenStartedAt DateTime?
  lessonDraftGenError     String?
}

enum LessonDraftGenStatus {
  idle
  running
  succeeded
  failed
}
```

说明：

- `idle`：从未生成或已被清空重做（Bug2 清空下游会把状态重置回 `idle`）。
- `running`：服务端正在生成，`lessonDraftGenStartedAt` 记录开始时间，供前端推算真实进度与超时判断。
- `succeeded`：生成成功且 draft 已落库（`CourseLessonDraft` 存在即等价成功，`succeeded` 只是冗余标记，读时以 draft 是否存在为准）。
- `failed`：生成失败或超时释放，`lessonDraftGenError` 记录原因，供前端展示并允许重新生成。
- 字段变更走 Prisma migration，服务器仅 `pnpm prisma:deploy`（遵循 AGENTS.md）。

### 服务端持续生成 + 超时释放

`POST /api/courses/:id/lesson-draft/generate`（重构为“启动生成”，不再阻塞到完成）：

1. 幂等前置：若已有 draft，直接返回 `{ draft, generation: { status: "succeeded" } }`。
2. 领取生成锁（乐观并发，防重复付费）：`updateMany({ where: { id, lessonDraftGenStatus: { in: ["idle", "failed"] } }, data: { lessonDraftGenStatus: "running", lessonDraftGenStartedAt: now(), lessonDraftGenError: null } })`。
   - 若 `count === 0`，说明已有生成在 `running`（或竞态），直接返回当前状态 `202 { generation: { status: "running", startedAt } }`，不重复调用 DeepSeek。
3. 领锁成功后，在服务端进程内以“后台任务”方式执行生成（`void (async () => { ... })()`，不 `await`），请求立即返回 `202 { generation: { status: "running", startedAt } }`：
   - 成功：`saveLessonDraft`（复用现有校验），再 `update` 课程 `lessonDraftGenStatus = "succeeded"`。
   - 失败：`update` 课程 `lessonDraftGenStatus = "failed"`、`lessonDraftGenError = message`。
   - 说明：Next.js 单体在单实例内可让 async 任务在响应返回后继续跑；进程被杀（重启 / dev reload）会中断，靠下面的超时释放兜底。

`GET /api/courses/:id/lesson-draft`（读时顺带做超时释放，参考 `recoverStuckImages`）：

- 读课程生成状态与 draft。
- 若 `lessonDraftGenStatus = "running"` 且 `now - lessonDraftGenStartedAt > lessonDraftGenTimeoutMs`（默认 900000ms，`LESSON_DRAFT_GEN_TIMEOUT_MS` 可配，取值高于生成真实耗时），把状态释放为 `failed`、`lessonDraftGenError = "生成超时未完成，请重新生成"`，避免僵死在“生成中”。释放是读操作里的写，无副作用（未产生 draft，不涉及付费重复）。
- 返回 `{ draft, generation: { status, startedAt, error } }`。

### 失败恢复策略

- 刷新 / 关标签页：服务端生成不受影响，前端回来读到 `running` 继续轮询。
- 进程被杀导致僵死：`running` 超过超时阈值后被 GET 释放为 `failed`，前端展示错误并允许重新生成，不会重复付费（因为没有产生 draft，重新生成是全新一次）。
- 生成失败：状态置 `failed` + 原因，前端可一键重新生成。
- 已有 draft 后再点生成：被步骤 1 幂等拦截，不会重复付费。

### 前端改动（`lesson-draft-manager.tsx`）

- 删除“仅靠本地 `isGenerating` 判断生成中”的逻辑；界面态由 `GET` 返回的 `generation.status` + `draft` 驱动。
- 进入页面 / 刷新：`GET` 后若 `status = "running"` 直接进入“生成中”界面并启动 5 秒轮询；`succeeded`/有 draft 进入已生成；否则进入未生成。
- `generateDraft`：`POST` 后不等待完成，收到 `202` 立即进入“生成中”并启动轮询。
- 进度条基于 `generation.startedAt` 到 `Date.now()` 的真实间隔推算（沿用现有 `generationStages` 与 `estimatedTotalMs`），刷新后进度不归零。
- 轮询到 `failed` 停止并展示 `generation.error` + “重新生成”；到有 draft 停止并展示草稿。

### API 合同变更（Bug 3）

`GET /api/courses/:id/lesson-draft` 响应：

```ts
{
  draft: LessonDraft | null;
  generation: {
    status: "idle" | "running" | "succeeded" | "failed";
    startedAt: string | null; // ISO，running 时用于推算进度与超时
    error: string | null;     // failed 时的原因
  };
}
```

`POST /api/courses/:id/lesson-draft/generate` 响应：

- 已有 draft：`200 { draft, generation: { status: "succeeded", startedAt, error: null } }`
- 新启动 / 已在生成：`202 { draft: null, generation: { status: "running", startedAt, error: null } }`
- 失败（前置条件不满足等）：沿用现有 400 / 404 错误码。

### 验收（Bug 3）

- 点击生成后立即进入“生成中”，请求快速返回（不再阻塞 5 分钟）。
- 生成中刷新页面：仍显示“生成中”，进度按真实耗时继续，不退回生成按钮，不重复调用 DeepSeek。
- 生成完成后刷新：显示已生成草稿。
- 模拟进程中断（手动把 `lessonDraftGenStartedAt` 调早并保持 `running`）：GET 后状态释放为 `failed`，可重新生成。
- `pnpm test` / `pnpm lint` / `pnpm build` 通过；新增生成锁幂等、超时释放的单测。

## 变更记录：草稿文字级编辑（Bug 4 修复）

背景：Step 3 已生成后，`ReadingPanel`、`AnswerPanel`、`ClosingReadingPanel` 全为只读，老师无法修正 AI 生成的错别字、答案或提示。产品决策：支持文字级编辑（章节标题 / 正文文字 / 答案 / 提示 / closing），不改题目数量与结构；保存时后端重算派生字段并复用现有校验。

### 编辑范围

可编辑：

- 章节标题 `chapter.title`。
- 正文中的纯文本片段 `segment.type === "text"` 的 `text`。
- 每题的 `answer`（`given_word_blank` / `choice_blank` / `vocab_hint` / `phrase_hint`）。
- 题目提示类文字：`given_word_blank.prompt`、`vocab_hint.hint` / `phrase_hint.hint`；`choice_blank.choices` 允许改选项文字（不改数量，且必须仍包含 answer）。
- Closing Reading 的 `title` 与 `sentences`。

不可编辑（结构不变）：

- 章节 / 段落 / 句子 / 练习的数量与 id。
- 题型 `type`、题号 `order`、`sentenceId`、segment 的挂载关系。
- `castAliases`、`sourceStoryOptionId`、`schemaVersion` 等元信息。

### 保存时后端重算（单一事实来源）

Bug4 编辑改的是“语义文字”，但 `sentence.text`、`pattern`、`letterCount`、closing `vocabularyTerms` 都是从 answer/parts 派生的。若前端直接把改后的 draft PUT 回来，这些派生字段会与新 answer 脱节。因此保存路径必须复用 `lesson-content-compiler.ts` 的派生逻辑，在后端重算，而不是信任前端传入的派生值：

- 改答案 → 重算所在 `sentence.text`（用 `sentence.parts` 拼接规则：text 取 text，exercise 取 answer）。
- 改答案 → 重算该题 `pattern`（`hintPattern`）与 `letterCount`（`hintLetterCount`）——仅 `vocab_hint` / `phrase_hint` 有这两个字段。
- 改答案 → 重算 closing `vocabularyTerms`（`deriveClosingVocabularyTerms`：取所有 vocab_hint / phrase_hint answer 去重 slice 0,8）。
- 改正文纯文本 → 重算所在 `sentence.text`。
- 重算后仍跑 `validateLessonDraft`（章节数匹配、每句最多一题、同章 answer 去重、题号连续、embeddedCount === 1、closing 非空等），任何破坏结构的编辑都会被拒绝。

实现方式：保存前把 DB 结构“反投影”回可重算的最小结构（或直接在 DB 结构上按 sentence 重新拼 text + 按 exercise 重算 pattern/letterCount + 重算 closing terms），核心是**派生字段一律后端重算，前端传值仅作为可编辑源文字**。改答案须校验新 answer 在拼接后的 sentence 中仍只出现一次、同章不与其它题重复（复用编译器的 `normalizeAnswer` 比较）。

### API 合同（Bug 4）

复用现有 `PUT /api/courses/:id/lesson-draft`：

请求：

```ts
{ draft: LessonDraft }
```

行为：

- 接收前端编辑后的 draft。
- 后端按上面规则重算派生字段。
- 复用 `validateLessonDraft` 校验；不通过返回 `400 { message }`。
- upsert 保存，返回重算并校验后的 draft。

响应：

```ts
{ draft: LessonDraft }
```

失败：

- `400 { message: "课文草稿信息不完整" }`（校验失败，含结构被破坏 / answer 重复 / answer 未出现在句中等）
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿保存失败" }`

### 前端改动（`lesson-draft-manager.tsx`）

- `ReadingPanel`：章节标题、正文纯文本片段改为可编辑（inline 输入 / textarea）；exercise 片段仍以徽标形式展示，其提示 / 选项文字在答案区或就近编辑。
- `AnswerPanel`：每题 answer 可编辑；有 hint 的题可编辑 hint。
- `ClosingReadingPanel`：title 与 sentences 可编辑。
- 编辑维护本地 draft 副本；点击“保存草稿”PUT 全量 draft，成功后用响应（含后端重算结果）刷新本地状态，保证前端看到的 `pattern`/`letterCount`/`text`/`vocabularyTerms` 与后端一致。
- pattern / letterCount / 题号 / segment 结构不提供直接编辑入口（由后端派生）。

### 失败恢复策略（Bug 4）

- 保存失败不改动前端本地编辑内容，可修正后重试。
- 校验失败明确提示原因（如“答案在正文中重复”“该章答案重复”），老师据此修正。

### 验收（Bug 4）

- 改章节标题 / 正文文字 / 答案 / 提示 / closing 后保存成功，刷新后仍在。
- 改某题 answer 后：该句拼接文本、该题 pattern/letterCount、closing 词表随之更新，且前端展示与后端一致。
- 制造非法编辑（answer 与同章其它题重复、answer 不在句中）时保存被拒并给出原因。
- 不出现题目数量 / 题型 / 结构被改的路径。
- `pnpm test` / `pnpm lint` / `pnpm build` 通过；新增“改答案重算派生字段 + 复用校验”的单测。

## 实现状态

- 状态：已实现，待真实 DeepSeek 样例验收。
- 最终数据库结构保持 `lesson_content_v1`，Step 4 继续读取编译后的 `sentence.text`。
- 验证命令：`pnpm test`。
- 定向校验：`pnpm exec eslint lib/server/ai/lesson-content-compiler.ts lib/server/ai/lesson-draft-generator.ts`。
- 提交号：待提交。
