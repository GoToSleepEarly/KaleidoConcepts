# PBL Studio Engineering Standard

## 目标

用最少系统组件完成教师可用的 AI 绘本课程生成闭环：学生管理、课程生成、图片生成状态、HTML Preview、学生版浏览器打印 PDF。

## 技术约束

- Framework: Next.js App Router 单体。
- Language: TypeScript strict。
- UI: TailwindCSS + shadcn 风格组件原语。
- Data: PostgreSQL + Prisma。
- Deploy: MVP 生产默认使用国内轻量云单机部署，不使用 Vercel / Neon / R2 作为大陆用户主路径。
- Storage: MVP 生产使用云服务器持久化目录 `/data/pbl-images`，开发环境使用 `storage/images` 或 `.local` 下的本地目录。
- Async: MVP 不引入队列，前端 2-3 秒轮询课程详情。

## 生产部署原则

目标是最低成本，同时保证重新部署后基本功能可用。

生产环境默认形态：

```text
国内轻量云服务器
+ Next.js 单体应用
+ PostgreSQL 本机服务或 Docker volume
+ 图片持久化目录 /data/pbl-images
```

代码目录可以随部署替换，以下路径不能随部署删除：

```text
/data/postgres
/data/pbl-images
/data/backups
```

生产环境变量：

```bash
DATABASE_URL=postgresql://...
STORAGE_DRIVER=local
STORAGE_DIR=/data/pbl-images
```

开发环境可以使用项目内 `.local/postgres` 和 `.env`，但 `.local`、`.env` 不进入 Git。

## 数据库迁移规范

所有数据库结构变更必须通过 Prisma migration 固化。

开发环境流程：

```bash
pnpm prisma:migrate --name change_name
pnpm prisma:generate
pnpm test
pnpm lint
pnpm build
```

生产环境只允许执行：

```bash
pnpm prisma:deploy
```

生产环境禁止：

```bash
pnpm prisma:migrate
pnpm prisma migrate dev
```

原因：
- `migrate dev` 是开发命令，会使用 shadow database，并可能产生交互式行为。
- 生产应该只应用已经提交到 Git 的 migration 文件。

安全变更：
- 新增可空字段
- 新增带默认值字段
- 新增表
- 新增索引

高风险变更：
- 删除字段
- 修改字段类型
- 字段从可空改必填
- 重命名字段
- 拆表 / 合表

高风险变更必须拆成多次发布。例如字段重命名：

1. 新增新字段
2. migration 或脚本回填旧数据
3. 应用代码改读写新字段
4. 线上验证
5. 下一次发布删除旧字段

## 备份规范

每次生产发版前必须备份数据库和图片目录。

数据库备份：

```bash
mkdir -p /data/backups
pg_dump "$DATABASE_URL" > /data/backups/pbl_$(date +%Y%m%d_%H%M%S).sql
```

图片备份：

```bash
tar -czf /data/backups/images_$(date +%Y%m%d_%H%M%S).tar.gz /data/pbl-images
```

最低要求：
- 每次发版前保留一份数据库备份
- 每次发版前保留一份图片备份
- 每周至少下载一份备份到服务器之外

如果 migration 包含删除字段、修改字段类型、批量回填，必须先在备份恢复环境验证。

## 生产发版流程

非 Docker 部署：

```bash
cd /srv/pbl-studio
git pull
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:deploy
pnpm build
pm2 restart pbl-studio
```

Docker Compose 部署：

```bash
cd /srv/pbl-studio
git pull
docker compose build app
docker compose run --rm app pnpm prisma:deploy
docker compose up -d app
```

发版后冒烟测试：

- 打开 `/login`
- 使用教师账号登录
- 打开 `/students`
- 新增并编辑一个测试学生
- 打开 `/courses`
- 打开课程预览和 PDF 预览

## 回滚原则

代码回滚不等于数据库回滚。

如果只改前端或 API 展示逻辑：

```bash
git checkout <previous-release>
pnpm install --frozen-lockfile
pnpm build
pm2 restart pbl-studio
```

如果 migration 已经修改生产数据：
- 优先用向前修复 migration
- 不直接手工改表
- 只有在确认数据不可恢复时，才从发版前备份恢复数据库

图片文件不随代码回滚删除。

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
pnpm prisma:deploy
pnpm test
pnpm lint
pnpm build
pnpm dev
```
