# 重构版同机部署手册

## 部署边界

重构版与旧程序运行在同一台 2 GiB 腾讯云服务器上。两套程序共享操作系统，但不得共享运行用户、代码目录、数据库、图片目录、PM2 daemon、端口或域名。

| 资源 | 旧程序 | 重构版固定值 |
| --- | --- | --- |
| Linux 用户 | `ubuntu` | `pblv2` |
| 代码入口 | 保持现状 | 首次为 `/opt/pbl-studio-v2`，更新后为 `/data/pbl-studio-v2/current` |
| 发布目录 | 不使用 | `/data/pbl-studio-v2/releases` |
| 数据库 | 保持现状 | `pbl_studio_v2` |
| 数据库用户 | 保持现状 | `pbl_v2_app` |
| 图片目录 | 保持现状 | `/data/pbl-studio-v2/images` |
| 备份目录 | 保持现状 | `/data/backups/pbl-studio-v2` |
| PM2 应用 | 保持现状 | `pbl-studio-v2` |
| PM2 用户 | `ubuntu` | `pblv2` |
| 本机端口 | 保持现状 | `127.0.0.1:3100` |
| 环境文件 | 保持现状 | `/etc/pbl-studio-v2.env` |

禁止在旧程序目录执行 `git pull master`。旧版代码固定在 `v1.0.0-pre-refactor-final`，重构版从 `master` 发布。

## 主机资源保护

服务器只有 2 GiB 内存，必须启用 2 GiB Swap：

```bash
free -h
sudo swapon --show
```

旧程序必须由 `ubuntu` 用户的 `pm2-ubuntu.service` 开机恢复：

```bash
sudo systemctl is-enabled pm2-ubuntu
pm2 ls
```

发布任务通过 systemd 固定限制为半个 CPU、768 MiB 内存软阈值、1200 MiB 硬上限和最低 I/O 调度优先级。不要在服务器直接运行 `pnpm install`、`pnpm build` 或 `pnpm deploy:prod`。

## 环境变量

`/etc/pbl-studio-v2.env` 必须由 `pblv2` 读取，权限为 `600`：

```bash
sudo chown pblv2:pblv2 /etc/pbl-studio-v2.env
sudo chmod 600 /etc/pbl-studio-v2.env
```

关键固定值：

```dotenv
NODE_ENV="production"
HOSTNAME="127.0.0.1"
PORT="3100"
APP_NAME="pbl-studio-v2"
BRANCH="master"
DEPLOYMENT_TARGET="shared-host"

DATABASE_URL="postgresql://pbl_v2_app:数据库密码@127.0.0.1:5432/pbl_studio_v2?schema=public"
DATABASE_URL_FOR_PG_DUMP="postgresql://pbl_v2_app:数据库密码@127.0.0.1:5432/pbl_studio_v2"
STORAGE_DIR="/data/pbl-studio-v2/images"
BACKUP_DIR="/data/backups/pbl-studio-v2"
```

数据库密码包含 URL 保留字符时必须编码。DeepSeek 使用官方直连；QuickRouter 与 Crazyrouter 使用各自配置的 key。生产环境不得配置 `HTTP_PROXY` 或 `HTTPS_PROXY`。

`DEPLOYMENT_TARGET="shared-host"` 会让旧的原地部署脚本主动拒绝执行，防止误用 `pnpm deploy:prod` 覆盖正在运行的 `.next`。专用独立主机只有显式配置 `dedicated-host` 才能使用旧脚本。

## 首次部署验证

首次 baseline migration 与 seed 完成后的固定数据为：

- `Course = 0`
- `User = 1`
- `Person = 0`
- `PersonVisualAsset = 0`
- `PresetOption = 114`

验证：

```bash
cd /tmp
sudo -u pblv2 env HOME=/home/pblv2 /bin/bash --noprofile --norc -c '
  set -a
  . /etc/pbl-studio-v2.env
  set +a
  psql "$DATABASE_URL_FOR_PG_DUMP" -c "
    SELECT
      (SELECT COUNT(*) FROM \"Course\") AS courses,
      (SELECT COUNT(*) FROM \"User\") AS users,
      (SELECT COUNT(*) FROM \"Person\") AS people,
      (SELECT COUNT(*) FROM \"PersonVisualAsset\") AS visuals,
      (SELECT COUNT(*) FROM \"PresetOption\") AS presets;
  "
'
```

