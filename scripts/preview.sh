#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3001}"

cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install pnpm first."
  exit 1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use."
  echo "Use another port with: PORT=3002 scripts/preview.sh"
  exit 1
fi

echo "Starting Kaleido Concepts preview server..."
echo "Root: $ROOT_DIR"
echo "Port: $PORT"
echo "Cleaning stale Next.js cache..."
rm -rf .next
echo
echo "Open the app in your browser and operate through the UI."
echo "Do not run pnpm build while this dev server is running; both write to .next."
echo "Press Ctrl+C to stop."
exec pnpm exec next dev -p "$PORT"
