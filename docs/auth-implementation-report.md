# Auth Implementation Report

Date: March 8, 2026

## Purpose

This report documents the auth system that was implemented for the multi-user migration. It explains:

- the current auth architecture
- how user and admin identity are resolved
- how route protection works
- how thread ownership is enforced
- what security fixes were applied during implementation
- what remains to be done for the eventual Clerk swap

This implementation follows the direction in `docs/multi-user-model-report.md` and the contract targets in `docs/clerk-contract-alignment.md`.

## Summary

The app now has a shared auth boundary in `src/lib/auth` instead of separate ad hoc checks.

Current state:

- all chat routes are authenticated through a single auth adapter
- each request resolves one acting user
- a local `User` row is created or updated automatically on demand
- each `ConversationThread` is owned by one app user
- all thread and message operations are scoped to that owner
- admin access uses the same auth system, with role checks based on `sessionClaims.metadata.role`
- legacy unowned beta threads are explicitly discarded

The current provider is still a stub, but it is shaped to match Clerk closely enough that the later swap should be localized.

## Implemented Architecture

### 1. Shared auth module

The auth boundary now lives in:

```text
src/lib/auth/
  index.ts
  types.ts
  provider-stub.ts
  helpers.ts
  admin-stub.ts
```

Responsibilities:

- `types.ts` defines the Clerk-shaped auth result and current-user types
- `provider-stub.ts` implements the active auth provider
- `helpers.ts` provides app-level helpers like `requireCurrentUser()`, `requireAdmin()`, and `ensureAppUser()`
- `index.ts` is the import surface used by the rest of the app
- `admin-stub.ts` remains as a compatibility shim that re-exports the new auth behavior

The rest of the app now imports auth from `@/lib/auth`, not from provider-specific code.

### 2. Clerk-shaped stub provider

The stub provider in `src/lib/auth/provider-stub.ts` implements a Clerk-like contract:

- async `auth()`
- static `auth.protect()`
- async `currentUser()`
- `clerkMiddleware()`
- `createRouteMatcher()`

The returned auth object includes:

- `userId`
- `sessionId`
- `isAuthenticated`
- `sessionClaims`
- `getToken()`
- `has()`
- `redirectToSignIn()`

This keeps the app code aligned with the expected Clerk integration shape.

### 3. Local app user model

The Prisma schema now includes:

- `User`
- `UserRole`
- `ConversationThread.userId`
- a relation from `ConversationThread` to `User`
- an index on `[userId, updatedAt]`

The local `User` model stores:

- `authProviderUserId`
- `email`
- `displayName`
- `role`

This allows the app to keep relational ownership and app-specific roles while still treating Clerk as the future identity provider.

## Request Auth Flow

### Normal authenticated request

For a chat or admin request:

1. Middleware classifies the route.
2. Protected routes call `auth.protect()`.
3. Route handlers call `requireCurrentUser()` or `requireAdmin()`.
4. `requireCurrentUser()` calls `ensureAppUser()`.
5. `ensureAppUser()` upserts a local `User` row using `auth().userId`.
6. Route handlers use the app user ID for all database scoping.

### Admin request

Admin access uses the same auth system as normal users.

Current stub behavior:

- the default stub session is a normal user
- admin role is activated only through the admin token flow
- `/api/admin/login` validates `ADMIN_STUB_TOKEN`
- successful login sets the stub admin cookies
- later requests resolve as the admin stub identity
- admin authorization checks use `sessionClaims.metadata.role === 'admin'`

This matches the role-checking shape planned for Clerk.

## Middleware Protection

`middleware.ts` now uses the auth adapter rather than the old boolean token gate.

Protected routes:

- `/chat(.*)`
- `/api/threads(.*)`
- `/admin(.*)`
- `/api/admin(.*)`

Behavior:

- chat routes require an authenticated user
- admin routes require an admin role
- unauthenticated or unauthorized admin page requests are redirected
- unauthorized admin API requests return JSON errors

