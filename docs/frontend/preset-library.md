# 预设库模块说明（主题 / 语法点）

## 模块目标

把当前写死在新建课程表单里的主题、语法点常量，升级为独立、可增删改查的预设库。教师在建课时从预设库选择，也可以在预设库里长期维护这两组选项。

现状：`defaultThemes`（20 项）和 `defaultGrammar`（20 项）硬编码在 `features/courses/components/course-basic-form.tsx`。`Course.theme` 存字符串、`Course.grammar` 存字符串数组，与预设表解耦——删除或修改预设不会影响已建课程的历史数据。

## 命名与入口

拆成两个独立导航页（用户确认）：

| 导航 | 路由 | header 标题 |
| --- | --- | --- |
| 主题库 | `/themes` | 主题库 |
| 语法点库 | `/grammar` | 语法点库 |

“知识点”即“语法点”（用户确认），沿用表单里已有的“语法点”字段语义，不新增第三类。

AppShell 左侧导航新增两项，放在“人物档案”和“课程列表”之间：

```
人物档案 / 主题库 / 语法点库 / 课程列表
```

## 本期范围

包含：
- 主题库页面：列表 + 新增 + 编辑 + 删除
- 语法点库页面：列表 + 新增 + 编辑 + 删除，按分类分组展示
- 数据库持久化
- `GET/POST /api/presets`、`PUT/DELETE /api/presets/:id`
- 新建课程表单改为从接口拉取预设，替换两个硬编码常量
- seed 写入初始预设数据

不包含：
- 拖拽排序（本期用 `sortOrder` 字段但不做拖拽 UI，按 sortOrder + label 排序）
- 批量导入 / 导出
- 主题库分类（主题不分类，语法点分类）
- 预设与历史课程的关联统计

## 数据模型

新增 `PresetOption` 表：

```prisma
model PresetOption {
  id         String           @id @default(cuid())
  kind       PresetOptionKind
  label      String
  category   String?          // 语法点分类，如“时态”；主题为 null
  sortOrder  Int              @default(0)
  archivedAt DateTime?
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@unique([kind, label])
  @@index([kind, archivedAt])
}

enum PresetOptionKind {
  theme
  grammar
}
```

删除采用软删（写 `archivedAt`），保持与 `Person` 一致的约定，避免误删无法恢复。列表只返回 `archivedAt = null`。

契约类型（`lib/contracts/api.ts`）：

```ts
export type PresetKind = "theme" | "grammar";

export type PresetOption = {
  id: string;
  kind: PresetKind;
  label: string;
  category?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PresetOptionInput = {
  kind: PresetKind;
  label: string;
  category?: string;
};
```

## API 合同

### `GET /api/presets?kind=theme|grammar`

`kind` 可选；不传返回全部。

响应：

```ts
{ presets: PresetOption[] }
```

排序：`category` 升序 → `sortOrder` 升序 → `label` 升序。

失败：
- `400 { message: "预设类型无效" }`（kind 非法）
- `500 { message: "预设加载失败" }`

### `POST /api/presets`

请求：`PresetOptionInput`

响应：`201 { preset: PresetOption }`

规则：`label` trim 后非空；同 `kind` 下 `label` 唯一（含已归档？——不含，归档项不占用唯一名，重名新建会复用/报错）。

失败：
- `400 { message: "预设信息不完整" }`
- `409 { message: "该预设已存在" }`（同 kind 同 label 未归档）
- `500 { message: "预设保存失败" }`

### `PUT /api/presets/:id`

请求：`PresetOptionInput`（`kind` 不可变，忽略传入的 kind 以 DB 为准）

响应：`{ preset: PresetOption }`

失败：
- `400 { message: "预设信息不完整" }`
- `404 { message: "预设不存在" }`
- `409 { message: "该预设已存在" }`
- `500 { message: "预设保存失败" }`

### `DELETE /api/presets/:id`

软删，写 `archivedAt = now()`。

响应：`{ ok: true }`

失败：
- `404 { message: "预设不存在" }`
- `500 { message: "预设删除失败" }`

## 页面结构

两页共用一套组件（`PresetLibrary`，按 `kind` 复用）：

- 顶部：说明文案 + `新增` 按钮
- 语法点页：按 `category` 分组，每组标题 + chip 卡片列表；主题页：单一列表
- 每项：label + 编辑 / 删除按钮；删除二次确认（`window.confirm`）
- 新增 / 编辑用右侧抽屉或轻量弹窗（沿用 people-manager 抽屉风格）：
  - 主题：仅 `label`
  - 语法点：`label` + `category`（下拉，选项来自现有分类 + 允许新输入）
- 空状态：引导新增

## 新建课程表单改造

`course-basic-form.tsx`：
- 删除 `defaultThemes`、`defaultGrammar` 常量
- 初始化时并行拉取 `GET /api/presets?kind=theme` 和 `?kind=grammar`
- 主题 chip / 语法点 chip 数据来自接口
- 表单**不提供**自定义主题 / 语法点输入（Bug 修复，覆盖旧约定）；新增和调整统一在主题库 `/themes`、语法点库 `/grammar` 维护
- 编辑已有课程时，若课程的 theme / grammar 不在预设库里（历史值或已删除的预设），仍显示为已选中项，逻辑同现有 `themeOptions` / `customGrammarItems` 的合并策略；库外项只能取消，不能新增

## seed 初始数据

主题（沿用现有 20 项中文主题）：
`魔法世界 / 宇宙冒险 / 海底世界 / 恐龙时代 / 森林探险 / 未来城市 / 童话王国 / 西游记 / 三国演义 / 校园生活 / 动物乐园 / 美食之旅 / 运动比赛 / 博物馆奇妙夜 / 环游世界 / 神秘岛屿 / 机器人世界 / 农场生活 / 冰雪王国 / 超级英雄`

语法点（按分类，约 28 条）：

- 时态：Present Simple / Present Continuous / Past Simple / Past Continuous / Future (will / be going to) / Present Perfect
- 词类：Singular / Plural Nouns、Countable / Uncountable、Subject Pronouns、Possessive、Object Pronouns、Articles (a / an / the)、Comparatives、Superlatives、Adverbs of Frequency、Prepositions of Place、Prepositions of Time
- 句型：There be、Have got、Wh- Questions、Yes/No Questions、Imperatives
- 情态动词：Can / Could、Must / Have to、Should
- 限定词与量词：Some / Any、Much / Many / A lot of、This / That / These / Those

seed 用 `upsert`（按 `kind + label` 唯一键）幂等写入，重复执行不产生重复。

## Mock / 联调边界

- 无临时 mock；直接走真实 DB。
- 表单只能从预设库选择、不支持自定义输入，是产品决策，不是临时逻辑，无需 TODO。

## 验收标准

- `/themes`、`/grammar` 可访问，导航高亮正确
- 两页可新增 / 编辑 / 删除，删除后列表和建课表单同步不再出现
- 语法点按分类分组展示
- 新建课程表单的主题 / 语法点来自接口，不再有硬编码常量
- 新建课程表单不再出现自定义主题 / 语法点输入框（只能选择）
- 编辑历史课程时，已删除或库外的 theme / grammar 仍正常回显选中
- seed 写入 20 主题 + 约 28 语法点，重复执行不重复
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：方案待用户确认
- 实现提交：待记录
