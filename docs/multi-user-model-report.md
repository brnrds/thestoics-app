# Multi-User Model Report

Date: March 8, 2026

## Summary

The app already has most of the product behavior needed for a multi-user chat product:

- conversation threads exist
- message history per thread exists
- thread mode snapshots already preserve historical behavior

What it does not have yet is ownership and access control. Today, threads are effectively global. Moving to a real multi-user model is mainly a matter of introducing authenticated identity, attaching each thread to a user, and enforcing that scope everywhere the app reads or writes chat data.

In broad terms, the process is:

1. Add a server-side auth abstraction with stubbed user and admin identities.
2. Add a user ownership model in the database.
3. Scope all thread and message APIs to the current user.
4. Update the chat UI to assume authenticated, per-user data.
5. Add isolation-focused tests using the stub auth layer.
6. Perform documentation research to confirm the auth contracts and methodologies align with Clerk.
7. Swap the stub auth layer to Clerk once behavior is stable.
8. Decide how to handle existing unowned beta data.

## Current State In This Repo

The current codebase is close to multi-user structurally, but not in access control:

- [prisma/schema.prisma](/Users/bcsantos/Desktop/Kirkpatrick/stoics/prisma/schema.prisma) has `ConversationThread` and `Message`, but no `User` model and no owner field on threads.
- [src/app/api/threads/route.ts](/Users/bcsantos/Desktop/Kirkpatrick/stoics/src/app/api/threads/route.ts) lists all threads and creates new ones without a user context.
- [src/app/api/threads/[id]/route.ts](/Users/bcsantos/Desktop/Kirkpatrick/stoics/src/app/api/threads/[id]/route.ts) reads, renames, and deletes threads by raw thread ID.
- [src/app/api/threads/[id]/messages/route.ts](/Users/bcsantos/Desktop/Kirkpatrick/stoics/src/app/api/threads/[id]/messages/route.ts) sends and regenerates messages for any thread ID it can load.
- [middleware.ts](/Users/bcsantos/Desktop/Kirkpatrick/stoics/middleware.ts) only protects admin routes.
- [src/lib/auth/admin-stub.ts](/Users/bcsantos/Desktop/Kirkpatrick/stoics/src/lib/auth/admin-stub.ts) is a temporary cookie/token gate, not user authentication.

This means the app already understands "thread list" and "history per thread", but it currently treats those records as shared application data rather than private user data.

## Recommended Target Model

Recommended MVP target:

- Every end user authenticates with Clerk.
- Every `ConversationThread` belongs to exactly one user.
- Every `Message` continues to belong to a thread, not directly to a user.
- A user can only list, read, update, delete, and send messages to their own threads.
- Interaction modes, prompts, skills, and RAG remain global admin-managed resources.
- Admin screens are protected by Clerk role checks instead of the current stub.

This keeps the first multi-user version narrow and defensible:

- private conversations only
- no shared threads
- no organizations
- no team workspaces
- no per-user custom modes yet

## Recommended Delivery Strategy

Even though Clerk is the target authentication system, the faster implementation path is to introduce it late, not early.

Recommended sequencing:

- design the auth boundary first
- implement user ownership and access control against stubs
- verify multi-user isolation with tests
- review Clerk documentation once the multi-user behavior is stable
- integrate Clerk only after the behavior is already correct

Rationale:

- Clerk adds development friction during normal local work.
- The highest-risk logic in this project is data scoping, not the auth vendor itself.
- If auth is abstracted cleanly, the app can be built against stubs first and then switched to Clerk with much less disruption.
- The stub contracts should aim to be Clerk-compatible, but that compatibility needs to be validated before final integration.

The architectural goal is:

- define one auth interface now
- back it with stubs during development
- validate it against Clerk documentation before the swap
- back it with Clerk at the end

This should be done "the Clerk way", just not too soon. The app should avoid inventing a custom long-term auth model that later fights the final Clerk integration.

## Recommended Data Model Changes

### Option A: Minimal ownership only

Add an external auth user ID directly onto `ConversationThread`:

- `ConversationThread.userId: String`
- index on `[userId, updatedAt]`

This is the smallest change, but it becomes limiting if you later need:

- user roles
- user preferences
- user deletion workflows
- analytics by user
- mirrored auth-provider profile fields

### Option B: Local app user table

Recommended approach:

