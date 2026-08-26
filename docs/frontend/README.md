# 前后端模块索引

本目录只保留当前产品的有效模块契约。历史方案、重构期版本目录和已被替代的模块文档均不作为开发依据；历史实现需要追溯时使用 Git。

## 契约优先级

1. 根目录 `PRODUCT.md`
2. 本索引列出的当前模块文档
3. 当前代码、数据库 schema 与 migration

## 当前课程流程

```text
基础信息 -> 故事大纲 -> 教学规划 -> 文案与练习 -> 视觉资源 -> 预览发布
```

课程创建中的 AI 工作台统一遵循 `docs/frontend/course-ai-workspace-ui-guidelines.md`。模块文档记录业务差异，共享守则记录布局、Loading、长等待与多端维护边界。

## 当前模块

| 模块 | 文档 | 状态 |
| --- | --- | --- |
| 应用框架与登录 | `docs/frontend/app-shell-and-auth.md` | 已实现 |
| 人物档案 | `docs/frontend/people-profiles.md` | 已实现，待用户验收 |
| 课程列表 | `docs/frontend/courses-list-management.md` | 已实现，待用户验收 |
| 课程步骤导航 | `docs/frontend/course-create-navigation.md` | 已实现 |
| 基础信息 | `docs/frontend/course-create-audience.md` | 已实现 |
| 故事大纲 | `docs/frontend/course-create-story-outline.md` | 已实现 |
| 教学规划 | `docs/frontend/course-create-teaching-plan.md` | 已实现，待用户验收 |
| 文案与练习 | `docs/frontend/course-create-content-and-exercises.md` | 已实现，待用户验收 |
| 视觉资源 | `docs/frontend/course-create-visual-resources.md` | 已实现，待用户验收 |
| 预览发布 | `docs/frontend/course-preview-and-publish.md` | 已实现，待用户验收 |
| Grammar in Use 语法知识库 | `docs/frontend/grammar-knowledge-library.md` | 已实现，待用户验收 |
| 主题预设库 | `docs/frontend/preset-library.md` | 已实现；语法库已拆分 |

## 开发约束

- 新任务先读本索引，再读目标模块文档。
- 模块文档必须同时记录前端交互、后台 API、数据结构、状态恢复与验证结果。
- 生产字段变更只通过 `prisma/migrations/`，服务器只执行 `pnpm prisma:deploy`。
- 图片统一由 `course_images` 管理；课程结构化内容不保存图片 URL、prompt 或状态。
- PDF 与 Preview 共用课程内容组件，PDF 永远隐藏答案和操作区。
