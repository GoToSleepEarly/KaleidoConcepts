# Frontend V2 Module Index

本目录记录 MVP 重构后的课程创建流程。V2 文档、页面、API 和业务代码与 V1 隔离；旧课程继续走 V1，新课程走 V2。

## 重构目标

V2 的北极星目标是先扩大课程生成能力边界，同时把文案生成体验优化作为第二大 Topic 纳入整体设计，避免后续返工。

核心能力：

- 支持章节练习、课后练习和多题型。
- 支持第三方人物、IP、真实人物和联网检索。
- 支持老师、学生和第三方角色的形象一致性。
- 降低教师理解和修复 AI 结果的成本。
- 强化题目答案、文本逻辑、事实边界和生成质量。

## 隔离策略

V2 使用同一个代码仓，不新开仓库。

- 文档隔离：`docs/frontend-v2/`
- 页面隔离：使用 V2 独立路由，具体路由在各模块文档中确认。
- API 隔离：使用 `/api/v2/...`
- 前端代码隔离：建议使用 `features/courses-v2/`
- 服务端代码隔离：建议使用 `lib/server/courses-v2/`
- 类型合同隔离：建议使用 `lib/contracts/courses-v2/`

生产期不采用 3000 / 4000 双端口作为主隔离方案。V2 和 V1 在同一个 Next.js 单体中通过路由、API 和 workflow mode 隔离。新建课程入口切到 V2 后，旧课程仍可继续通过 V1 打开。

## 数据库策略

数据库不使用 `V2` 后缀命名长期领域表，避免后续出现 `V3` / `V4` 表名膨胀。

原则：

- 复用稳定核心表：`Course`、`Person`、`CoursePerson`。
- 在 `Course` 上增加流程模式字段，例如 `workflowMode = "legacy" | "plan_based"`。
- 旧课程为 `legacy`，继续走 V1。
- 新课程为 `plan_based`，走 V2。
- 新增领域表按稳定业务概念命名，例如 `CoursePlan`、`CourseSourceReference`、`CourseCharacterAsset`、`CourseExerciseSet`、`CourseQualityCheck`。
- V2 不依赖 V1 的 `CourseLessonDraft`、`CourseResourcePlan`、旧 `CourseImage` 结构，除非后续模块明确确认复用边界。

数据库结构变更必须走 Prisma migration。生产只执行 `pnpm prisma:deploy`。

## V2 课程创建流程

用户可见流程暂定为：

```text
授课对象确认 -> 故事大纲 -> 教学规划 -> 文案与练习 -> 视觉资源 -> 预览发布
```

内部核心真相源由故事大纲、教学规划和后续生成资产共同组成，但前端不使用“蓝图”作为教师可见概念。

## Current Modules

| Module | Document | Status |
| --- | --- | --- |
| 授课对象确认 | `docs/frontend-v2/course-create-audience.md` | 已讨论，待用户确认文档 |
| 故事大纲 | `docs/frontend-v2/course-create-story-outline.md` | 已讨论，待用户确认文档 |
| 教学规划 | `docs/frontend-v2/course-create-teaching-plan.md` | 已讨论，待用户确认文档 |
| 文案与练习 | `docs/frontend-v2/course-create-content-and-exercises.md` | 已讨论，待用户确认文档 |
| 视觉资源 | `docs/frontend-v2/course-create-visual-resources.md` | 已讨论，待用户确认文档 |
| 预览发布 | 待创建 | 待讨论 |