The middleware now follows the same pattern that Clerk middleware will use later.

## Thread Ownership Enforcement

The multi-user behavior is enforced in the thread and message APIs:

- `GET /api/threads` lists only the current user’s threads
- `POST /api/threads` creates a thread owned by the current user
- `GET /api/threads/[id]` returns a thread only if it belongs to the current user
- `PATCH /api/threads/[id]` renames only the current user’s thread
- `DELETE /api/threads/[id]` deletes only the current user’s thread
- `POST /api/threads/[id]/messages` sends and regenerates messages only within the current user’s thread

Non-owned thread access returns `404`, which avoids leaking whether another user’s thread ID exists.

## Security Fixes Applied

Two important auth boundary bugs were discovered and fixed during implementation.

### 1. Stub header impersonation

Original issue:

- the stub provider accepted `x-stub-user-id`, `x-stub-user-role`, and `x-stub-session-id` directly from normal runtime requests
- that allowed arbitrary user impersonation
- it also allowed direct admin escalation without the token flow

Final behavior:

- header overrides are only honored when `NODE_ENV === 'test'`
- normal runtime traffic ignores those headers entirely
- admin elevation comes from the validated admin-token cookie flow only

### 2. `ADMIN_STUB_ENABLED=false` opening admin access

Original issue:

- disabling the admin stub effectively removed the admin boundary
- that could make all admin routes act open or privileged

Final behavior:

- the default runtime identity remains a normal user
- `ADMIN_STUB_ENABLED=false` disables the stub admin login flow
- it does not grant admin access
- admin routes still require an actual admin session

## Legacy Data Policy

The chosen policy for pre-migration beta chat data was:

- discard existing unowned threads

Implemented behavior:

- `src/lib/legacy-thread-cleanup.ts` deletes `ConversationThread` rows where `userId` is `null`
- the cleanup runs before thread/message API access
- this avoids leaving invisible legacy rows in the database

This makes the migration behavior explicit instead of silently hiding old data.

## Testing and Verification

The implementation added and updated tests for:

- thread CRUD under user ownership
- message send flow under user ownership
- cross-user isolation
- admin helper rejection for non-admin users
- stub auth boundary hardening
- legacy unowned thread cleanup

One additional test-runner change was needed:

- `vitest.config.ts` now disables file-level parallelism

Reason:

- the tests share a real PostgreSQL test database
- parallel file execution caused DB-backed races between test files

Verification completed successfully with:

- `pnpm db:push`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`

## Current Limitations

The auth system is still stub-backed.

That means:

- there is no real sign-in or sign-out provider yet
- the default local runtime identity is a stable stub user
- admin login is still controlled by `ADMIN_STUB_TOKEN`
- user profile data is synthetic stub data, not provider-backed profile data

This is intentional for the current phase. The goal was to get ownership and access control correct first.

## Clerk Swap Readiness

The implementation was designed so Clerk can replace the stub with minimal churn.

What is already aligned:

- Clerk-shaped `auth()` result
- Clerk-style `auth.protect()`
- Clerk-style `currentUser()`
- Clerk-style middleware wrapper
- role checks via `sessionClaims.metadata.role`
- local `User.authProviderUserId` mapping to `auth().userId`

What remains for the Clerk phase:

- add `provider-clerk.ts`
- switch `src/lib/auth/index.ts` to provider selection
- configure Clerk middleware
- wire real `auth()` and `currentUser()`
- customize session claims so role appears in `sessionClaims.metadata`
- replace the admin token screen with Clerk-backed admin access

## Bottom Line

The app now has a real multi-user auth boundary for the chat product:

- one acting user per request
- local user ownership in the database
- per-user thread and message isolation
- admin authorization through the same auth system
- explicit legacy-data cleanup
- test coverage for both isolation and auth-boundary regressions

The current provider is still a stub, but the architecture is now in the right shape for a controlled Clerk integration rather than another redesign.
