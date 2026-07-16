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

if command -v cygpath >/dev/null 2>&1; then
  ENV_FILE="$(cygpath -u "$ENV_FILE")"
fi

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
  echo "Expected to load it from: $ENV_FILE"
  echo "If this is the first run, create $ROOT_DIR/.env from .env.example and fill in production values."
  exit 1
fi

if [[ -z "${DATABASE_URL_FOR_PG_DUMP:-}" ]]; then
  DATABASE_URL_FOR_PG_DUMP="${DATABASE_URL%%\?*}"
fi

if [[ -z "${DATABASE_URL_FOR_PG_DUMP:-}" ]]; then
  echo "Failed to derive a pg_dump-compatible DATABASE_URL from DATABASE_URL."
  echo "Your DATABASE_URL likely contains Prisma-only query params."
  exit 1
fi

if [[ "$DATABASE_URL_FOR_PG_DUMP" == *"schema="* ]]; then
  echo "DATABASE_URL_FOR_PG_DUMP still contains Prisma-only query params."
  echo "Set DATABASE_URL_FOR_PG_DUMP explicitly in production if your pg_dump connection needs extra options."
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
pg_dump "$DATABASE_URL_FOR_PG_DUMP" > "$DB_BACKUP"

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
