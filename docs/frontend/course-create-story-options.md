# 新建课程 Step 2：中文故事大纲选择模块说明

## 模块目标

本模块覆盖新建课程流程第二步：基于 Step 1 已保存的课程基础信息，生成 3 个中文故事大纲候选方案，帮助老师快速选择故事方向。

Step 2 只负责故事方向选择，不生成英文正文、知识点设计、练习题、答案、图片分镜或教案。

## 本期重构目标

针对 MVP 反馈“Step2 重点不突出，老师希望用中文直接看到故事大纲等核心内容”，本次将 Step 2 从“戏剧结构/知识点承载设计”收敛为“中文故事大纲选择”。

核心变化：
- 删除老师不可见也不应由 Step 2 决定的教学设计字段。
- 删除 `centralConflict`、`logline`、`beat.goal/obstacle/turn`、`knowledgeHook`。
- 新增 `variant`，固定区分三种方案定位：贴近原意 / 推荐·结构增强 / 创意拓展。
- 新增 `storyline`，用一句中文说明整个故事如何推进。
- 每章只保留 `title` 和 `summary`，summary 是一句中文章节大纲，不是正文。
- Step 1 的知识点只作为 AI 构思故事时的弱背景，不能出现在 Step 2 输出或 UI 中。

## 职责边界

Step 2 生成：
- 3 个中文故事大纲候选方案
- 每个方案的定位 `variant`
- 故事标题
- 故事主线 `storyline`
- 按课程时长生成的章节线
- 每章标题与一句中文章节大纲

Step 2 不生成：
- 英文正文
- 语法 / 知识点设计
- 练习题 / 答案 / 挖空题
- 教案 / 课堂流程
- 图片分镜 / 图片 prompt
- HTML / PDF

原因：
- 老师在本步骤的核心任务是选择故事方向。
- 知识点、英文正文、题目和图片语义都依赖最终选定故事，统一放到 Step 3 及后续步骤更稳定。
- 避免 AI 为了语法牺牲故事完整性，也避免 Step 2 页面被无关信息占据。

## 章节数量规则

根据 Step 1 的 `durationMinutes` 固定：
- 30 分钟：3 章
- 45 分钟：4 章
- 60 分钟：5 章

后端继续校验 AI 返回章节数量。

## JSON 结构

```ts
type StoryOptionsPayload = {
  options: StoryOption[];
};

type StoryOption = {
  id: "option-1" | "option-2" | "option-3";
  variant: "faithful" | "enhanced" | "creative";
  title: string;
  storyline: string;
  chapters: StoryChapter[];
};

type StoryChapter = {
  title: string;
  summary: string;
};
```

字段含义：
- `variant`: 方案定位。`faithful` 贴近原意，`enhanced` 推荐·结构增强，`creative` 创意拓展。
- `title`: 中文故事标题。
- `storyline`: 一句中文故事主线，说明故事整体靠什么推进。
- `chapters[].summary`: 一句中文章节大纲，只写关键推进事件。

不包含：
- `logline`
- `centralConflict`
- `beat`
- `knowledgeHook`
- `teachingDesign`
- `visualPotential`
- `selected`
- `score`
- `estimatedWords`
- `keywords`

## AI Provider

本期使用 DeepSeek。

环境变量：
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`

默认值：
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`

生成策略：
- Step 2 使用 DeepSeek thinking 模式。
- Prompt 要求模型先内部思考和自检，但最终只输出严格 JSON。
- 不做本期额外 repair loop；仍保留基础结构校验以保护 API 合同。
- 当 `DEEPSEEK_API_KEY=mock` 时，后端返回确定性的开发占位方案。

## Prompt 关键约束

- 不传课程标题，课程标题与故事内容无直接关系。
- 不向模型暴露产品步骤名，Prompt 使用“当前任务 / 后续内容开发”等解耦表达。
- 人名只传 `nameToUseInStory`，避免模型把中文单字姓名翻译或误解。
- 老师提供故事想法时，必须保留其中明确的人物、历史人物、地点、时代、关键物品、核心任务和主要事件。
- 知识点只作为后续内容开发背景，不输出、不展示、不写入字段。
- 不包含“禁止版权角色名”规则；老师输入的故事设定由产品侧决定是否允许。
- 输出必须短：`storyline` 是主线，不是正文；`chapter.summary` 是章节大纲，不是完整场景。

## 页面行为

入口：
- `/courses/:id/create/story-options`

初次进入：
- 如果课程没有故事方案，显示“生成故事大纲”。
- 点击后调用 `POST /api/courses/:id/story-options/generate`。
- 生成中显示 loading 阶段：理解故事种子、生成三种方向、压缩故事大纲、整理方案 JSON。
- 成功后展示 3 个大纲方案。

已有方案：
- 直接加载并展示。
- 页面默认以三张卡片对比 3 个方案。
- 方案 2（`enhanced`）作为默认推荐方向高亮优先。
- 卡片展示：方案定位、故事标题、故事主线、章节线。
- 不展示任何知识点信息。
- 老师可轻微编辑标题、故事主线、章节标题、章节大纲。
- 点击 `保存修改` 调用 `PUT /api/courses/:id/story-options`。
- 点击 `选择这个故事` 调用 `POST /api/courses/:id/story-options/:optionId/select`。
- 选择成功后跳转 `/courses/:id/create/lesson-draft`。

本期不支持：
- 重新生成
- 选择后解除选择
- 选择后覆盖方案

## API 合同

### `GET /api/courses/:id/story-options`

响应：

```ts
{
  options: StoryOption[];
  selectedOptionId: string | null;
}
```

### `POST /api/courses/:id/story-options/generate`

行为：
- 读取课程基础信息、老师和学生画像。
- 调用 DeepSeek 或开发 mock。
- 生成并保存 3 个中文故事大纲方案。
- 如果课程已选择方案，本期返回 409。

响应：

```ts
201 {
  options: StoryOption[];
}
```

### `PUT /api/courses/:id/story-options`

请求：

```ts
{
  options: StoryOption[];
}
```

响应：

```ts
{
  options: StoryOption[];
  selectedOptionId: string | null;
}
```

### `POST /api/courses/:id/story-options/:optionId/select`

响应：

```ts
{
  selectedOptionId: string;
}
```

## 数据库

`CourseStoryOption` 字段：
- `id`
- `courseId`
- `variant`
- `title`
- `storyline`
- `chapters` JSON
- `createdAt`
- `updatedAt`

本结构不兼容旧故事方案与旧 lesson draft。迁移会清理旧 story options、lesson drafts、images，并重置课程选择状态。

## 与 Step 3 的关系

Step 3 输入：
- Step 1 的课程基础信息、知识点、老师和学生画像
- Step 2 选中的中文故事大纲：`storyline + chapters[].summary`

Step 3 负责：
- 将中文故事大纲扩写成英文绘本正文
- 根据 Step 1 知识点在英文正文中自然安排可出题句子
- 生成练习、答案、图片分镜和视觉一致性信息

Step 3 不再读取 `knowledgeHook` 或 `beat`。
