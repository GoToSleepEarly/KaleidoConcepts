# 新建课程 Step 1：基础信息模块说明

## 模块目标

本模块覆盖新建课程流程的第一步：填写课程基础信息。

目标是在用户确认基础信息后创建一个可恢复的 `draft` 课程，为后续故事方案、课文生成、资源生成和预览流程提供稳定的 `courseId`。

## 状态归属

创建前：
- 路由：`/courses/new`
- 只有前端表单状态
- 不创建数据库记录
- 刷新或离开页面会丢失未保存表单

首次提交后：
- 前端调用 `POST /api/courses`
- 后端创建 `draft` 课程
- 后端写入单个老师和至少一个学生关联
- 返回 `courseId`
- 页面跳转到 `/courses/:id/create/story-options`

从后续步骤返回基础信息：
- 路由：`/courses/:id/create/basic`
- 页面加载已保存基础信息
- 再次提交调用 `PUT /api/courses/:id/basic`
- 更新原课程，不重复创建

原因：
- 打开新建页不应产生空白课程
- Step 2 以后必须有可恢复的 `courseId`
- 返回 Step 1 修改时必须更新原草稿，不能重复创建课程

## 本期范围

包含：
- `/courses/new` 首次创建基础信息表单
- `/courses/:id/create/basic` 已有草稿基础信息编辑表单
- 老师卡片单选
- 学生卡片多选
- 课程标题、英语等级、课程时长、主题、语法点、故事想法填写
- 主题从主题库选择（`GET /api/presets?kind=theme`）
- 语法点从语法点库选择（`GET /api/presets?kind=grammar`）
- 库外历史值回显（编辑旧课程时，theme / grammar 不在预设库内仍显示为已选中）
- `POST /api/courses`
- `PUT /api/courses/:id/basic`
- 保存成功跳转到 `/courses/:id/create/story-options`

不包含：
- 故事方案生成
- 故事方案选择
- 课文生成
- 图片生成
- PDF 导出
- 多老师
- 删除草稿
- 自动保存
- 表单内自定义 / 新增主题（统一在主题库 `/themes` 维护）
- 表单内自定义 / 新增语法点（统一在语法点库 `/grammar` 维护）

## 字段规则

### 课程标题

- 必填
- 文本输入

### 老师

- 必填
- 单选
- 数据来源：`GET /api/people?role=teacher`
- 展示方式：人物卡片
- 卡片展示：头像、名称、性别、外貌描述

本期一个课程只绑定一个老师。

### 学生

- 必填
- 至少选择 1 个
- 多选
- 数据来源：`GET /api/people?role=student`
- 展示方式：人物卡片
- 卡片展示：头像、中文名 / 英文名、年龄、性别、外貌描述

### 英语等级

- 必填
- 单选
- 选项：`A1` / `A2` / `B1` / `B2` / `C1` / `C2`

### 课程时长

- 必填
- 单选
- 选项：`30` / `45` / `60` 分钟

### 主题

- 必填
- 单选
- 语义：世界观 / 场景框架
- 只能从主题库选择，不提供表单内自定义输入
- 数据来源：`GET /api/presets?kind=theme`
- 本期只允许一个主题
- 需要新增或调整主题时，去主题库 `/themes` 维护
- 编辑旧课程时，若课程 theme 不在预设库（历史值或已删除预设），仍作为已选中项回显

### 语法点

- 必填
- 至少选择 1 个
- 只能从语法点库选择，不提供表单内自定义输入
- 数据来源：`GET /api/presets?kind=grammar`
- 可以多个
- 按分类展开选择，可跨类累加
- 需要新增或调整语法点时，去语法点库 `/grammar` 维护
- 编辑旧课程时，若课程 grammar 含不在预设库的项（历史值或已删除预设），仍作为已选中项回显

### 故事想法

- 必填单选模式
- 模式一：老师手动输入
  - 文本必填
  - 语义：具体故事大纲
  - 示例：学生 A 进入宇宙冒险，遇到外星人，并学会太空知识
- 模式二：AI 构思
  - 不显示必填文本
  - 展示提示：`AI 会基于已选主题、老师、学生和语法点自动生成故事大纲。`

## 页面结构

页面入口：
- `/courses/new`
- `/courses/:id/create/basic`

内容结构：
- 顶部：步骤引导栏、步骤标题和返回课程列表入口
- 表单区：
  - 课程标题
  - 老师选择
  - 学生选择
  - 英语等级
  - 课程时长
  - 主题
  - 语法点
  - 故事想法
- 底部操作：
  - 取消
  - 保存并生成故事方案