直接执行 `sudo -iu pblv2 bash -lc` 会产生双层登录 Shell，可能让变量在加载环境文件前被展开为空；生产命令统一使用上面的单层 Bash 形式。

## 一次性安装安全更新服务

以下操作只执行一次。

1. 创建发布目录并建立初始 `current` 链接：

```bash
sudo mkdir -p /data/pbl-studio-v2/releases /data/pbl-studio-v2/deploy
sudo chown -R pblv2:pblv2 /data/pbl-studio-v2

sudo -u pblv2 ln -s /opt/pbl-studio-v2 /data/pbl-studio-v2/current
```

如果 `current` 已存在，先用 `readlink -f /data/pbl-studio-v2/current` 确认目标，不要覆盖普通目录。

2. 安装部署 service：

```bash
sudo cp /opt/pbl-studio-v2/deploy/pbl-v2-deploy.service /etc/systemd/system/pbl-v2-deploy.service
sudo systemctl daemon-reload
sudo systemctl cat pbl-v2-deploy.service
```

该 service 只允许手动启动，不提供 `[Install]` 段，因此不能被设成开机自动发布。

3. 配置重构版 PM2 开机恢复：

```bash
sudo /usr/bin/pm2 startup systemd -u pblv2 --hp /home/pblv2
sudo -u pblv2 env HOME=/home/pblv2 pm2 save
sudo systemctl is-enabled pm2-pblv2
```

## 后续更新

每次发布只执行：

```bash
sudo systemctl reset-failed pbl-v2-deploy.service
sudo systemctl start --no-block pbl-v2-deploy.service
sudo journalctl -fu pbl-v2-deploy.service
```

日志显示 `Deployment completed.` 后按 `Ctrl+C`，再验证：

```bash
sudo systemctl status pbl-v2-deploy.service --no-pager -l
readlink -f /data/pbl-studio-v2/current
sudo -u pblv2 env HOME=/home/pblv2 pm2 ls
curl -I http://127.0.0.1:3100/login
pm2 ls
```

最后一条直接执行的 `pm2 ls` 属于 `ubuntu`，用于确认旧程序仍然在线。

安全更新脚本执行顺序：

1. 验证应用名、端口、数据库名和持久化目录，防止误连旧资源。
2. 在 `/data/pbl-studio-v2/releases/.staging.*` 拉取并低并发安装。
3. 在 systemd 资源上限内生成 Prisma Client 和构建 Next.js。
4. 构建成功后备份新数据库和图片。
5. 从已构建的新 release 执行 `prisma migrate deploy` 和幂等 seed。
6. 让 `pblv2` 的 PM2 切换至新 release。
7. 本机 `/login` 健康检查成功后原子更新 `current` 链接并保存 PM2。

构建、备份或 migration 失败时，当前运行版本不会停止。PM2 切换或健康检查失败时，脚本会恢复上一个代码版本。数据库 migration 不做自动逆向回滚，因此未来 schema 变更必须保持前后版本兼容；数据库 SQL 和图片压缩包会保留在备份目录供人工恢复。

脚本不会自动删除历史 release，避免误删当前版本或唯一回滚版本。磁盘剩余空间不足 5 GiB 时会拒绝发布，历史清理由人工核对 `current` 和 PM2 cwd 后单独执行。

## 公网入口

新版只监听 `127.0.0.1:3100`，腾讯云安全组不得开放 `3100` 或 `5432`。先通过 SSH 隧道完成登录、文本生成、图片生成、图片编辑和 PDF 验收，再为独立子域名增加反向代理。旧域名和旧 upstream 不在新版部署脚本作用域内。

当前 Next.js 没有配置 `basePath`，不能挂载到旧域名的 `/v2` 子路径；必须使用独立子域名。
