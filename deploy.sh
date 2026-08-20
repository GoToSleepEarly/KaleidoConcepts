#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATER="$ROOT_DIR/scripts/update-production.sh"

if [[ ! -x "$UPDATER" ]]; then
  echo "Deployment updater is missing or not executable: $UPDATER" >&2
  exit 1
fi

if (( EUID == 0 )); then
  exec "$UPDATER" "$@"
fi

exec sudo "$UPDATER" "$@"
