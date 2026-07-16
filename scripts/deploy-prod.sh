#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-master}"
APP_NAME="${APP_NAME:-pbl-studio}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
STORAGE_DIR="${STORAGE_DIR:-/data/pbl-images}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

cd "$ROOT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

for cmd in git pnpm tar pg_dump pm2; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required."
  exit 1
fi

if [[ ! -d "$STORAGE_DIR" ]]; then
  echo "Storage directory does not exist: $STORAGE_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Pulling code from origin/$BRANCH"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Backing up database"
DB_BACKUP="$BACKUP_DIR/pbl_${TIMESTAMP}.sql"
pg_dump "$DATABASE_URL" > "$DB_BACKUP"

echo "==> Backing up images"
IMAGE_BACKUP="$BACKUP_DIR/images_${TIMESTAMP}.tar.gz"
tar -czf "$IMAGE_BACKUP" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Generating Prisma client"
pnpm prisma:generate

echo "==> Applying Prisma migrations"
pnpm prisma:deploy

echo "==> Building app"
pnpm build

echo "==> Restarting pm2 process: $APP_NAME"
pm2 restart "$APP_NAME"

echo "Deployment finished."
echo "Database backup: $DB_BACKUP"
echo "Image backup: $IMAGE_BACKUP"
