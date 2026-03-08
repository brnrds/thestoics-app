#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../services/rag-server" && pwd)"
VENV="$DIR/.venv"

if [ ! -d "$VENV" ]; then
  echo "Creating virtualenv at $VENV …"
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

cd "$DIR"

pip install -q -r requirements.txt

if [ ! -d ".chroma" ] && [ ! -d "/data/chroma" ]; then
  echo "Running initial ingestion …"
  python -m app.cli ingest
fi

exec uvicorn app.main:app --reload --port 8000
