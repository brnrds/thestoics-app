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

- Shared stub auth layer shaped for future Clerk integration
- Prompt CRUD (`name`, `role`, `content`)
- Skill CRUD (`name`, `description`, `instruction body`)
- Interaction Mode CRUD with many-to-many prompt/skill assignments
- Mode default selection for new chats
- Private per-user chat threads with ownership-scoped create/read/update/delete
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

3. Ensure the dedicated RAG container is running on `pi` (one-time setup):

```bash
# see docs/pi-rag-deployment.md for full setup
ssh pi
cd ~/apps/stoics/deploy/pi
docker compose -f rag.compose.yml up -d --build
```

4. Open SSH tunnels to `pi` for Postgres and RAG (separate terminals):

```bash
ssh -N -L 5434:127.0.0.1:5434 pi
ssh -N -L 8010:127.0.0.1:8010 pi
```

5. Prepare database and seed initial mode/prompt/skill:

```bash
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:generate
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:push
DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public" pnpm db:seed
```

6. Run dev server:

```bash
pnpm dev
```

7. Open:

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
- `AUTH_PROVIDER`: reserved for the future Clerk swap; current implementation uses the stub provider
- `RAG_SERVER_URL`: base URL for rag-server-style service (for example `http://127.0.0.1:8010` when tunneled to `pi`)
- `RAG_SERVER_TIMEOUT_MS`: timeout for RAG requests in milliseconds
- `DATA_PATH`: optional ingestion source path for rag-server. Use a repo-relative path so it works in both local and Docker (recommended: `reference/found-books/human-approved`)

## Stub Auth Notes

- Middleware protects `/chat`, `/api/threads/*`, `/admin`, and `/api/admin/*`.
- Chat requests default to a stable stub user in local development.
- Thread and message APIs scope all reads and writes to the current app user.
- Legacy beta threads with no owner are discarded automatically on first thread API access.
- Unauthorized users are redirected to `/admin/blocked`.
- Enter `ADMIN_STUB_TOKEN` there to switch the current stub session into the admin role.
- Test requests can override the stub identity with `x-stub-user-id`, `x-stub-user-role`, and `x-stub-session-id`.
- Auth logic is isolated in `src/lib/auth` so Clerk can replace it with minimal route churn.

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

For stable local + production retrieval, run the container with:

- `DATA_PATH=reference/found-books/human-approved`
- `CHROMA_PATH=/data/chroma`

This keeps ingestion consistent across `pi` and `kamino`.

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

## Local RAG On `pi`

Local development uses a dedicated `rag` container on `pi`, bound to loopback only:

- Compose file: `deploy/pi/rag.compose.yml`
- Host bind: `127.0.0.1:8010 -> 8000`
- Volume: `stoics_rag_data`
- Source mount: repo checkout at `/workspace` (read-only)

Full setup and update instructions: `docs/pi-rag-deployment.md`

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
  - PostgreSQL in Docker volume `stoics_postgres_data`
  - Chroma data in Docker volume `stoics_rag_data`

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

Important env note:

- local `.env.local` may use `DATABASE_URL="postgresql://stoics:stoics_dev_password@127.0.0.1:5434/stoics?schema=public"`
- local `.env.local` should use `RAG_SERVER_URL="http://127.0.0.1:8010"` (SSH tunnel to `pi`)
- server `.env` should use `DATABASE_URL="postgresql://stoics:${POSTGRES_PASSWORD}@postgres:5432/stoics?schema=public"`
- server `.env` should use `RAG_SERVER_URL="http://rag:8000"`
- server `.env` should set `DATA_PATH="reference/found-books/human-approved"` for the `rag` service

### Drift Check Before Deploy

Before rebuilding on `kamino`, verify live containers match `compose.yml`:

```bash
cd /home/bcsantos/apps/alpha.thestoics.app/app
docker compose config --services
docker compose ps
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

Expected baseline:

- `docker compose config --services` includes `app`, `postgres`, and `rag`
- `docker compose ps` shows all three services healthy/running
- No legacy single-container service should remain attached to the same public route

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
- `compose.yml` provisions `postgres` and `rag`; `app` talks to RAG at `http://rag:8000` on the private Compose network.
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
