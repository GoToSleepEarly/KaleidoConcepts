# 课程创建 V2 阶段四：文案与练习

## 模块目标

阶段四负责基于已确认的故事大纲和教学规划生成英文阅读正文、阅读内嵌题、章节练习和课后练习。

本阶段采用显式两段式体验：

```text
生成阅读正文 -> 老师确认 / 编辑正文 -> 生成练习 -> 老师确认 / 编辑练习
```

内部可以分步生成和校验，但前端只展示老师能理解的进度、渲染好的课程内容和可操作问题卡。

## 设计原则

- 先生成正文，再基于已确认正文生成练习。
- clean reading 是练习和视觉资源的语义真相源。
- AI 不直接输出最终学生版排版。
- 后端负责编译题号、挖空、答案区和展示结构。
- 按章节生成和校验，支持局部失败恢复。
- 老师不看 prompt、JSON、schema、原始 AI 输出或技术错误。
- 左侧 chatbox 是修改入口，不是主要阅读区。
- 右侧渲染结果是唯一主要内容区。

## 页面布局

建议使用左右布局：

- 左侧：AI 操作区和 chatbox。
- 右侧：课程内容渲染结果。

### 左侧 AI 操作区

左侧展示：

- 当前阶段状态。
- 简短生成进度。
- 老师与 AI 的短对话记录。
- 自然语言修改输入框。

左侧不展示：

- 完整正文。
- 完整练习。
- prompt。
- JSON。
- schema 校验错误。
- provider 原始错误。
- raw AI output。

AI 回复只保留短状态，例如：

- 已更新第 2 章阅读。
- 已重新生成课后练习。
- 第 3 章有一道题答案不匹配，已修复。

### 右侧课程内容区

右侧展示最终渲染内容：

- 章节标题。
- clean reading 或带内嵌题的阅读正文。
- 章节练习题卡。
- 课后练习题卡。
- 答案区折叠面板。
- 失败问题卡。

所有 AI 结果必须渲染为组件，不展示 Markdown 长文本或脚本。

## 状态流

阶段四建议状态：

```ts
type ContentGenerationStatus =
  | "empty"
  | "reading_generating"
  | "reading_ready"
  | "reading_confirmed"
  | "exercise_generating"
  | "exercise_ready"
  | "content_confirmed"
  | "failed";
```

状态说明：

- `empty`：尚未生成正文。
- `reading_generating`：正在生成阅读正文。
- `reading_ready`：正文已生成，可编辑，可确认。
- `reading_confirmed`：正文已确认，作为练习生成真相源。
- `exercise_generating`：正在生成练习。
- `exercise_ready`：练习已生成，可编辑，可确认。
- `content_confirmed`：文案与练习已确认，可进入视觉资源。
- `failed`：生成或校验失败，页面展示可操作问题卡。

## 第一步：生成阅读正文

输入：

- 阶段一授课对象。
- 阶段二故事大纲。
- 阶段三教学规划。

输出：

- 每章 clean reading。
- 按目标阅读长度自动切分段落。
- 不包含题号、挖空、选项、答案、图片 prompt 或最终排版。

段落数不让老师配置，由系统根据目标词数自动切分。

建议默认规则：

- 80-120 词：1 段。
- 121-180 词：2 段。
- 181-260 词：3 段。

MVP 不限制段落数量为固定值，数据结构必须支持多段。

## 阅读长度

阅读长度在阶段三配置，不在阶段四修改。

建议阶段三使用长度档位映射词数范围：

- A1：80-100 词/章。
- A2：100-120 词/章。
- B1：110-130 词/章。
- B2：120-150 词/章。
- C1：140-170 词/章。
- C2：150-180 词/章。

后端校验允许合理安全边界，避免因为少量词数偏差导致频繁失败。

## 正文编辑

正文未生成练习前：

- 老师可以直接在右侧编辑章节标题和段落正文。
- 老师可以通过左侧 chatbox 发送自然语言修改要求。
- AI 修改后，右侧更新渲染结果。

示例修改要求：