```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  id          String               @id @default(cuid())
  authProviderUserId String        @unique
  email       String?
  displayName String?
  role        UserRole             @default(USER)
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  threads     ConversationThread[]
}
```

Then update `ConversationThread`:

- add `userId`
- add relation to `User`
- add index on `[userId, updatedAt]`

Why this is the better fit here:

- Clerk remains the identity provider.
- The app still has a local relational record for ownership and roles.
- Admin authorization becomes cleaner.
- Future features like saved preferences, quotas, exports, and soft deletion become easier.
- The local model can be finalized to match Clerk expectations after the documentation review.

## Broad Migration Process

### 1. Add An Auth Boundary With Stubs

Introduce a shared server-side auth layer before changing ownership behavior, but keep it stubbed at first.

Broad tasks:

- add shared helpers such as `requireCurrentUser()` and `requireAdmin()`
- define a normalized auth shape used by APIs and middleware
- provide stub identities for development and tests
- extend the current admin stub idea so normal users can also be stubbed
- make routes depend on the auth abstraction, not directly on provider-specific calls or stub cookies

Recommended principle:

- never trust a client-supplied user ID
- derive the acting user from a server-side auth helper

Recommended stub shape:

- one stubbed current user identity
- one stubbed admin role flag
- optional header/cookie override for tests so different fake users can be simulated

### 2. Create Or Mirror Users In The App Database

Once the auth layer identifies a user, the server should ensure an app-level user record exists.

Typical pattern:

- auth layer resolves an external identity
- server reads a stable external user ID
- app `upsert`s local `User` row by `authProviderUserId`

This can happen:

- on first authenticated request
- in a shared auth helper

For the stub phase, the external ID can be a fake stable value like `stub-user-1`.

For MVP, request-time upsert is usually enough.

### 3. Attach Thread Ownership

Update the schema so each thread is owned by one user.

Broad tasks:

- add `userId` to `ConversationThread`
- backfill or assign ownership for existing rows
- create required indexes for per-user thread listing

Important design choice:

- keep `Message` linked only through `threadId`

That is enough because ownership is inherited from the thread, and it avoids redundant data that can drift.

### 4. Scope The Chat APIs

This is the most important application change.

Today the thread routes operate globally. In the multi-user model:

- `GET /api/threads` returns only the current user’s threads
- `POST /api/threads` creates a thread owned by the current user
- `GET /api/threads/[id]` returns the thread only if owned by the current user
- `PATCH /api/threads/[id]` renames only the current user’s thread
- `DELETE /api/threads/[id]` deletes only the current user’s thread
- `POST /api/threads/[id]/messages` sends or regenerates only within the current user’s thread

Recommended behavior for unauthorized access:

- return `404` for a thread the user does not own

That avoids leaking whether another user’s thread ID exists.

### 5. Update The Frontend Assumptions

The UI impact is smaller than the backend impact because the product model already fits multi-user chat.

Broad changes:

- require authenticated access before `/chat`
- load thread list for the signed-in user only
- preserve current thread/message UX
- show a clean first-run state for users with no conversations
- ensure sign-out returns the UI to an unauthenticated state

The chat UI does not need a conceptual rewrite. It mainly needs to stop assuming a single global thread space.

### 6. Integrate Clerk Last

Once ownership, query scoping, and tests are already working, replace the stub auth provider with Clerk.

Recommended replacement:

- authenticated users handled by Clerk
- local app role of `ADMIN` for admin pages and admin APIs
- route and middleware enforcement still goes through the shared auth boundary
- remove direct dependence on stub cookies/tokens once Clerk is live

This also answers a likely future need:

- admins can still be normal users with their own chat threads
- admin capability becomes a role, not a separate login system

Important implementation rule:

- do not spread Clerk-specific calls across many routes
- keep Clerk wiring inside the shared auth layer so the swap is localized

Before starting this step, do a focused documentation research pass against Clerk.

Purpose of that research:

- confirm that the auth contracts created during the stub phase align with Clerk
- confirm that the planned route protection methodology aligns with Clerk
- confirm that the local user/admin model aligns with Clerk-backed identity assumptions
- identify any contract or naming mismatches before implementation begins

This report intentionally does not prescribe Clerk internals. The point is to keep the app Clerk-aligned without introducing Clerk too early.

### 7. Decide What To Do With Existing Data

This is the one migration question that cannot be avoided.

Current beta threads have no owner. You need one explicit policy:

### Option A: Assign all existing threads to one bootstrap admin

