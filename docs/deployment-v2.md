# 重构版并行部署手册

## 部署目标

重构版作为独立实例运行，不覆盖旧程序。两套程序必须使用不同的代码目录、PostgreSQL 数据库、图片目录、PM2 进程名、端口和域名。新实例稳定后再单独安排旧实例下线。

| 资源 | 旧程序 | 重构版建议值 |
| --- | --- | --- |
| 代码目录 | 保持现状 | `/opt/pbl-studio-v2` |
| 数据库 | 保持现状 | `pbl_studio_v2` |
| 数据库用户 | 保持现状 | `pbl_v2_app` |
| 图片目录 | 保持现状 | `/data/pbl-studio-v2/images` |
| 备份目录 | 保持现状 | `/data/backups/pbl-studio-v2` |
| PM2 进程 | 保持现状 | `pbl-studio-v2` |
| 本机端口 | 保持现状 | `3100` |
| 域名 | 保持现状 | 独立子域名，例如 `v2.example.com` |
| 环境文件 | 保持现状 | `/etc/pbl-studio-v2.env` |

不要把重构版挂到旧程序数据库的另一个 schema。使用独立数据库才能让 migration、回滚和后续下线互不影响。

## 一、部署前盘点旧实例

先记录旧实例资源，后续命令不得复用这些值：

```bash
pm2 ls
sudo nginx -T
sudo -u postgres psql -c '\l'
sudo ss -lntp
```

旧程序继续运行，不停止、不重启，也不修改其 Nginx 配置。

## 二、创建新数据库和持久化目录

数据库密码示例只作占位，执行时换成强密码：

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE pbl_v2_app LOGIN PASSWORD 'replace-with-database-password';
CREATE DATABASE pbl_studio_v2 OWNER pbl_v2_app ENCODING 'UTF8';
SQL

sudo mkdir -p /opt/pbl-studio-v2
sudo mkdir -p /data/pbl-studio-v2/images
sudo mkdir -p /data/backups/pbl-studio-v2
sudo chown -R "$USER":"$USER" /opt/pbl-studio-v2 /data/pbl-studio-v2 /data/backups/pbl-studio-v2
```

代码重新部署不会删除 `/data/pbl-studio-v2/images`，人物与课程图片必须一直保存在这里。

## 三、拉取 master

```bash
git clone --branch master git@github.com:GoToSleepEarly/KaleidoConcepts.git /opt/pbl-studio-v2
cd /opt/pbl-studio-v2
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

服务器需要 Node.js 22 或更高版本、PostgreSQL 客户端、Git、tar、pnpm 和 PM2。

## 四、配置独立环境变量

创建 `/etc/pbl-studio-v2.env` 并设置为仅部署用户可读：

```bash
sudo cp /opt/pbl-studio-v2/.env.example /etc/pbl-studio-v2.env
sudo chown "$USER":"$USER" /etc/pbl-studio-v2.env
chmod 600 /etc/pbl-studio-v2.env
vi /etc/pbl-studio-v2.env
```

必须逐项填写：

```dotenv
NODE_ENV="production"
HOSTNAME="127.0.0.1"
PORT="3100"
APP_NAME="pbl-studio-v2"
BRANCH="master"

DATABASE_URL="postgresql://pbl_v2_app:replace-with-database-password@localhost:5432/pbl_studio_v2?schema=public"
DATABASE_URL_FOR_PG_DUMP="postgresql://pbl_v2_app:replace-with-database-password@localhost:5432/pbl_studio_v2"
STORAGE_DIR="/data/pbl-studio-v2/images"
BACKUP_DIR="/data/backups/pbl-studio-v2"
SEED_ADMIN_PASSWORD="replace-with-a-strong-password"

QUICKROUTER_TEXT_API_KEY="replace-with-quickrouter-text-api-key"
QUICKROUTER_IMAGE_API_KEY="replace-with-quickrouter-image-api-key"
QUICKROUTER_GPT_TEXT_MODEL="gpt-5.6-sol"
QUICKROUTER_RESEARCH_MODEL="gpt-5.6-sol"
QUICKROUTER_IMAGE_MODEL="gpt-image-2"

DEEPSEEK_API_KEY="replace-with-deepseek-api-key"
DEEPSEEK_MODEL="deepseek-chat"
DEEPSEEK_BASE_URL="https://api.deepseek.com"

CRAZYROUTER_API_KEY="replace-with-crazyrouter-api-key"
CRAZYROUTER_GPT_TEXT_MODEL="gpt-5.6-sol"
CRAZYROUTER_RESEARCH_MODEL="gpt-5.6-sol"
CRAZYROUTER_IMAGE_MODEL="gpt-image-2"

TEXT_GENERATION_TIMEOUT_MS="600000"
COURSE_CONTENT_GENERATION_TIMEOUT_MS="600000"
IMAGE_GENERATION_TIMEOUT_MS="600000"
```

