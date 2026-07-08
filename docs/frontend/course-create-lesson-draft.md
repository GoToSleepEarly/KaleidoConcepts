# 新建课程 Step 3：绘本内容草稿模块说明

## 模块目标

本模块覆盖新建课程流程第三步：基于 Step 2 已选择的故事方案，一次性生成可编辑、可生图、可预览的英文绘本内容草稿。

Step 3 是内容填充，不重新构思故事。

## 输入边界

必须读取：
- Step 1 课程基础信息
- 老师和学生人物画像
- Step 2 已选择的 `StoryOption`

对齐规则：
- `sourceStoryOptionId` 必须等于课程已选择的故事方案 id
- 章节数量必须等于 Step 2 选中方案的章节数量
- 每章必须对应 Step 2 的同序号章节
- 每章正文扩写 Step 2 的 `summary`
- 每章练习服务 Step 2 的 `knowledgeHook`
- 不重新设计主线，不新增主要角色

## 本期产物

生成：
- 英文绘本标题
- 每章英文标题
- 每章 120-180 词英文学生正文
- 每章目标 8-10 个练习点，硬性保存底线为 7-10 个
  - 以 `verb_blank` 为主
  - 搭配 `vocabulary_hint`
  - 不硬性要求固定 7/3 比例
- 每章 2 个图片分镜 / image shot
- 全局视觉风格 `visualStyle`
- 全局人物视觉一致性 `characters`

生成职责边界：
- AI 生成正文内容、正文内联习题标记、人物视觉描述、每段对应的图片分镜语义。
- 代码生成最终 `LessonDraft` 结构，包括 chapter / block / exercise / shot id、block order、exercise display、shot `coveredBlockIds` 和 `imageSlotId`。
- 代码只解析 AI 生成的内联习题标记，不自行选择或补齐习题。
- 分镜内容语义必须来自 AI，因为它直接服务后续绘本图片生成；分镜覆盖范围由代码按段落边界装配，避免 AI 生成机械引用错误。

不生成：
- 教师教案
- 课堂流程
- 图片文件
- HTML / PDF 文件
- 新增 / 删除练习点
- 新增 / 删除分镜

## JSON 结构

```ts
type LessonDraft = {
  schemaVersion: "lesson_draft_v1";
  sourceStoryOptionId: string;
  generationMode: "ai";
  title: string;
  language: "en";
  visualStyle: VisualStyle;
  characters: VisualCharacter[];
  chapters: LessonChapter[];
};

type LessonChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  wordTarget: {
    min: 110;
    max: 130;
  };
  exerciseTarget: {
    verbBlankCount: 7;
    vocabularyHintCount: 3;
  };
  blocks: LessonBlock[];
  exercises: LessonExercise[];
  shots: LessonShot[];
};

type LessonBlock =
  | {
      id: string;
      order: number;
      type: "text";
      text: string;
    }
  | {
      id: string;
      order: number;
      type: "exercise";
      exerciseId: string;
      display: BlankDisplay;
    };

type BlankDisplay =
  | {
      kind: "verb_blank";
      placeholder: "________";
      prompt: string;
    }
  | {
      kind: "vocabulary_hint";
      placeholder: "________";
      pattern: string;
      letterCount: number;
    };

type LessonExercise =
  | {
      id: string;
      type: "verb_blank";
      answer: string;
      baseVerb: string;
    }
  | {
      id: string;
      type: "vocabulary_hint";
      answer: string;
      pattern: string;
      letterCount: number;
    };

type LessonShot = {
  id: string;
  order: 1 | 2;
  imageSlotId: string;
  coveredBlockIds: string[];
  characterIds: string[];
  location: string;
  action: string;
  mood: string;
  scenePrompt: string;
  composition: string;
  continuityNotes: string;
};
```

## 页面行为

入口：
- `/courses/:id/create/lesson-draft`

未生成：
- 显示生成按钮
- 点击后调用 `POST /api/courses/:id/lesson-draft/generate`
- 生成中显示阶段进度：
  - 读取故事骨架
  - AI 生成正文和分镜
  - 装配练习结构
  - 校验并保存草稿

已生成：
- 加载并展示草稿
- 顶部按章节 Tab 切换
- 老师可编辑：
  - 绘本标题
  - 章节标题
  - 文本 block
  - 练习答案 / 提示 / base verb
  - 每章 2 个 image shot prompt