- 第 2 章更简单一点。
- 第 1 章增加 Jett 的互动。
- 整体更适合 A2。
- 把第三章场景改成太空学校。

正文已生成练习后：

- 再编辑正文必须提示：

```text
修改正文会重置已生成练习，是否继续？
```

确认后：

- 删除阅读内嵌题。
- 删除章节练习。
- 删除课后练习。
- 状态回到 `reading_ready`。

取消后：

- 不保存正文修改。
- 保留已有练习。

## 第二步：生成练习

老师点击“确认正文，生成练习”后：

- 正文锁定为练习生成真相源。
- 系统基于已确认正文和阶段三教学规划生成练习。

练习包括：

- 阅读内嵌题。
- 章节练习。
- 课后练习。

阅读内嵌题按章配置，系统自动分布到段落中，不由老师按段配置。

章节练习按章生成，统一放在每章阅读后。

课后练习按全课生成，可覆盖阶段三配置中的章节范围。

## 内嵌题生成方式

延续 V1 的单一事实来源原则。

保存：

- clean sentence。
- exercise segment。
- exercise item。

后端编译：

- 学生版挖空。
- 选择题选项。
- 词汇提示 pattern。
- 题号。
- 答案区。

AI 不直接输出带题号的最终学生文本。

内嵌题必须满足：

- 题型来自阶段三配置。
- 题量来自阶段三配置。
- 答案与 clean reading 一致。
- 插入后不破坏英文句子。

## 支持题型

阶段四只能生成阶段三配置中允许的题型：

```ts
type ExerciseType = "choice" | "blank" | "vocab" | "matching";
```

使用范围：

- 阅读内嵌题：`choice`、`blank`、`vocab`。
- 章节练习：`choice`、`blank`、`vocab`、`matching`。
- 课后练习：`choice`、`blank`、`vocab`、`matching`。

不得生成老师未选择的题型。

## 练习编辑

练习生成后，老师可以在右侧组件中编辑：

- 题干。
- 选项。
- 答案。
- 词汇提示。
- 词汇 pattern。
- 匹配题左右项。
- 匹配题答案映射。

不允许在阶段四修改：

- 题型。
- 题量。
- 归属章节。
- 是否生成课后练习。
- 英语难度。
- 知识点配置。

如需修改上述结构性配置，返回阶段三。修改阶段三会重置阶段四和后续视觉资源。

## 生成和校验策略

阶段四不能使用一次性大生成。

推荐内部流水线：

1. 按章生成 clean reading。
2. 校验正文。
3. 基于已确认正文生成阅读内嵌题计划。
4. 按章生成阅读内嵌题和章节练习。
5. 生成课后练习。
6. 后端编译学生版结构。
7. 执行质量校验。

每一步都保存状态，支持失败恢复。

## 硬校验

至少校验：

- 章节数匹配故事大纲。
- 每章词数在配置安全边界内。
- 段落数与词数范围匹配。
- 题型只来自阶段三配置。
- 题量匹配阶段三配置。
- 不出现未配置知识点。
- 选择题答案存在于选项中。
- 填空题答案非空。
- 词汇题 pattern 与答案匹配。
- 匹配题左右项和答案映射完整。
- 阅读内嵌题能安全嵌入正文。
- 每题有固定答案。
- 答案区覆盖全部题目。

## 错误和恢复体验

失败时不展示技术错误。

只展示业务可理解的问题卡：

- 第 2 章阅读生成失败。
- 第 2 章练习生成失败。
- 课后练习生成失败。
- 有题目答案检查未通过。
- 第 3 章阅读长度偏短。

可用操作：

- 重试。
- 重新生成全部阅读。
- 重新生成全部练习。
- 返回教学规划。

技术错误、provider 错误、schema 错误和 raw output 只进入服务端日志或调试面板，不进入老师主流程。

## 生成中展示

生成中只展示教师能理解的进度：

- 正在生成阅读内容。
- 正在生成章节练习。
- 正在生成课后练习。
- 正在检查答案。
- 正在整理课程内容。

右侧可以同步展示已完成部分：

- 已完成章节直接渲染。
- 生成中的章节展示占位。
- 失败章节展示问题卡。

