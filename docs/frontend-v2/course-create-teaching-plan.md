# 课程创建 V2 阶段三：教学规划

## 模块目标

阶段三负责把已确认的故事大纲配置成确定性的教学规划。

本阶段不调用 AI，不生成正文，不生成真实题目。老师手动配置难度、每章知识点、题型和题量，系统提供默认值、题型说明和右侧结构预览。

确认教学规划后，进入阶段四“文案与练习”。

## 设计原则

- 本阶段是确定性配置页，不是 AI 生成页。
- 知识点和题型按章节配置，不使用全局题型池。
- 不让老师面对长说明，通过题型示例和右侧预览理解配置结果。
- 题型只保留常见、有固定答案、容易展示和校验的类型。
- 右侧预览只展示结构和示例，不调用 AI。

## 用户流程

```text
选择全局英语难度 -> 按章节配置知识点和题型 -> 查看右侧结构预览 -> 确认进入文案与练习
```

## 页面布局

建议桌面端使用三栏布局：

- 左侧：章节列表
- 中间：当前章节配置
- 右侧：结构预览

如果屏幕较窄，右侧预览可降级为抽屉或标签页。MVP 当前只考虑 Web 端，不做移动端专项适配。

## 全局设置

全局只配置英语难度：

- A1
- A2
- B1
- B2
- C1
- C2

英语难度用于后续文案和练习生成。

## 按章节配置

每章一张配置卡，引用故事大纲中的章节信息。

只读信息：

- 章节标题
- 剧情摘要

可配置信息：

- 主知识点：必选 1 个
- 补充知识点：可选 0-2 个
- 阅读内嵌题型：多选
- 阅读内嵌题数量
- 章节练习题型：多选
- 章节练习题数量

知识点来源继续使用 preset grammar。

## 默认值

题型默认值：

- 阅读内嵌题型：选择题、填空题、词汇题
- 章节练习题型：选择题、填空题

题量默认值按课程时长给出：

- 30 分钟：每章阅读内嵌 3 题，章节练习 3 题，课后练习 6 题
- 45 分钟：每章阅读内嵌 4 题，章节练习 4 题，课后练习 8 题
- 60 分钟：每章阅读内嵌 5 题，章节练习 5 题，课后练习 10 题

老师可以调整题量，但不需要配置每个题型的细分数量。系统在后续生成时按已选题型均衡分配。

## 快捷操作

为减少重复操作，章节配置支持：

- 复制上一章配置
- 应用当前配置到全部章节

快捷操作只复制知识点、题型和题量，不修改故事大纲。

## 支持题型

MVP 只支持 4 类固定答案题型：

```ts
type ExerciseType = "choice" | "blank" | "vocab" | "matching";
```

### 选择题 `choice`

用途：

- 阅读内嵌题
- 章节练习
- 课后练习

结构：

```ts
type ChoiceExercise = {
  type: "choice";
  prompt: string;
  options: string[];
  answer: string;
};
```

示例：

```text
Luna found ___ old map.
A. a
B. an
C. the
```

### 填空题 `blank`

用途：

- 阅读内嵌题
- 章节练习
- 课后练习

结构：

```ts
type BlankExercise = {
  type: "blank";
  prompt: string;
  baseWord?: string;
  answer: string;
};
```

示例：

```text
She _____ (go) to school yesterday.
```

### 词汇题 `vocab`

用途：

- 阅读内嵌题
- 章节练习
- 课后练习

结构：

```ts
type VocabExercise = {
  type: "vocab";
  prompt: string;
  hint: string;
  pattern: string;
  answer: string;
};
```

示例：

```text
The cave was [V1: d _ _ k（提示：黑暗的）].
```

词汇题保留首尾字母 pattern，降低学生答题难度，并复用 V1 已验证的展示经验。

### 匹配题 `matching`

用途：

- 章节练习
- 课后练习

不用于阅读内嵌题。

结构：

```ts
type MatchingExercise = {
  type: "matching";
  prompt: string;
  leftItems: Array<{ id: string; text: string }>;
  rightItems: Array<{ id: string; text: string }>;
  answerPairs: Array<{ leftId: string; rightId: string }>;
};
```

示例：

```text
Match the words with meanings.
1. brave      A. very dark
2. clue       B. not afraid
3. shadow     C. information that helps you
```

## 题型使用范围

| 题型 | 阅读内嵌 | 章节练习 | 课后练习 |
| --- | --- | --- | --- |
| 选择题 | 支持 | 支持 | 支持 |
| 填空题 | 支持 | 支持 | 支持 |
| 词汇题 | 支持 | 支持 | 支持 |
| 匹配题 | 不支持 | 支持 | 支持 |

## 课后练习配置

课后练习放在页面底部单独配置，不按章节逐个配置。

配置项：

- 是否生成课后练习：默认开启
- 覆盖章节：默认全部章节
- 课后练习题型：选择题、填空题、词汇题、匹配题，多选
- 课后练习题量

