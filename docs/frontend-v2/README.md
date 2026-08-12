# PBL Studio 重构模块索引

本目录用于重构期归档新系统契约。新系统与 V1 完全不兼容；实现完成后，本目录中的有效文档将升格为正式模块文档，并删除 `frontend-v2` 版本后缀。

## 契约优先级

发生冲突时按以下顺序判断：

1. 根目录 `PRODUCT.md`
2. `docs/frontend-v2/system-architecture.md`
3. 已标记“契约已归档”的当前模块文档
4. 其余待重新讨论的草稿

`docs/frontend/` 和 V1 代码只描述冻结的旧系统，不是新系统实现依据。

## 新系统原则

- 新系统使用干净数据库，不迁移、不复用 V1 表结构。
- 运行时代码、API、数据库表不使用 `V2` 后缀。
- V1 由冻结分支和标签独立部署，只服务旧课程。
- 新课程只进入新系统；课程列表不跨数据库聚合。
- 图片、生成记录和状态必须可恢复，付费成功结果不得被隐式覆盖。
- 用户界面不展示内部开发、数据结构或工作流说明。页面通过布局、控件状态、操作反馈和必要错误提示引导用户完成任务，减少解释型文案造成的理解成本。

## 当前模块

| 模块 | 文档 | 状态 |
| --- | --- | --- |
| 系统隔离与 V1 退役 | `docs/frontend-v2/system-architecture.md` | 已确认并实现当前边界 |
| 人物档案 | `docs/frontend-v2/people-profiles.md` | 已实现，待用户验收 |
| 基础信息 | `docs/frontend-v2/course-create-audience.md` | 教学目标契约已实现 |
| 故事大纲 | `docs/frontend/course-create-lesson-chat.md` | 章节知识点推荐契约已实现 |
| 教学规划 | `docs/frontend-v2/course-create-teaching-plan.md` | 题型分离、覆盖与分页规则已实现，待用户验收 |
| 文案与练习 | `docs/frontend-v2/course-create-content-and-exercises.md` | 核心前后端已实现，待用户验收 |
| 视觉资源 | `docs/frontend-v2/course-create-visual-resources.md` | 核心前后端已实现，待用户验收 |
| 预览发布 | `docs/frontend-v2/course-preview-and-publish.md` | 核心前后端已实现，待用户验收 |

## 新课程流程

```text
基础信息 -> 故事大纲 -> 教学规划 -> 文案与练习 -> 视觉资源 -> 预览发布
```

实现仍按模块逐步验收；当前进入 Step 6 用户验收。
