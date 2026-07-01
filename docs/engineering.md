# PBL Studio Engineering Standard

## 目标

用最少系统组件完成教师可用的 AI 绘本课程生成闭环：学生管理、课程生成、图片生成状态、HTML Preview、学生版浏览器打印 PDF。

## 技术约束

- Framework: Next.js App Router 单体。
- Language: TypeScript strict。
- UI: TailwindCSS + shadcn 风格组件原语。
- Data: PostgreSQL + Prisma。
- Storage: MVP 使用 ECS 本地 `storage/images`，通过 `/media/images/*` 暴露。
- Async: MVP 不引入队列，前端 2-3 秒轮询课程详情。

## 质量门槛

- 新增领域逻辑必须有 Vitest 测试。
- `structured_lesson` 和 `course_images` 不允许双真相源。
- `lesson_ready -> building_resources -> ready/build_failed` 的状态迁移必须可恢复。
- Normalize 失败不改变课程状态。
- 学生归档和课程归档不删除历史图片。
- PDF 路由只渲染学生版内容，不能出现答案、Answer Key、toolbar 或图片操作。

## 命令

```bash
pnpm install
pnpm prisma:generate
pnpm test
pnpm lint
pnpm build
pnpm dev
```