默认题型：

- 选择题
- 填空题
- 词汇题

课后练习同样只保存配置，不生成真实题目。

## 右侧结构预览

右侧预览随配置实时更新。

展示内容：

- 当前章会生成几道阅读内嵌题
- 当前章会生成几道章节练习
- 当前章使用哪些题型
- 题型示例长什么样
- 课后练习覆盖哪些章节和题型

预览使用模板例题，不调用 AI，不保存真实题目。

示例：

```text
Chapter 1 Reading
... The students _____ (find) a clue ...

Chapter Practice
1. [选择题] Why did the team follow the light?
2. [填空题] The map _____ (shine) under the moon.
```

## 保存和确认

下一步前必须满足：

- 已选择全局英语难度。
- 每章都有 1 个主知识点。
- 每章至少选择 1 个阅读内嵌题型。
- 每章至少选择 1 个章节练习题型。
- 每章阅读内嵌题数量大于 0。
- 每章章节练习题数量大于 0。
- 如果开启课后练习，课后练习题型至少选择 1 个，题量大于 0。

保存后生成确定性的教学规划配置，供阶段四文案与练习生成使用。

## 与文案与练习的边界

本阶段不生成：

- 英文阅读正文
- 阅读内嵌题真实题目
- 章节练习真实题目
- 课后练习真实题目
- 答案
- 解析
- 图片 prompt

阶段四必须严格消费本阶段配置，不得生成老师未选择的知识点或题型。

## API 边界

V2 API 使用 `/api/v2/...`。

### `GET /api/v2/courses/:id/teaching-plan`

读取教学规划配置。

响应：

```ts
{
  plan: CourseTeachingPlan | null;
  defaults: CourseTeachingPlanDefaults;
}
```

### `PUT /api/v2/courses/:id/teaching-plan`

保存教学规划配置。

请求：

```ts
{
  plan: CourseTeachingPlan;
  resetDownstream?: boolean;
}
```

行为：

- 校验课程属于 `workflowMode = "plan_based"`。
- 校验故事大纲已存在。
- 校验每章配置完整。
- 如后续文案与练习或视觉资源已生成，需要 `resetDownstream = true` 才允许保存并重置后续步骤。

失败：

- `400 { message: "教学规划信息不完整" }`
- `400 { message: "请先确认故事大纲" }`
- `404 { message: "课程不存在" }`
- `409 { message: "该课程不属于 V2 创建流程" }`
- `409 { message: "修改教学规划会重置后续内容" }`
- `500 { message: "教学规划保存失败" }`

## 数据结构

建议新增稳定领域表，不使用 V2 后缀：

- `CourseTeachingPlan`

结构示意：

```ts
type CourseTeachingPlan = {
  id: string;
  courseId: string;
  englishLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  chapters: TeachingPlanChapter[];
  homework: TeachingPlanHomework;
  createdAt: string;
  updatedAt: string;
};

type TeachingPlanChapter = {
  chapterId: string;
  mainKnowledgePoint: string;
  supplementalKnowledgePoints: string[];
  inlineExerciseTypes: Array<"choice" | "blank" | "vocab">;
  inlineExerciseCount: number;
  chapterExerciseTypes: Array<"choice" | "blank" | "vocab" | "matching">;
  chapterExerciseCount: number;
};

type TeachingPlanHomework = {
  enabled: boolean;
  coveredChapterIds: string[];
  exerciseTypes: Array<"choice" | "blank" | "vocab" | "matching">;
  exerciseCount: number;
};
```

## 下游重置策略

如果文案与练习或视觉资源已经生成，老师返回修改教学规划并保存时，必须弹确认：

```text
修改教学规划会重置后续文案与练习、视觉资源，是否继续？
```

确认后：

- 重置文案与练习。
- 重置视觉资源。
- 保留阶段一授课对象和阶段二故事大纲。
- 保存新的教学规划。

取消后：

- 不保存教学规划修改。
- 不影响后续内容。

## 失败恢复

- 保存失败：不覆盖原教学规划，保留当前编辑内容后重试。
- 修改已确认教学规划：必须二次确认是否重置下游步骤。
- 右侧预览异常：不影响配置保存，预览可刷新恢复。

## 验收标准

- 阶段三不调用 AI。
- 老师可以选择全局英语难度。
- 老师可以按章节配置主知识点、补充知识点、阅读内嵌题型、章节练习题型和题量。
- 题型仅包含选择题、填空题、词汇题、匹配题。
- 匹配题不能用于阅读内嵌题。
- 右侧结构预览随配置实时变化。
- 右侧预览只使用模板例题，不生成真实内容。
- 支持复制上一章配置。
- 支持应用当前配置到全部章节。
- 未完成必填配置时不能进入下一步。
- 修改已确认教学规划时，必须确认是否重置后续步骤。

## 实现状态

- 状态：产品设计已讨论，待用户确认文档。
- 验证命令：待实现后记录。
- 提交号：待实现后记录。

