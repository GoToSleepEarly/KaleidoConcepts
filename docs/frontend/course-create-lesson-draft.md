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
6. 前端 MVP 只展示最终拼接好的带题阅读文本和答案列表，不做复杂编辑和模式切换。

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

## 前端 MVP 行为

入口：

- `/courses/:id/create/lesson-draft`

未生成：

- 显示生成按钮。
- 点击后调用 `POST /api/courses/:id/lesson-draft/generate`。
- 生成中显示阶段进度：
  - 规划英文阅读结构
  - 生成故事正文与互动题
  - 校验题目锚点
  - 保存草稿

已生成：

- 顶部按章节切换。
- 主区域展示最终拼接好的带题阅读文本。
- 右侧或下方展示本章答案列表。
- Closing Reading 单独展示，不带题。
- 不提供学生版/答案版切换。
- 不提供复杂 segment 编辑。
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

## 实现状态

- 状态：已实现，待真实 DeepSeek 样例验收。
- 最终数据库结构保持 `lesson_content_v1`，Step 4 继续读取编译后的 `sentence.text`。
- 验证命令：`pnpm test`。
- 定向校验：`pnpm exec eslint lib/server/ai/lesson-content-compiler.ts lib/server/ai/lesson-draft-generator.ts`。
- 提交号：待提交。
