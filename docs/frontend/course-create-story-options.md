# 新建课程 Step 2：故事教学大纲模块说明

## 模块目标

本模块覆盖新建课程流程第二步：基于 Step 1 已保存的课程基础信息，生成 3 个可编辑、可选择的故事教学大纲。

本步骤目标是帮助老师选择故事方向，不生成完整教案。

## 职责边界

Step 2 生成：
- 故事标题
- 一句话故事大纲
- 章节结构
- 每章纯剧情摘要
- 每章语法点 / 知识点承载说明
- 语法点如何融入剧情和对白
- 故事如何贴合学生画像
- 老师作为引导者如何带领学生行动
- 难度如何适配英语等级和课时

Step 2 不生成：
- 完整英文课文
- 完整教案讲稿
- 课堂互动问题
- 练习题
- 作业
- 答案
- 插画建议
- 图片 prompt
- HTML / PDF 内容

原因：
- Step 2 是方向选择，不是完整内容生成
- 插画应基于下一步完整课文 / 教案内容生成，不能在大纲阶段提前设计

## 固定故事设定

- 老师必须和学生一起出现在故事中
- 老师身份固定为故事引导者 / guide
- 老师不是旁白、不是课后点评者、不是可选角色

## 章节数量规则

根据 Step 1 的 `durationMinutes` 固定：
- 30 分钟：3 章
- 45 分钟：4 章
- 60 分钟：5 章

后端必须校验 AI 返回章节数量。

## JSON 结构

后端保存和前端渲染使用稳定 JSON：

```ts
type StoryOptionsPayload = {
  options: StoryOption[];
};

type StoryOption = {
  id: string;
  title: string;
  logline: string;
  chapters: StoryChapter[];
  teachingDesign: StoryTeachingDesign;
};

type StoryChapter = {
  title: string;
  summary: string;
  knowledgeHook: string;
};

type StoryTeachingDesign = {
  grammarIntegration: string;
  studentFit: string;
  teacherGuidance: string;
  difficultyFit: string;
};
```

编辑粒度：
- `title` 可编辑
- `logline` 可编辑
- 每章 `title / summary / knowledgeHook` 可编辑
- `teachingDesign` 的 4 个段落可编辑

内容边界：
- `summary` 只写故事剧情，不混入语法说明。
- `knowledgeHook` 只写本章语法点如何使用，不重复讲完整剧情。
- 前端展示必须把故事内容和语法设计分区，避免混读。

不包含：
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
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`

开发策略：
- 当 `DEEPSEEK_API_KEY=mock` 时，后端返回确定性的开发占位方案
- mock 分支必须带 TODO 注释，后续配置真实 key 后删除或限制为本地开发
- 真实 key 配置后走 DeepSeek OpenAI-compatible chat completions

## 页面行为

入口：
- `/courses/:id/create/story-options`

初次进入：
- 如果课程没有故事方案，显示 `生成故事方案`
- 点击后调用 `POST /api/courses/:id/story-options/generate`
- 生成中显示 loading
- 成功后展示 3 个方案

已有方案：
- 直接加载并展示
- 顶部显示 3 个方案 Tab，默认打开第一个方案或已选择方案
- 老师可编辑字段
- 点击 `保存修改` 调用 `PUT /api/courses/:id/story-options`
- 点击 `选择此方案` 调用 `POST /api/courses/:id/story-options/:optionId/select`
- 选择成功后跳转 `/courses/:id/create/lesson-draft`

本期不支持：
- 重新生成
- 选择后解除选择
- 选择后覆盖方案

重新进入：
- 课程列表点击编辑时，如果课程已有故事方案，进入 `/courses/:id/create/story-options`
- 如果课程没有故事方案，进入 `/courses/:id/create/basic`
- Step 1 已有课程的保存按钮文案使用 `保存并继续`，避免误解为重新生成

## API 合同

### `GET /api/courses/:id/story-options`

响应：

```ts
{
  options: StoryOption[];
  selectedOptionId: string | null;
}
```

失败：
- `404 { message: "课程不存在" }`
- `500 { message: "故事方案加载失败" }`

### `POST /api/courses/:id/story-options/generate`

行为：
- 读取课程基础信息、老师和学生画像
- 调用 DeepSeek 或开发 mock
- 生成并保存 3 个方案
- 如果课程已选择方案，本期返回 409

响应：

```ts
201 {
  options: StoryOption[];
}
```

失败：
- `400 { message: "课程基础信息不完整" }`
- `404 { message: "课程不存在" }`
- `409 { message: "故事方案已选择，不能重新生成" }`
- `500 { message: "故事方案生成失败" }`

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
}
```

失败：
- `400 { message: "故事方案信息不完整" }`
- `404 { message: "课程不存在" }`
- `409 { message: "故事方案已选择，不能继续编辑" }`
- `500 { message: "故事方案保存失败" }`

### `POST /api/courses/:id/story-options/:optionId/select`

响应：

```ts
{
  selectedOptionId: string;
}
```

失败：
- `404 { message: "课程或故事方案不存在" }`
- `409 { message: "故事方案已选择" }`
- `500 { message: "故事方案选择失败" }`

## 数据模型

新增 `CourseStoryOption` 表：
- `id`
- `courseId`
- `title`
- `logline`
- `chapters`
- `teachingDesign`
- `createdAt`
- `updatedAt`

`Course` 增加：
- `selectedStoryOptionId`

存储策略：
- 生成后保存 3 条 `CourseStoryOption`
- 编辑时更新 3 条
- 选择时写入 `Course.selectedStoryOptionId`

## 验收标准

- `/courses/:id/create/story-options` 显示步骤引导栏并高亮 Step 2
- 已有方案时顶部显示 3 个方案 Tab，并且只展示当前 Tab 对应方案
- 课程列表编辑入口根据是否已有故事方案进入 Step 1 或 Step 2
- 未生成故事方案时显示生成按钮
- `DEEPSEEK_API_KEY=mock` 时可生成 3 个开发占位方案
- 方案章节数按课时匹配
- 每个方案可编辑并保存
- 选择方案后保存 selected option
- 选择后跳转 `/courses/:id/create/lesson-draft`
- 本期不出现重新生成入口
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：已实现，待用户验收
- 实现提交：待记录
- 验证命令：`pnpm prisma:generate`、`pnpm prisma:deploy`、`pnpm test lib/server/repositories/story-options.test.ts`、`pnpm test`、`pnpm lint`、`pnpm build`
- 验证结果：通过。端到端 API 验证已创建测试课程 `cmr6exsj90000rcvol5jfmd6l`，生成 3 个方案，30 分钟课程生成 3 章，并选择 `option-1`。
- 最新调整：故事和语法分区展示；已有方案时使用 3 个 Tab 切换；课程列表编辑入口根据方案进度跳转。
- 2026-07-05 优化记录：Step 2 定位调整为“故事架构选择”，AI 输出限制为短摘要：`logline` 1-2 句，`summary` 1-3 句，`knowledgeHook` 1 句，`teachingDesign` 每项 1 句；前端保留 `teachingDesign` 可见和可编辑，但降低输入区域高度；课程列表编辑入口统一使用后端返回的 `nextEditPath`。
- 2026-07-05 修复记录：已选故事方案从 Step3 返回 Step2 后，增加继续进入课文草稿入口；已选方案按钮点击时直接进入 `/courses/:id/create/lesson-draft`。