- 本期不支持新增 / 删除 block、exercise、shot
- 点击保存调用 `PUT /api/courses/:id/lesson-draft`

## API 合同

### `GET /api/courses/:id/lesson-draft`

响应：

```ts
{
  draft: LessonDraft | null;
}
```

失败：
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿加载失败" }`

### `POST /api/courses/:id/lesson-draft/generate`

行为：
- 读取课程、人物画像、已选择故事方案
- 如果已有草稿，直接返回已有草稿
- 调用 DeepSeek 或本地 mock 获取内容计划
- 将内容计划装配为 `lesson_draft_v1`
- 校验并保存 `lesson_draft_v1`

响应：

```ts
201 {
  draft: LessonDraft;
}
```

失败：
- `400 { message: "请先选择故事方案" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿生成失败" }`

### `PUT /api/courses/:id/lesson-draft`

请求：

```ts
{
  draft: LessonDraft;
}
```

响应：

```ts
{
  draft: LessonDraft;
}
```

失败：
- `400 { message: "课文草稿信息不完整" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课文草稿保存失败" }`

## 校验规则

- `schemaVersion` 必须是 `lesson_draft_v1`
- `language` 必须是 `en`
- `sourceStoryOptionId` 必须匹配课程选中的故事方案
- 章节数必须匹配 Step 2
- 每章必须有 7-10 个 exercises
- 每章必须有相同数量的 exercise blocks
- 不硬性校验 `verb_blank` / `vocabulary_hint` 的固定比例
- 每个 exercise block 必须引用本章存在的 exercise
- 每个 exercise 必须被且只被一个 exercise block 引用
- 每章必须有 2 个 shots
- shot 的 `coveredBlockIds` 必须引用本章 block
- 两个 shots 合起来必须覆盖本章所有 blocks
- 两个 shots 的 covered blocks 不重叠
- `characterIds` 必须引用全局 characters
- exercise 答案只存储在 `exercises` 中，不能出现在 exercise display 字段中

## 生成稳定性策略

- 不要求 AI 直接输出最终 `LessonDraft` 全量结构，避免 block / exercise / shot 引用类机械错误。
- AI 不再直接输出带 marker 的最终正文。
- 第一次 LLM 请求生成纯正文内容计划：每章 2 段纯英文正文、每段 1 个图片分镜语义、closing reading、人物和视觉风格。
- 第二次 LLM 请求基于纯正文生成练习计划：每章 7-10 个练习，包含 `type`、`paragraphIndex`、`sentenceId`、`answer`、`occurrenceText`、`occurrenceIndex`，以及 `baseVerb` 或 `pattern`。
- 后端代码只做 exact string replacement：先用代码生成的 `sentenceId` 定位句子，再用 `occurrenceText` + `occurrenceIndex` 在句中定位要替换的片段。
- 后端不从正文中猜词、不补题、不做语义判断。
- 若练习计划中的 `sentenceId` 不存在、`occurrenceText` 在句中找不到、`occurrenceIndex` 不合法、与 answer 不匹配、数量不足或 answer 重复，接口返回可读错误，不做第三次 LLM 重试。
- 分镜覆盖范围仍由代码按 paragraph 绑定：paragraph 1 → shot 1，paragraph 2 → shot 2。
- 后端代码继续负责稳定 id、block order、exercise block references、imageSlotId、shot order、coveredBlockIds、`closingReading.vocabularyTerms`、character consistency 注入和最终校验。

## 实现状态