账号预置为 `teacher`。`SEED_ADMIN_PASSWORD` 仅在新库首次创建账号时使用，后续部署不会覆盖数据库里的现有密码。账号默认选择 Crazyrouter，因此至少必须配置 `CRAZYROUTER_API_KEY`；如果界面允许切换 QuickRouter，也必须同时配置两组 QuickRouter key。DeepSeek 始终使用官方直连。

## 五、一次性部署

```bash
cd /opt/pbl-studio-v2
ENV_FILE=/etc/pbl-studio-v2.env pnpm deploy:prod
pm2 save
```

脚本按以下顺序执行：拉取 `master`、备份新实例数据库和图片目录、安装锁定依赖、生成 Prisma Client、执行全部 production migrations、幂等导入预置数据和人物图片、构建、启动或重启 `pbl-studio-v2`。

首次导入后的预期数据：

- `Course` 为 `0`，不会携带本地测试课程。
- `User` 为 `1`。
- `Person` 为 `6`，包含归档记录。
- `PersonVisualAsset` 为 `6`，对应文件写入独立图片目录。
- `PresetOption` 为 `123`，其中活动预设 114 条、归档兼容预设 9 条。

验证：

```bash
pm2 describe pbl-studio-v2
curl -I http://127.0.0.1:3100/login

set -a
. /etc/pbl-studio-v2.env
set +a
psql "$DATABASE_URL_FOR_PG_DUMP" -c 'SELECT COUNT(*) AS courses FROM "Course";'
psql "$DATABASE_URL_FOR_PG_DUMP" -c 'SELECT COUNT(*) AS people FROM "Person";'
psql "$DATABASE_URL_FOR_PG_DUMP" -c 'SELECT COUNT(*) AS visuals FROM "PersonVisualAsset";'
psql "$DATABASE_URL_FOR_PG_DUMP" -c 'SELECT COUNT(*) AS presets FROM "PresetOption";'
find /data/pbl-studio-v2/images/person-visuals -type f | wc -l
```

## 六、配置独立域名

不要直接替换旧域名 upstream。新增一个 Nginx server：

```nginx
server {
    listen 80;
    server_name v2.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d v2.example.com
```

长文本和图片请求可能持续数分钟，因此反向代理读写超时设为 15 分钟。使用独立子域名是因为当前 Next.js 应用没有配置 `basePath`，不能无损挂载到旧域名的 `/v2` 子路径。

## 七、失败与回滚

新域名未替换旧域名，因此重构版失败不会影响旧程序。停止新实例即可：

```bash
pm2 stop pbl-studio-v2
```

需要回滚新实例时，先停止新 PM2 进程，再把 `/opt/pbl-studio-v2` 切回指定提交，并恢复本次部署输出的数据库 SQL 和图片压缩包。不要把新数据库备份恢复到旧数据库，也不要让两套程序共用图片目录。

旧程序下线必须作为后续独立操作：先确认新域名、课程生成、人物图片、AI 中转站和 PDF 导出全部验收通过，再迁移域名流量；至少保留旧数据库和图片备份一个完整回滚周期。