按钮规则：
- `/courses/new` 点击 `保存并生成故事方案`：创建课程
- `/courses/:id/create/basic` 点击 `保存并生成故事方案`：更新课程基础信息
- 保存中按钮禁用
- 保存失败显示错误，可重试

## API 合同

### `GET /api/people?role=teacher`

用于老师卡片选择。

### `GET /api/people?role=student`

用于学生卡片选择。

### `POST /api/courses`

请求：

```ts
type CourseBasicInput = {
  title: string;
  teacherId: string;
  studentIds: string[];
  englishLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  durationMinutes: 30 | 45 | 60;
  theme: string;
  grammar: string[];
  storyIdeaMode: "manual" | "ai";
  storyIdea?: string;
};
```

响应：

```ts
201 {
  course: {
    id: string;
    status: "draft";
  };
}
```

失败：
- `400 { message: "课程基础信息不完整" }`
- `500 { message: "课程创建失败" }`

失败恢复：
- 创建失败不产生可用 `courseId`
- 表单保留在前端
- 用户修正后可重试

### `PUT /api/courses/:id/basic`

请求：

```ts
CourseBasicInput
```

响应：

```ts
{
  course: {
    id: string;
    status: "draft" | "building_resources" | "ready" | "build_failed";
  };
}
```

失败：
- `400 { message: "课程基础信息不完整" }`
- `404 { message: "课程不存在" }`
- `500 { message: "课程基础信息保存失败" }`

失败恢复：
- 更新失败不修改前端当前表单
- 用户可重试
- 不创建新课程

## 数据模型影响

`Course` 需要保存：
- `title`
- `englishLevel`
- `durationMinutes`
- `theme`
- `grammar`
- `storyIdeaMode`
- `storyIdea`
- `status`

`CoursePerson` 保存：
- 一个 `role=teacher` 人物
- 一个或多个 `role=student` 人物

如果现有 Prisma schema 缺少字段，需要为本模块新增 migration。

## 验收标准

- `/courses/new` 可打开基础信息表单
- 老师从真实人物接口加载，卡片单选
- 学生从真实人物接口加载，卡片多选
- 未选择老师不能提交
- 未选择学生不能提交
- 未填写标题、等级、时长、主题、语法点不能提交
- 故事想法为老师手动输入时，文本为空不能提交
- 故事想法为 AI 构思时，显示提示且不要求文本
- 创建成功后跳转 `/courses/:id/create/story-options`
- `/courses/:id/create/basic` 保存时更新原课程，不重复创建
- `pnpm test`、`pnpm lint`、`pnpm build` 通过

## 实现记录

- 状态：已实现，待用户验收
- 实现提交：待记录
- 验证命令：
  - `pnpm prisma:deploy`
  - `pnpm prisma:generate`
  - `pnpm prisma:seed`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
- 验证结果：
  - migration 已应用
  - seed 通过
  - test 通过，6 个测试文件 / 16 个测试
  - lint 通过
  - build 通过
  - `/courses/new` 返回 200
  - `POST /api/courses` 返回 `{ id, status }`
  - `GET /api/courses/:id/basic` 可回填基础信息
  - `/courses/:id/create/basic` 返回 200
- `/courses/:id/create/story-options` 返回 200

## 后续优化

- 课程列表的编辑入口后续根据课程当前所属步骤跳转；当前统一进入 `/courses/:id/create/basic`。

## 变更记录：主题 / 语法点只能选择（Bug 修复）

背景：Step 1 表单原来允许手输自定义主题 / 语法点，与“统一在预设库维护”的产品约定冲突，导致库外脏值、无法统一管理。

前端改动（`features/courses/components/course-basic-form.tsx`）：
- 删除 `customTheme` / `customGrammar` state
- 删除 `addCustomTheme()` / `addCustomGrammar()`
- 删除主题、语法点两处 `InlineAddField`（“添加主题” / “添加语法点”）
- 若 `InlineAddField`、`Plus` 图标无其他引用则一并删除
- 保留 `themeOptions`（form.theme 不在预设内时追加为可选中项）
- 保留 `customGrammarItems`（form.grammar 中不在 `knownGrammarLabels` 的项，作为“库外已选语法点”回显区，可取消，不可新增）
- 校验文案：`请选择主题` / `请至少选择 1 个语法点`（去掉“或输入”）

后端：无需改动。`Course.theme` / `Course.grammar` 仍为字符串 / 字符串数组，与预设库解耦，历史值不受预设增删影响。

验收：
- Step 1 无任何自定义主题 / 语法点输入框
- 主题、语法点只能从预设库勾选
- 编辑含库外历史值的旧课程，历史值仍回显为已选中且可取消
- `pnpm test` / `pnpm lint` / `pnpm build` 通过
