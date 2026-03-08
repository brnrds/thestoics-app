# Confer with the Stoics

Internal beta chat application for testing multiple Stoic interaction modes with shared retrieval (RAG), thread history, and admin-managed prompt/skill configuration.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4 (CSS-first patterns)
- AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`)
- Prisma + PostgreSQL
- D3.js 7.9.0 (admin visualization)
- Vitest (unit/smoke tests)

## Delivered Capabilities

- Admin stub auth on `/admin` routes (replaceable later with Clerk)
- Prompt CRUD (`name`, `role`, `content`)
- Skill CRUD (`name`, `description`, `instruction body`)
- Interaction Mode CRUD with many-to-many prompt/skill assignments
- Mode default selection for new chats
- Multi-thread chat with create/rename/delete and latest-activity ordering
- Required mode selection when creating new thread
- Thread mode snapshot stored at creation for historical reproducibility
- Deterministic server-side prompt assembly from mode prompts + skills
- AI SDK streaming chat runtime with stop/retry support
- Shared RAG adapter with `rag-server`-style request/response normalization
- Source citations attached to assistant messages and rendered in chat UI
- Graceful fallback when RAG is unavailable or returns no sources
- Tests for prompt assembly, mode snapshot resolution, RAG parsing, and thread/message smoke flows

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment file for Next.js runtime:

```bash
cp .env.example .env.local
```

3. Open the SSH tunnel to the dedicated Postgres container on `pi`:

```bash
ssh -N -L 5434:127.0.0.1:5434 pi
```

4. Prepare database and seed initial mode/prompt/skill:

```bash
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:generate
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:push
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:seed
```

5. Run dev server:

```bash
pnpm dev
```

6. Open:

- Chat workspace: `http://localhost:3000/chat`
- Admin: `http://localhost:3000/admin`

## Environment Variables

Use `.env.local`:

- `DATABASE_URL`: PostgreSQL URL for app runtime (default `postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public`)
- `TEST_DATABASE_URL`: PostgreSQL URL used by `pnpm test` (default `postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics_test?schema=public`)
- `POSTGRES_DB`: database name for Docker Compose PostgreSQL service (default `stoics`)
- `POSTGRES_USER`: database user for Docker Compose PostgreSQL service (default `stoics`)
- `POSTGRES_PASSWORD`: database password for Docker Compose PostgreSQL service
- `OPENAI_API_KEY`: required for live AI responses
- `OPENAI_MODEL`: optional model override (default `gpt-4o-mini`)
- `ADMIN_STUB_ENABLED`: `true`/`false` (defaults to `true`)
- `ADMIN_STUB_TOKEN`: token required to unlock `/admin`
- `RAG_SERVER_URL`: base URL for rag-server-style service (for example `http://localhost:8000`)
- `RAG_SERVER_TIMEOUT_MS`: timeout for RAG requests in milliseconds

## Admin Stub Auth Notes

- Middleware protects `/admin` and `/api/admin/*`.
- Unauthorized users are redirected to `/admin/blocked`.
- Enter `ADMIN_STUB_TOKEN` there to set a secure HTTP-only cookie.
- Stub auth logic is isolated in `src/lib/auth/admin-stub.ts` so Clerk can replace it with minimal refactor.

## RAG Service Expectations

The app calls `POST {RAG_SERVER_URL}/rag/retrieve` with a retrieval-focused payload:

- Request includes: `query`, optional `k`, and optional `score_threshold`.
- Response supports: `{ query, context, sources, match_count }`.
- Sources are normalized to:

```ts
{
  source: string;
  excerpt: string;
  page?: number | null;
}
```

If RAG is down, chat still responds with graceful fallback behavior and empty citation state.

The `services/rag-server` default `DATA_PATH` is the repo root, with common heavy directories excluded (`node_modules`, `.next`, `.git`, etc.).

## Local PostgreSQL On `pi`

Local development uses a dedicated Docker container on `pi`:

- Container: `stoics-postgres`
- Host bind: `127.0.0.1:5434 -> 5432`
- Volume: `stoics_postgres_data`
- Databases: `stoics`, `stoics_test`

This is intentionally isolated from the other Docker workloads on `pi`. Access it through SSH tunneling instead of exposing it on the LAN.

Provisioning command on `pi`:

```bash
docker run -d \
  --name stoics-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=stoics \
  -e POSTGRES_PASSWORD=stoics_dev_password \
  -e POSTGRES_DB=stoics \
  -p 127.0.0.1:5434:5432 \
  -v stoics_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
docker exec stoics-postgres psql -U stoics -d postgres -c 'CREATE DATABASE stoics_test'
```

## Scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:push
pnpm db:seed
```

## Deployment

Production is currently served at:

- `https://alpha.thestoics.app`

Current server layout on `kamino`:

- Repo checkout: `/home/bcsantos/apps/alpha.thestoics.app/app`
- Reverse proxy: host `nginx`
- Public app port: `127.0.0.1:3120 -> 3000`
- Services: `app` (Next.js), `postgres` (PostgreSQL), `rag` (Python retrieval service)
- Persistence:
  - PostgreSQL in Docker volume `app_stoics_postgres_data`
  - Chroma data in Docker volume `app_stoics_rag_data`

### Deployment Files

The repo includes the production deployment artifacts:

- `Dockerfile`
- `compose.yml`
- `.dockerignore`
- `docker/app-entrypoint.sh`

### Server Env

On `kamino`, the server-only env file lives at:

```bash
/home/bcsantos/apps/alpha.thestoics.app/app/.env
```

Keep secrets only there. Do not commit them.

Important production note:

- local `.env.local` may use `DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public"`
- local `.env.local` may use `RAG_SERVER_URL="http://127.0.0.1:8000"`
- server `.env` should use `DATABASE_URL="postgresql://stoics:${POSTGRES_PASSWORD}@postgres:5432/stoics?schema=public"`
- server `.env` should use `RAG_SERVER_URL="http://rag:8000"`

### Update Process

When shipping a new version:

1. Push the desired commit to GitHub.
2. SSH to `kamino`.
3. Pull and rebuild the stack:

```bash
cd /home/bcsantos/apps/alpha.thestoics.app/app
git pull --ff-only
docker compose up -d --build
```

4. Verify:

```bash
docker compose ps
curl -I http://127.0.0.1:3120
curl -k -I --resolve alpha.thestoics.app:443:127.0.0.1 https://alpha.thestoics.app
```

### Notes

- `nginx` and TLS are managed on the host, not in Docker.
- The app container runs `pnpm db:push` and `pnpm db:seed` on startup.
- `compose.yml` now provisions a `postgres` service for containerized environments.
- Migrating an existing SQLite deployment to PostgreSQL is a separate one-time data migration task; this repo change does not copy old SQLite data automatically.
- The RAG container runs ingestion on startup before serving requests.

## Verification

Run all quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run tests against the dedicated test database:

```bash
TEST_DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics_test?schema=public" pnpm test
```