## 确认进入视觉资源

点击“确认文案与练习”后：

- 状态变为 `content_confirmed`。
- 进入阶段五视觉资源。
- 视觉资源读取 clean reading、角色卡和故事大纲。
- 视觉资源不读取学生版挖空文本作为图片语义来源。

如果老师在确认后返回修改正文或练习，必须提示：

```text
修改文案与练习会重置视觉资源，是否继续？
```

确认后：

- 重置视觉资源。
- 保存新的文案与练习。

取消后：

- 不保存修改。
- 不影响视觉资源。

## API 边界

V2 API 使用 `/api/v2/...`。

### `GET /api/v2/courses/:id/content`

读取阶段四状态、阅读正文、练习和问题卡。

响应：

```ts
{
  status: ContentGenerationStatus;
  content: CourseLessonContent | null;
  issues: CourseContentIssue[];
}
```

### `POST /api/v2/courses/:id/content/reading/generate`

生成或重新生成阅读正文。

行为：

- 需要故事大纲和教学规划存在。
- 如果已有练习，需要确认重置练习。
- 按章节生成 clean reading。

### `PUT /api/v2/courses/:id/content/reading`

保存老师编辑后的阅读正文。

行为：

- 校验正文结构和词数。
- 如果已有练习，需要 `resetExercises = true` 才允许保存并重置练习。

### `POST /api/v2/courses/:id/content/exercises/generate`

基于已确认正文生成练习。

行为：

- 需要 reading 已确认。
- 严格消费教学规划配置。
- 生成阅读内嵌题、章节练习和课后练习。

### `PUT /api/v2/courses/:id/content/exercises`

保存老师编辑后的练习。

行为：

- 校验题型、题量、答案、匹配关系和答案区。
- 不允许改变题型、题量和章节归属。

### `POST /api/v2/courses/:id/content/confirm`

确认文案与练习，进入视觉资源。

行为：

- 校验正文和练习完整。
- 状态更新为 `content_confirmed`。

## 数据结构

建议新增稳定领域表，不使用 V2 后缀：

- `CourseLessonContent`
- `CourseContentGeneration`
- `CourseContentIssue`

结构示意：

```ts
type CourseLessonContent = {
  id: string;
  courseId: string;
  status: ContentGenerationStatus;
  chapters: LessonContentChapter[];
  homework: ExerciseItem[];
  createdAt: string;
  updatedAt: string;
};

type LessonContentChapter = {
  id: string;
  storyOutlineChapterId: string;
  title: string;
  paragraphs: LessonParagraph[];
  inlineExercises: ExerciseItem[];
  chapterExercises: ExerciseItem[];
};

type LessonParagraph = {
  id: string;
  order: number;
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

type ExerciseItem =
  | ChoiceExercise
  | BlankExercise
  | VocabExercise
  | MatchingExercise;
```

## 下游重置策略

- 修改正文会重置练习。
- 修改练习会重置视觉资源。
- 修改已确认文案与练习会重置视觉资源。
- 修改故事大纲会重置教学规划、文案与练习和视觉资源。
- 修改教学规划会重置文案与练习和视觉资源。

## 验收标准

- 阶段四先生成正文，再生成练习。
- 正文生成后右侧展示 clean reading，不展示题目。
- 老师确认正文后才能生成练习。
- 练习生成后右侧展示内嵌题、章节练习、课后练习和可折叠答案区。
- 左侧 chatbox 只用于自然语言修改和状态反馈，不作为主要阅读区。
- AI 输出不以 Markdown 长文、JSON、prompt 或脚本形式展示给老师。
- 生成失败时展示业务问题卡，不展示技术错误。
- 支持正文编辑。
- 支持练习编辑。
- 正文已生成练习后再次修改，必须确认是否重置练习。
- 已进入视觉资源后修改文案与练习，必须确认是否重置视觉资源。
- 视觉资源只读取 clean reading，不读取学生版挖空文本作为图片语义来源。

## 实现状态

- 状态：产品设计已讨论，待用户确认文档。
- 验证命令：待实现后记录。
- 提交号：待实现后记录。

