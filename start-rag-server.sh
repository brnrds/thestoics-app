#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAG_DIR="$ROOT_DIR/services/rag-server"
ENV_FILE="$ROOT_DIR/.env.local"
VENV_PY="$RAG_DIR/.venv/bin/python"

if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing rag-server venv at $VENV_PY"
  echo "Run: cd $RAG_DIR && python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt"
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HOST="${RAG_SERVER_HOST:-127.0.0.1}"
PORT="${RAG_SERVER_PORT:-8000}"

cd "$RAG_DIR"
exec "$VENV_PY" -m uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
