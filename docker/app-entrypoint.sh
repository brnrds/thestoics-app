#!/bin/sh
set -eu

export DATABASE_URL="${DATABASE_URL:-postgresql://stoics:stoics_dev_password@postgres:5432/stoics?schema=public}"
export RAG_SERVER_URL="${RAG_SERVER_URL:-http://rag:8000}"

pnpm db:push
pnpm db:seed

exec pnpm start
