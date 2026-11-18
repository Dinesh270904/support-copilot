#!/usr/bin/env bash
# One-command local start: seed SQLite, start FastAPI (which launches the MCP stdio
# server), and start the Vite frontend. Ctrl+C stops everything.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/backend/.venv/bin/python" ]; then DEFAULT_PY="$ROOT/backend/.venv/bin/python"; else DEFAULT_PY=python3; fi
PY="${PYTHON:-$DEFAULT_PY}"

cd "$ROOT/backend"
if [ ! -f data/support.db ] || [ "${RESEED:-0}" = "1" ]; then
  echo "==> Migrating and seeding SQLite (data/support.db)"
  "$PY" -m app.seed
fi

echo "==> Starting API on http://127.0.0.1:8000 (docs at /docs); it launches the MCP server over stdio"
"$PY" -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT INT TERM

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
echo "==> Starting UI on http://localhost:5173"
npm run dev -- --host 127.0.0.1