Best when existing data is worth keeping.

Pros:

- preserves beta content
- simplest operationally

Cons:

- old data remains under one account, not original authors

### Option B: Archive or discard existing chat data

Best when current data is disposable beta content.

Pros:

- cleanest migration
- least ambiguity

Cons:

- loses historical threads

### Option C: Export old data, then start fresh

Best when you want a backup without carrying it into the first multi-user release.

Recommendation:

- if this is still early beta, Option B or C is cleaner
- if the existing history is important, Option A is acceptable for the first pass

### 8. Add Isolation-Focused Tests

The highest-risk part of this project is accidental data leakage between users.

New tests should cover:

- user A cannot list user B’s threads
- user A cannot fetch user B’s thread by ID
- user A cannot rename or delete user B’s thread
- user A cannot send messages to user B’s thread
- new signed-in user starts with an empty thread list
- admin routes reject non-admin authenticated users

This is more important than adding broad feature coverage. The main thing to prove is ownership isolation.

## Suggested Delivery Phases

### Phase 1: Secure private-user chat MVP

Scope:

- shared auth abstraction
- stubbed user/admin identities
- local `User` model
- thread ownership
- scoped thread/message APIs
- admin role via app user model

This is the correct first milestone.

### Phase 2: Clerk integration

Scope:

- documentation research to validate contract alignment with Clerk
- swap auth abstraction from stubs to Clerk
- adjust contracts or naming if the research shows misalignment
- protected route handling through the Clerk-backed auth boundary
- remove temporary stub auth paths

### Phase 3: User profile and account lifecycle

Scope:

- display name sync
- email sync
- account deletion handling
- soft delete or retention policy

### Phase 4: Optional future enhancements

Scope:

- shared threads
- organizations/workspaces
- per-user mode preferences
- user search/export/history management

These should not be part of the first migration.

## Main Risks

### 1. Incomplete query scoping

If even one route still queries by thread ID without ownership checks, one user may access another user’s data.

### 2. Auth wiring leaks into app code

If route handlers call Clerk directly everywhere, the late integration will be noisy and error-prone.

The fix is simple:

- keep one shared auth adapter
- keep route handlers dependent on the adapter only

### 3. Stub contracts drift away from the final Clerk model

If the stub phase invents contracts that feel convenient locally but do not match the final Clerk direction, the last-mile integration will become a redesign instead of a swap.

The mitigation is:

- keep the auth surface area small
- keep naming generic until the Clerk review
- schedule explicit documentation research before final integration

### 4. Migration ambiguity for old data

If ownership of old threads is not decided before rollout, deployment becomes messy.

### 5. Over-scoping the first release

Trying to solve sharing, orgs, and fine-grained permissions in the same pass will slow the project down and increase risk.

## Recommended Approach For This App

For this codebase, the cleanest path is:

1. Add a shared auth abstraction and keep it stubbed during most of development.
2. Add a local `User` table with `authProviderUserId` and `role`.
3. Add `userId` ownership to `ConversationThread`.
4. Scope all chat APIs by authenticated user through the auth abstraction.
5. Extend stubs so both normal-user and admin paths can be tested locally.
6. Verify multi-user isolation thoroughly while still on stubs.
7. Do a Clerk documentation research pass to validate contracts and methodology.
8. Integrate Clerk behind the same auth abstraction.
9. Migrate or discard existing unowned beta chat data explicitly.
10. Ship only private per-user chat in the first release.

That gives you the core multi-user model you described:

- each user has their own conversation list
- each conversation has its own history
- no user can see another user’s conversations

without forcing a larger redesign.

## Open Questions

These are the main product/technical decisions still worth making before implementation:

1. Should `/chat` be fully authenticated, or should there still be a public landing/demo state?
2. Should admins also have normal personal chat accounts, or should admin access be separate?
3. Do you want to preserve current beta threads, or is it acceptable to start fresh?
4. Do you expect organization or team support soon, or only individual users for now?
5. Do you want a local `User` table immediately, or do you prefer the smallest possible first pass with only external auth IDs on threads?

## Bottom Line

This is a moderate backend/auth migration, not a product rewrite.

The conversation and message model already exists. The real work is:

- auth abstraction
- ownership in the database
- server-side authorization on every chat route
- admin/user stub design
- contract alignment review before Clerk integration
- final Clerk integration

If scope stays narrow, the first multi-user version should be straightforward.
