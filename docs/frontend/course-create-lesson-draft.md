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
3. AI 输出薄结构：clean sentences + exercise anchors。
4. AI 不输出最终 blanks、题号、segments、pattern、letterCount、图片字段。
5. 代码负责校验、生成 ids、编译 segments、生成题号和词汇 pattern。
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
  exercises: AiExerciseAnchor[];
};

type AiParagraph = {
  sentences: string[];
};

type AiExerciseAnchor = AiVerbBlankAnchor | AiVocabularyHintAnchor;

type AiVerbBlankAnchor = {
  type: "verb_blank";
  sentenceId: string;
  answer: string;
  prompt: string;
  baseVerb: string;
};

type AiVocabularyHintAnchor = {
  type: "vocabulary_hint";
  sentenceId: string;
  answer: string;
  hint: string;
};

type AiClosingReading = {
  title: string;
  sentences: string[];
  vocabularyTerms: string[];
};
```

### Sentence ID 规则

AI 不在 sentences 内输出 id。代码和 Prompt 共同约定：

```text
c{chapterNumber}p{paragraphNumber}s{sentenceNumber}
```

示例：
- `c1p1s1` = 第 1 章第 1 段第 1 句
- `c1p2s3` = 第 1 章第 2 段第 3 句
- `c2p1s4` = 第 2 章第 1 段第 4 句

每个 exercise 的 `sentenceId` 必须引用真实句子。

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

### Exercise anchor 规则

- `answer` 必须是对应 sentence 的 exact substring。
- `answer` 在该 sentence 中必须只出现一次。
- 同一章不重复使用相同 answer。
- exercises 要分布在两个 paragraph 中。
- `verb_blank` 为主，`vocabulary_hint` 为辅。
- `vocabulary_hint.hint` 必须是中文。
- AI 不输出 pattern / letterCount / label / order，这些由代码生成。

## 练习策略配置

题量和题型比例通过 policy 配置，不写死在业务逻辑里。

默认建议：

| 课程时长 | 每章题量 | verb_blank | vocabulary_hint |
| --- | ---: | ---: | ---: |
| 30 分钟 | 6-8 | 至少 4 | 不超过 2 |
| 45 分钟 | 7-9 | 至少 5 | 不超过 3 |
| 60 分钟 | 8-10 | 至少 6 | 不超过 3 |

`verb_blank` 约占 75%，`vocabulary_hint` 约占 25%。后续可按课程模板或知识点类型调整。

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
  | { type: "text"; text: string }
  | { type: "exercise"; exerciseId: string };

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
- 校验 sentenceId 是否存在
- 校验 answer 是否是 exact substring
- 按 answer 切分 sentence segments
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

## DeepSeek 参数建议

45 分钟及以下：

```json
{
  "model": "deepseek-v4-pro",
  "response_format": { "type": "json_object" },
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "max_tokens": 16000
}
```

60 分钟 / 5 章：

```json
{
  "model": "deepseek-v4-pro",
  "response_format": { "type": "json_object" },
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "max_tokens": 20000
}
```

## 预期耗时

基于测试样例：
- 45 分钟 / 4 章 / 每章 8 题：约 118 秒。
- 产品文案按 1-2 分钟预期展示，复杂任务允许接近 3 分钟。

## 验证重点

- JSON 合法。
- 没有图片字段。
- sentence 中没有 blank / 题号 / Markdown。
- exercises 引用真实 sentenceId。
- answer 是 exact substring。
- 每章题量符合 policy。
- vocabulary_hint hint 为中文。
- 生成的学生阅读文本符合嵌入式题目预期。
