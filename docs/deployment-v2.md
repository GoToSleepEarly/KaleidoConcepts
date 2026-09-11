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
AUTH_COOKIE_SECURE="true"
HOSTNAME="127.0.0.1"
PORT="3100"
APP_NAME="pbl-studio-v2"
BRANCH="master"

DATABASE_URL="postgresql://pbl_v2_app:数据库密码@127.0.0.1:5432/pbl_studio_v2?schema=public"
DATABASE_URL_FOR_PG_DUMP="postgresql://pbl_v2_app:数据库密码@127.0.0.1:5432/pbl_studio_v2"
STORAGE_DIR="/data/pbl-studio-v2/images"
BACKUP_DIR="/data/backups/pbl-studio-v2"

QUICKROUTER_TEXT_API_KEY="..."
QUICKROUTER_IMAGE_API_KEY="..."
DEEPSEEK_TEXT_API_KEY="..."
CRAZYROUTER_TEXT_API_KEY="..."
CRAZYROUTER_IMAGE_API_KEY="..."
EASY88AI_TEXT_API_KEY="..."
EASY88AI_IMAGE_API_KEY="..."
```

`AUTH_COOKIE_SECURE` 默认跟随 `NODE_ENV`：生产环境为安全 Cookie，只能通过 HTTPS 使用。若公网入口暂时只能使用 HTTP，可短期显式设置为 `false`，使 Safari 等浏览器能够保存身份 Cookie；启用 HTTPS 后必须恢复为 `true`。修改该变量后需要重新发布或重启应用进程，老师随后退出并重新登录。

数据库密码包含 URL 保留字符时必须编码。模型、提供方和全部文本超时由当前账号的高级设置决定；环境变量只保存各提供方按能力拆分的密钥和图片请求超时，不配置文本超时、模型或提供方地址。QuickRouter、Crazyrouter 和 Easy88AI 的文本、图片密钥互不回退；DeepSeek 仅配置文本密钥。DeepSeek 官方地址固定预置为 `https://api.deepseek.com`。生产环境不得配置 `HTTP_PROXY` 或 `HTTPS_PROXY`。

文本思考强度、流式返回与四个文本超时由当前账号的高级设置决定，不读取任何 `*_TEXT_STREAM`、`TEXT_GENERATION_TIMEOUT_MS` 或 `COURSE_CONTENT_GENERATION_TIMEOUT_MS` 环境变量。流式模式仍由服务端聚合完整 Responses SSE、执行结构校验并返回原有 JSON，前端协议不变；流式响应中断时不得保存半截结果，也不得自动重试可能已经计费的请求。

旧的原地部署脚本默认拒绝执行，防止误用 `pnpm deploy:prod` 覆盖正在运行的 `.next`。只有专用独立主机显式配置 `DEPLOYMENT_TARGET="dedicated-host"` 才能使用旧脚本；共享主机不需要额外配置该变量。

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

进入当前重构版目录后，每次发布只执行一个根目录脚本：

```bash
cd /data/pbl-studio-v2/current
./deploy.sh
```

`deploy.sh` 会自动申请 sudo，并调用内部更新器检查 Swap 以及两个旧 PM2 应用的实际 PID、同步最新版 systemd service、实时显示资源受限发布任务的日志，并在失败时打印最近 200 行日志。`pm2-ubuntu.service` 未启用时只警告，不会把“systemd 未托管”误判成“旧应用已离线”。日志出现 `Deployment completed.`，随后显示 `Production update completed successfully.` 并回到命令提示符，才算部署完成。成功后会显示当前 release 和新版 PM2 状态，不需要记忆或执行内部脚本、`systemctl`、`journalctl`、migration 或 PM2 命令。

2026-08-20：一键更新器传给 `journalctl --since` 的起始时间使用 `YYYY-MM-DD HH:MM:SS`，兼容不接受 ISO 8601 时区偏移（如 `+08:00`）的旧版 systemd。该时间仅控制终端实时日志起点，不影响发布任务、备份、迁移或回滚。

需要单独复核时再执行：

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

仓库提供 `deploy/nginx-pbl-studio-v2.conf.example`。替换独立子域名和证书路径后复制到 `/etc/nginx/sites-available/pbl-studio-v2`，链接到 `sites-enabled`，先执行 `sudo nginx -t`，成功后再执行 `sudo systemctl reload nginx`。模板把连接建立时限设为 10 秒，把 `proxy_send_timeout`、`proxy_read_timeout` 和 `send_timeout` 统一设为 65 分钟：账户允许把应用流式硬上限从默认 20 分钟提高到最多 60 分钟，额外 5 分钟用于传输和收尾，因此任何合法账户配置下代理都不会成为更早的失败源。
