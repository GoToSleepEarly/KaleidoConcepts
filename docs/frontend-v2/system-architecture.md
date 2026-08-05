# 新系统隔离与 V1 退役契约

## 决策

V1 与新系统按两个独立产品实例部署，不在一个 Next.js 进程或一个数据库中维护兼容层。

新系统不迁移 V1 数据，不复用 V1 Prisma schema，不保留 `workflowMode`、`V2` 表名、`/api/v2` 或 `features/*-v2` 等长期版本分支。

## V1 冻结基线

- 冻结提交：`ea69627`
- 冻结分支：`codex/v1-frozen`
- 冻结标签：`v1.0.0-legacy`
- 分支和标签已推送到 `origin`
- V1 冻结后只服务旧课程，不再创建新课程或继续功能开发

## 单机部署拓扑

同一台国内轻量云服务器复用 Nginx 和一个 PostgreSQL 服务，但数据库、应用进程、部署目录和图片目录完全分离。

```text
Nginx
├─ 新系统 -> PM2: pbl-studio -> PostgreSQL database: pbl_studio -> /data/pbl-images
└─ 旧系统 -> PM2: pbl-studio-v1 -> PostgreSQL database: pbl_studio_v1 -> /data/pbl-v1-images
```

实际域名在部署模块确认。推荐旧系统使用独立二级域名，避免 Next.js `basePath`、静态资源和路由相互影响。

## 用户入口

- 新系统课程列表只显示新系统课程。
- 导航提供“旧版课程”入口，打开独立 V1 地址。
- 不做跨数据库课程聚合、跨系统编辑或自动数据迁移。
- V1 与新系统可以暂时使用相同账号信息，但身份和会话不做共享真相源。

## 代码与命名

新系统是未来唯一主系统，因此使用正式命名：

- 页面：`/courses/...`
- API：`/api/...`
- 前端领域代码：`features/courses/`、`features/people/`
- 服务端领域代码：`lib/server/courses/`、`lib/server/people/`
- 类型合同：`lib/contracts/`

重构期间 `docs/frontend-v2/` 仅用于把新契约与旧文档隔离；重构完成后迁移为正式文档目录。

## 数据与存储

- 新系统从空数据库执行自己的首个 Prisma migration。
- V1 和新系统使用不同 `DATABASE_URL`。
- V1 和新系统使用不同 `STORAGE_DIR`。
- 任何代码部署目录都不得承载生产数据库或图片。
- 两套系统分别备份数据库和图片目录。
- 新系统发布或破坏性 migration 前必须先验证备份可恢复。

## 发布与回滚

- V1 只从 `v1.0.0-legacy` 或 `codex/v1-frozen` 部署。
- 新系统从当前主开发线部署。
- V1 和新系统使用独立 PM2 进程，发布一方不重启另一方。
- 新系统回滚不触碰 V1 数据库和图片目录。
- V1 下线前，先导出数据库并归档图片；确认归档后再停止进程和移除入口。

## 不做的方案

- 不在同一 Prisma schema 中保留 V1/V2 两套表。
- 不用 `workflowMode` 在同一应用内分流。
- 不用一个课程列表实时读取两个数据库。
- 不为短期 V1 存续建设长期兼容层。

## 验收标准

- V1 冻结引用在远端可恢复。
- 新系统可以在空数据库独立启动。
- 两个应用进程、数据库和图片目录互不覆盖。
- 新系统没有运行时 `V2` 命名和 V1 schema 依赖。
- 停止 V1 不影响新系统运行。

## 实现状态

- 状态：已确认、已归档、已实现当前模块边界。
- 实现：V1 冻结分支/标签已推送；当前分支已移除 V1 课程运行时代码，并使用独立 schema、migration、数据库端口和图片目录。
- 验证：全新 PostgreSQL 数据目录成功执行 `pnpm prisma:deploy` 和 `pnpm prisma:seed`，随后独立启动新系统预览。
- 提交号：待本次用户验收后记录。
