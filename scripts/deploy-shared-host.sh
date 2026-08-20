#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/pbl-studio-v2.env}"
APP_ROOT="/data/pbl-studio-v2"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
DEPLOY_STATE_DIR="$APP_ROOT/deploy"
EXPECTED_APP_NAME="pbl-studio-v2"
EXPECTED_DATABASE_NAME="pbl_studio_v2"
EXPECTED_STORAGE_DIR="$APP_ROOT/images"
EXPECTED_BACKUP_DIR="/data/backups/pbl-studio-v2"
MIN_FREE_KB=$((5 * 1024 * 1024))
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

fail() {
  echo "Deployment aborted: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

if [[ ! -r "$ENV_FILE" ]]; then
  fail "environment file is not readable: $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

for command_name in curl flock git pg_dump pm2 pnpm psql tar; do
  require_command "$command_name"
done

[[ "${APP_NAME:-}" == "$EXPECTED_APP_NAME" ]] || fail "APP_NAME must be $EXPECTED_APP_NAME"
[[ "${HOSTNAME:-}" == "127.0.0.1" ]] || fail "HOSTNAME must be 127.0.0.1"
[[ "${PORT:-}" == "3100" ]] || fail "PORT must be 3100"
[[ "${STORAGE_DIR:-}" == "$EXPECTED_STORAGE_DIR" ]] || fail "STORAGE_DIR must be $EXPECTED_STORAGE_DIR"
[[ "${BACKUP_DIR:-}" == "$EXPECTED_BACKUP_DIR" ]] || fail "BACKUP_DIR must be $EXPECTED_BACKUP_DIR"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "${DATABASE_URL_FOR_PG_DUMP:-}" ]] || fail "DATABASE_URL_FOR_PG_DUMP is required"
[[ -n "${SEED_ADMIN_PASSWORD:-}" ]] || fail "SEED_ADMIN_PASSWORD is required"

mkdir -p "$RELEASES_DIR" "$DEPLOY_STATE_DIR" "$BACKUP_DIR"
[[ -d "$STORAGE_DIR" ]] || fail "storage directory does not exist: $STORAGE_DIR"

exec 9>"$DEPLOY_STATE_DIR/deploy.lock"
flock -n 9 || fail "another deployment is already running"

if [[ ! -L "$CURRENT_LINK" ]]; then
  fail "$CURRENT_LINK must be a symlink to the currently running release"
fi

PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
[[ -d "$PREVIOUS_RELEASE" ]] || fail "current release does not exist: $PREVIOUS_RELEASE"
[[ -d "$PREVIOUS_RELEASE/.git" ]] || fail "current release is not a Git checkout: $PREVIOUS_RELEASE"

ACTUAL_DATABASE_NAME="$(psql "$DATABASE_URL_FOR_PG_DUMP" -Atc 'SELECT current_database()')"
[[ "$ACTUAL_DATABASE_NAME" == "$EXPECTED_DATABASE_NAME" ]] || {
  fail "database safety check failed: expected $EXPECTED_DATABASE_NAME, got $ACTUAL_DATABASE_NAME"
}

AVAILABLE_KB="$(df -Pk "$RELEASES_DIR" | awk 'NR == 2 { print $4 }')"
[[ "$AVAILABLE_KB" =~ ^[0-9]+$ ]] || fail "could not determine available disk space"
(( AVAILABLE_KB >= MIN_FREE_KB )) || fail "less than 5 GiB is available for a new release"

REPOSITORY_URL="$(git -C "$PREVIOUS_RELEASE" remote get-url origin)"
BRANCH="${BRANCH:-master}"
STAGING_PARENT="$(mktemp -d "$RELEASES_DIR/.staging.XXXXXX")"
STAGING_RELEASE="$STAGING_PARENT/release"

echo "==> Cloning $REPOSITORY_URL ($BRANCH)"
git clone \
  --branch "$BRANCH" \
  --single-branch \
  --reference-if-able "$PREVIOUS_RELEASE" \
  --dissociate \
  "$REPOSITORY_URL" \
  "$STAGING_RELEASE"

COMMIT_SHA="$(git -C "$STAGING_RELEASE" rev-parse HEAD)"
SHORT_SHA="${COMMIT_SHA:0:12}"
RELEASE_DIR="$RELEASES_DIR/${TIMESTAMP}_${SHORT_SHA}"
[[ ! -e "$RELEASE_DIR" ]] || fail "release directory already exists: $RELEASE_DIR"

echo "==> Installing locked dependencies with low concurrency"
cd "$STAGING_RELEASE"
pnpm install --frozen-lockfile --prefer-offline --network-concurrency=1 --child-concurrency=1

echo "==> Generating Prisma client"
pnpm prisma:generate

echo "==> Building release $SHORT_SHA"
NODE_OPTIONS="--max-old-space-size=896" NEXT_TELEMETRY_DISABLED=1 pnpm build

mv "$STAGING_RELEASE" "$RELEASE_DIR"
rmdir "$STAGING_PARENT"

echo "==> Backing up database and images"
DB_BACKUP="$BACKUP_DIR/database_${TIMESTAMP}_${SHORT_SHA}.sql"
IMAGE_BACKUP="$BACKUP_DIR/images_${TIMESTAMP}_${SHORT_SHA}.tar.gz"
pg_dump "$DATABASE_URL_FOR_PG_DUMP" > "$DB_BACKUP"
tar -czf "$IMAGE_BACKUP" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

echo "==> Applying migrations and seed from the built release"
cd "$RELEASE_DIR"
pnpm prisma:deploy
pnpm prisma:seed

start_release() {
  local release_path="$1"
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  cd "$release_path"
  pm2 start pnpm \
    --name "$APP_NAME" \
    --cwd "$release_path" \
    --max-memory-restart 700M \
    -- start
}

health_check() {
  local health_url="http://127.0.0.1:${PORT}/login"
  local attempt
  for attempt in $(seq 1 60); do
    if curl --fail --silent --show-error --output /dev/null "$health_url"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback_code() {
  echo "==> New release failed; restoring previous application code" >&2
  if start_release "$PREVIOUS_RELEASE" && health_check; then
    pm2 save
    echo "Previous release restored: $PREVIOUS_RELEASE" >&2
  else
    echo "Previous release also failed to start; manual recovery is required." >&2
  fi
}

echo "==> Switching PM2 to $RELEASE_DIR"
if ! start_release "$RELEASE_DIR"; then
  rollback_code
  fail "PM2 could not start the new release"
fi

if ! health_check; then
  pm2 logs "$APP_NAME" --lines 100 --nostream || true
  rollback_code
  fail "new release failed the local health check"
fi

NEXT_LINK="$APP_ROOT/.current.${TIMESTAMP}"
ln -s "$RELEASE_DIR" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"
pm2 save

echo "Deployment completed."
echo "Release: $RELEASE_DIR"
echo "Commit: $COMMIT_SHA"
echo "Database backup: $DB_BACKUP"
echo "Image backup: $IMAGE_BACKUP"
echo "Previous release retained for rollback: $PREVIOUS_RELEASE"