- 状态：已实现，待用户验收
- 实现提交：待记录
- 验证命令：`pnpm prisma:generate`、`pnpm prisma:deploy`、`pnpm test`、`pnpm lint`、`pnpm build`
- 验证结果：通过。真实 DeepSeek 验证已为测试课程 `cmr6h7zqm0000tcvove7d1720` 生成草稿，结果为 3 章、首章 10 个练习、首章 2 个图片分镜。
- 2026-07-05 优化记录：Step 3 增加 `closingReading`，约 100 英文词，可编辑，不包含练习和额外图片；页面改为章节 Tab + 分镜 Tab + Closing Tab。章节内左侧展示当前分镜覆盖的最终学生文案，空格已按最终形态渲染；右侧根据点击对象编辑正文、练习答案/提示或分镜图片 prompt，并显示当前分镜答案。MVP 不支持新增/删除空格、block 或分镜。
- 2026-07-05 修复记录：AI 生成约束加强为正文片段与练习 block 交错输出，避免完整正文后追加空格；Step3 预览兼容旧草稿，将单段正文和后置练习按当前分镜组合成可阅读的填空文本；prompt 强化语法点必须进入故事句子、对话和练习选择。
- 2026-07-05 修复记录：每章目标词数调整为约 120 词，生成目标 110-130 词，后端校验范围 90-150 词；分镜切分改为句子边界，避免半句进入不同分镜；Closing Reading 增加 `vocabularyTerms`，用于罗列本课学习到的英文单词和词组；学生文本中的 vocabulary hint 只展示字母提示，不再展示 `letters` 文案；DeepSeek 调用降低输出长度和温度以减少生成耗时。
- 2026-07-05 修复记录：课文草稿生成失败根因是 DeepSeek V4 thinking 模式返回 `reasoning_content` 但 `content` 为空，以及输出 JSON 偶发尾逗号 / 截断。已在请求体显式关闭 `thinking`，提高最终 JSON 输出上限，增加尾逗号修复，并在第一次解析或校验失败时携带具体原因要求模型重生成。
- 2026-07-07 优化记录：Step 3 生成改为 AI 内容计划 + 代码装配最终草稿。AI 只负责正文、练习候选和图片分镜语义；代码负责 block / exercise / shot 结构、分镜覆盖、closing vocabulary 和最终校验。生成等待态同步改为展示“读取故事骨架 / AI 生成正文和分镜 / 装配练习结构 / 校验并保存草稿”。
- 2026-07-07 修复记录：练习装配改为基于 `targetText` 替换段落原文，避免 `[answer]answer` 重复和练习上下文错位；每段必须保留 vocabulary hint，避免 shot1 / shot2 练习类型单边集中；closing reading 自动移除 `The End`；shot prompt 自动追加人物外貌和服装一致性信息。
- 2026-07-07 修复记录：练习计划不再完全依赖 AI 数量正确。若 AI 给出的可用练习不足，后端会从段落原文中补齐缺失的动词填空和词汇提示，仍保持每章 7 个 verb blank、3 个 vocabulary hint、每段 5 个练习。
- 2026-07-07 重构记录：按产品边界调整为“正文和习题均由 AI 生成，代码只解析为最终 JSON”。AI 现在输出 `markedText`，用 `[verb:baseVerb|answer]` / `[vocab:pattern|answer]` 内联标记表达习题；后端删除 `targetText` 搜索和代码补题逻辑，直接解析标记生成 block / exercise / shot 覆盖关系，并校验每章 7/3、每段 5 个、每段至少 1 个词汇题、同章答案不重复。
- 2026-07-07 修复记录：针对 AI 常见的每段 `4 verb + 1 vocab` 导致全章 `8/2` 的错误，prompt 和后端校验改为精确段落配比：第 1 段 `4 verb + 1 vocab`，第 2 段 `3 verb + 2 vocab`。校验错误会返回 `p1Verb/p1Vocab/p2Verb/p2Vocab`，用于第二次重生成时直接纠偏。
- 2026-07-07 修复记录：Step 3 DeepSeek 调用默认开启 thinking 模式，`reasoning_effort=max`，并移除 thinking 模式下不生效的 `temperature`。如需兼容旧行为，可用 `DEEPSEEK_THINKING=disabled` 回退到非 thinking 低温 JSON 生成。
- 2026-07-07 稳定性重设计记录：Step 3 不再把每章 10 题、7/3 比例、每段 5 题作为硬校验；每章固定 2 个分镜，练习目标为 8-10 个、硬性底线保持 7-10 个；若某章首次生成未达标，后端会对失败章节做一次局部重生成修复，练习仍必须由 AI 在正文中以内联 marker 生成，代码不补题。DeepSeek 默认关闭 thinking 以降低常规生成耗时，可通过 `DEEPSEEK_THINKING=enabled` 开启深度模式。
- 2026-07-08 重构记录：Step 3 生成改为两阶段 LLM。第一阶段生成纯正文、分镜和 closing；第二阶段基于正文生成练习计划。代码只做 exact string replacement 和最终 `LessonDraft` 装配，不再让 AI 直接输出带 marker 的正文，也不再保留旧的 marker 修复/截断/去重主路径。
