#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="pbl-v2-deploy.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
APP_ROOT="/data/pbl-studio-v2"
CURRENT_LINK="$APP_ROOT/current"
EXPECTED_USER="pblv2"

fail() {
  echo "Update aborted: $*" >&2
  exit 1
}

if (( EUID != 0 )); then
  fail "run this command with sudo"
fi

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SOURCE="$SOURCE_ROOT/deploy/pbl-v2-deploy.service"

[[ -f "$UNIT_SOURCE" ]] || fail "missing service definition: $UNIT_SOURCE"
[[ -x "$SOURCE_ROOT/scripts/deploy-shared-host.sh" ]] || fail "shared-host deploy script is not executable"
id "$EXPECTED_USER" >/dev/null 2>&1 || fail "Linux user does not exist: $EXPECTED_USER"
[[ -r /etc/pbl-studio-v2.env ]] || fail "environment file is not readable"

SWAP_KB="$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)"
[[ "$SWAP_KB" =~ ^[0-9]+$ ]] || fail "could not determine Swap size"
(( SWAP_KB >= 1024 * 1024 )) || fail "at least 1 GiB Swap must be enabled"

for old_app_name in pbl-studio ielts-writing-pro; do
  old_app_pid="$(runuser -u ubuntu -- env HOME=/home/ubuntu pm2 pid "$old_app_name" | tail -n 1)"
  [[ "$old_app_pid" =~ ^[1-9][0-9]*$ ]] || fail "old PM2 application is not online: $old_app_name"
done

if systemctl list-unit-files pm2-ubuntu.service --no-legend 2>/dev/null | grep -q '^pm2-ubuntu.service'; then
  if ! systemctl is-active --quiet pm2-ubuntu.service; then
    echo "Warning: old PM2 applications are online, but pm2-ubuntu.service is not active." >&2
  fi
fi

mkdir -p "$APP_ROOT/releases" "$APP_ROOT/deploy"
chown -R "$EXPECTED_USER:$EXPECTED_USER" "$APP_ROOT/releases" "$APP_ROOT/deploy"

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  fail "$CURRENT_LINK exists but is not a symlink"
fi

if [[ ! -L "$CURRENT_LINK" ]]; then
  ln -s "$SOURCE_ROOT" "$CURRENT_LINK"
  chown -h "$EXPECTED_USER:$EXPECTED_USER" "$CURRENT_LINK"
fi

install -m 0644 "$UNIT_SOURCE" "$SERVICE_FILE"
systemctl daemon-reload
systemd-analyze verify "$SERVICE_FILE"
systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true

echo "Starting the resource-limited production update. This can take several minutes."
UPDATE_STARTED_AT="$(date --iso-8601=seconds)"
systemctl start "$SERVICE_NAME" &
SYSTEMCTL_PID=$!

journalctl -fu "$SERVICE_NAME" --since "$UPDATE_STARTED_AT" -o cat &
JOURNAL_PID=$!

stop_log_follower() {
  kill "$JOURNAL_PID" >/dev/null 2>&1 || true
  wait "$JOURNAL_PID" 2>/dev/null || true
}
trap stop_log_follower EXIT

if ! wait "$SYSTEMCTL_PID"; then
  stop_log_follower
  trap - EXIT
  journalctl -u "$SERVICE_NAME" -n 200 --no-pager >&2
  fail "deployment service failed"
fi

stop_log_follower
trap - EXIT

systemctl is-failed --quiet "$SERVICE_NAME" && {
  journalctl -u "$SERVICE_NAME" -n 200 --no-pager >&2
  fail "deployment service reported a failed state"
}

curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3100/login \
  || fail "deployment completed but the local health check failed"

UPDATED_UNIT_SOURCE="$CURRENT_LINK/deploy/pbl-v2-deploy.service"
if [[ -f "$UPDATED_UNIT_SOURCE" ]]; then
  install -m 0644 "$UPDATED_UNIT_SOURCE" "$SERVICE_FILE"
  systemctl daemon-reload
fi

echo "Production update completed successfully."
echo "Current release: $(readlink -f "$CURRENT_LINK")"
runuser -u "$EXPECTED_USER" -- env HOME=/home/pblv2 pm2 list
