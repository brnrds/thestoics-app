# Clerk Contract Alignment Report

Date: March 8, 2026

## Purpose

This report documents the exact contracts that Clerk exposes for Next.js App Router applications, so the stubbed auth layer built during Phase 1 of the multi-user migration (see `docs/multi-user-model-report.md`) can be designed to match them. The goal is to make the Phase 2 swap from stubs to Clerk a localized replacement, not a redesign.

All information was sourced from the official Clerk documentation at `clerk.com/docs`.

---

## 1. `auth()` — The Primary Server-Side Auth Helper

**Import:** `import { auth } from '@clerk/nextjs/server'`

**Behavior:** Async function. Must be awaited. Reads from the session token embedded in the request — no network call, no latency cost. Available in Server Components, Route Handlers, and Server Actions. Requires `clerkMiddleware()` to be configured in `middleware.ts`.

### Return shape

When authenticated:

```typescript
{
  userId: string               // e.g. "user_2NNEqL2nrIRdJ197GQH..."
  sessionId: string            // e.g. "sess_abc123..."
  isAuthenticated: true
  sessionClaims: {
    sub: string                // same as userId
    sid: string                // same as sessionId
    iss: string                // issuer
    iat: number                // issued at (Unix seconds)
    exp: number                // expiration (Unix seconds)
    nbf: number                // not before
    azp: string                // authorized party
    metadata?: {               // custom claims added via Dashboard
      role?: string            // e.g. "admin" — from publicMetadata
    }
    // ... other standard JWT fields
  }
  sessionStatus: 'active'
  tokenType: 'session_token'
  orgId: undefined             // only set when an Organization is active
  orgRole: undefined
  orgSlug: undefined
  orgPermissions: undefined
  factorVerificationAge: [number, number] | null
  actor: undefined             // only set during impersonation

  getToken: (options?: { template?: string }) => Promise<string | null>
  has: (params: { role?: string; permission?: string }) => boolean
  redirectToSignIn: (options?: { returnBackUrl?: string }) => never
}
```

When not authenticated, the identity fields (`userId`, `sessionId`) are `null`, and `isAuthenticated` is `false`.

### `auth.protect()` — static method

Called on the import itself, not on the returned object:

```typescript
import { auth } from '@clerk/nextjs/server'

await auth.protect()                                    // reject if not authenticated
await auth.protect({ role: 'org:admin' })               // reject if wrong role
await auth.protect({ permission: 'org:posts:manage' })  // reject if missing permission
await auth.protect((has) => has({ role: '...' }))       // custom predicate
```

Behavior on rejection:
- Document requests → redirect to sign-in page
- API/data requests → return 401 or 404

On success, returns the Auth object.

### Stub implications

The stub `auth()` must:
- be async
- return an object with the fields above
- support destructuring: `const { userId, isAuthenticated, sessionClaims } = await auth()`
- include `sessionClaims.metadata.role` for admin checks
- provide a `redirectToSignIn()` that throws or redirects
- provide a no-op `getToken()` returning `null`
- provide a `has()` that checks role/permission against the stub identity

The stub must also expose `auth.protect()` as a static method on the function itself.

---

## 2. `currentUser()` — Full User Profile

**Import:** `import { currentUser } from '@clerk/nextjs/server'`

**Behavior:** Async. Unlike `auth()`, this makes a **backend API call** to Clerk and returns the full user record. Use it only when you need profile data, not for auth checks.

### Return shape

Returns `BackendUser | null`. Key fields:

```typescript
{
  id: string                        // same value as auth().userId
  firstName: string | null
  lastName: string | null
  fullName: string | null           // computed getter
  username: string | null
  imageUrl: string
  hasImage: boolean

  emailAddresses: EmailAddress[]    // array of { id, emailAddress, verification }
  primaryEmailAddressId: string | null
  primaryEmailAddress: EmailAddress | null  // computed

  publicMetadata: {                 // readable everywhere, writable backend only
    role?: string                   // "admin", "moderator", etc.
  }
  privateMetadata: Record<string, unknown>  // backend only
  unsafeMetadata: Record<string, unknown>   // frontend-writable — not for security

  passwordEnabled: boolean
  banned: boolean
  locked: boolean
  createdAt: number                 // Unix ms
  updatedAt: number                 // Unix ms
  lastSignInAt: number | null
  lastActiveAt: number | null
}
```

### When to use `currentUser()` vs `auth()`

| Need | Use |
|---|---|
| Check if user is authenticated | `auth()` |
| Get userId for database queries | `auth()` |
| Check role from session claims | `auth()` |
| Get user's email, name, avatar | `currentUser()` |
| Read `publicMetadata` or `privateMetadata` | `currentUser()` |

### Stub implications

The stub `currentUser()` must:
- be async
- return an object with `id`, `firstName`, `lastName`, `emailAddresses`, `publicMetadata`, `imageUrl` (can be a placeholder URL)
- return `null` when the stub identity is not set
- the `id` field must equal the `userId` returned by `auth()`

---

## 3. `clerkMiddleware()` — Route Protection

**Import:** `import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'`

**File:** `middleware.ts` in root or `src/`.

**Default behavior:** All routes are **public** by default. Protection is opt-in inside the middleware callback.

### Pattern: protect specific routes

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/chat(.*)',
  '/api/threads(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### Pattern: role check in middleware

```typescript
const isAdminRoute = createRouteMatcher(['/admin(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth()
    if (sessionClaims?.metadata?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})
```

### Middleware callback signature

```typescript
(auth: AuthFn & { protect: ProtectFn }, req: NextRequest) => void | Response
```

`auth` inside the middleware callback is both:
- callable: `const { userId, isAuthenticated, redirectToSignIn } = await auth()`
- has a static `.protect()`: `await auth.protect()`

### `createRouteMatcher()`

Takes an array of route patterns (string globs) and returns a function `(req: NextRequest) => boolean`.

### Stub implications

The stub middleware must:
- export a default function matching the `clerkMiddleware(callback)` signature
- support `createRouteMatcher()` for pattern-based route classification
- call back into the same stub `auth()` so route handlers and middleware share identity
- the existing `middleware.ts` matcher pattern for admin routes (`/admin/:path*`, `/api/admin/:path*`) maps cleanly to `createRouteMatcher(['/admin(.*)', '/api/admin(.*)'])`

---

## 4. Route Handler Auth Patterns

### Pattern A: auto-reject unauthenticated

```typescript
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId } = await auth.protect()
  // userId is guaranteed non-null here
  // ...
}
```

### Pattern B: manual check (recommended for APIs)

```typescript
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId, isAuthenticated } = await auth()
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // use userId for scoped queries
}
```

### Pattern C: admin check

```typescript
import { auth } from '@clerk/nextjs/server'

export async function POST() {
  const { userId, sessionClaims } = await auth()
  if (sessionClaims?.metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // admin-only logic
}
```

### Stub implications

The multi-user report proposes helpers named `requireCurrentUser()` and `requireAdmin()`. These should be thin wrappers that call the stub `auth()` internally:

```typescript
async function requireCurrentUser() {
  const { userId, isAuthenticated, sessionClaims } = await auth()
  if (!isAuthenticated || !userId) {
    throw new AuthError('Not authenticated')  // or return 401
  }
  return { userId, sessionClaims }
}

async function requireAdmin() {
  const { userId, sessionClaims } = await requireCurrentUser()
  if (sessionClaims?.metadata?.role !== 'admin') {
    throw new AuthError('Not authorized')  // or return 403
  }
  return { userId, sessionClaims }
}
```

These helpers are **not Clerk-specific** — they are application-level convenience wrappers. They will survive the Clerk swap unchanged as long as the underlying `auth()` call is swapped.

---

## 5. Role and Admin Handling

### Clerk's role model without Organizations

For apps that do not use Clerk Organizations (which is the case for this MVP), Clerk recommends storing roles in `user.publicMetadata`:

```json
{
  "role": "admin"
}
```

This metadata is set via the Clerk Backend API or Dashboard, never from the frontend.

### Making roles available in `auth()`

Roles do not appear in `sessionClaims` by default. They must be explicitly added to the session token via the Clerk Dashboard (Sessions → Customize session token):

```json
{
  "metadata": "{{user.public_metadata}}"
}
```

Once configured, `auth()` returns:

```typescript
{
  sessionClaims: {
    metadata: {
      role: "admin"
    }
  }
}
```

### Checking roles

```typescript
const { sessionClaims } = await auth()
const isAdmin = sessionClaims?.metadata?.role === 'admin'
```

### Metadata types

| Type | Readable from | Writable from | Use for |
|---|---|---|---|
| `publicMetadata` | Frontend + Backend | Backend only | Roles, feature flags — safest for RBAC |
| `privateMetadata` | Backend only | Backend only | Sensitive internal data |
| `unsafeMetadata` | Frontend + Backend | Frontend + Backend | User preferences (not security-sensitive) |

### Stub implications

The stub must:
- set `sessionClaims.metadata.role` to `'admin'` for admin stubs
- leave `sessionClaims.metadata.role` as `undefined` or `'user'` for normal user stubs
- the `User` model's `role` field (proposed as `UserRole.ADMIN | UserRole.USER` in the multi-user report) maps directly to this value
- role checks should always go through `sessionClaims.metadata.role`, never through a separate mechanism

---

## 6. ID Formats

Clerk uses prefixed string IDs. The stub should follow the same convention so code that logs, stores, or validates these IDs is never surprised.

| Entity | Prefix | Example |
|---|---|---|
| User | `user_` | `user_2NNEqL2nrIRdJ197GQHp5k3Xwyz` |
| Session | `sess_` | `sess_abc123def456` |
| Organization | `org_` | `org_abc123def456` |
| Email Address | `idn_` | `idn_abc123` |

### Stub ID conventions

Use recognizable stub-prefixed IDs for development:

```
user_stub_user1        — default stub user
user_stub_admin1       — default stub admin
sess_stub_session1     — default stub session
```

For test overrides (simulating multiple users), use:

```
user_stub_testA
user_stub_testB
sess_stub_testA
sess_stub_testB
```

These are distinct enough to be immediately identifiable in logs and database records, while following Clerk's prefix convention.

---

## 7. Testing Considerations

### Clerk provides no mock layer

Clerk does not ship a mock or stub for `auth()` or `currentUser()`. Their testing guidance is oriented toward E2E flows with real Clerk sessions. This confirms that the stub-first approach in the multi-user report is the right call — without our own stub, there is no way to unit-test or integration-test auth-dependent code locally.

### Stub-based test strategy

The stub auth layer should support identity switching via request headers so isolation tests can simulate multiple users without external dependencies:

| Header | Effect |
|---|---|
| `x-stub-user-id` | Override the stub user ID (e.g. `user_stub_testA`) |
| `x-stub-user-role` | Override the stub role (e.g. `admin`) |
| `x-stub-session-id` | Override the stub session ID |

When no override headers are present, the stub returns the default development identity.

This mechanism is only active when `AUTH_PROVIDER=stub` (or equivalent env flag). When Clerk is active, these headers are ignored.

---

## 8. Mapping Existing Code to the Clerk Contract

### Current `admin-stub.ts`

The existing admin stub (`src/lib/auth/admin-stub.ts`) is a cookie-based token gate:

- checks a cookie (`stoics_admin`) against a known token
- returns a boolean (authorized or not)
- has no concept of user identity, session, or claims

This will be **replaced**, not extended. The new auth abstraction must cover both user identity and admin authorization.

### Current `middleware.ts`

The existing middleware:

- matches `/admin/:path*` and `/api/admin/:path*`
- redirects unauthorized admin requests to `/admin/blocked`
- returns 401 JSON for unauthorized admin API requests

This maps well to the Clerk middleware pattern:

| Current pattern | Clerk equivalent |
|---|---|
| `isAdminAuthorizedFromRequest(request)` | `const { sessionClaims } = await auth()` + role check |
| `config.matcher: ['/admin/:path*']` | `createRouteMatcher(['/admin(.*)'])` |
| redirect to `/admin/blocked` | `return NextResponse.redirect(...)` or `redirectToSignIn()` |
| 401 JSON for API routes | `return NextResponse.json({ error }, { status: 401 })` |

The new middleware will additionally need to protect chat routes (`/chat(.*)`, `/api/threads(.*)`) for user authentication, not just admin routes.

### Current route handlers

The thread routes (`src/app/api/threads/route.ts`, etc.) currently accept any request without auth checks. After the migration, every route handler must:

1. Call `auth()` (or a wrapper like `requireCurrentUser()`)
2. Extract `userId`
3. Scope all database queries by `userId`

---

## 9. The `authProviderUserId` Field

The multi-user report proposes a local `User` model with an `authProviderUserId` field. This field should store the Clerk `userId` (e.g. `user_2NNEqL2nrIRdJ197GQH...`).

The mapping:

```
auth().userId  →  User.authProviderUserId
```

The upsert pattern:

```typescript
const { userId } = await auth()  // Clerk user ID or stub user ID

const appUser = await prisma.user.upsert({
  where: { authProviderUserId: userId },
  update: { updatedAt: new Date() },
  create: {
    authProviderUserId: userId,
    email: user?.emailAddresses?.[0]?.emailAddress,
    displayName: user?.firstName,
    role: 'USER',
  },
})
```

During the stub phase, `userId` will be a value like `user_stub_user1`. During Clerk, it will be a real Clerk user ID. The application code does not need to know the difference — it just stores and queries by `authProviderUserId`.

---

## 10. Recommended Stub Module Structure

Based on the contracts above, the stub auth layer should expose the same top-level API that the Clerk integration will eventually provide, behind an internal adapter:

```
src/lib/auth/
  index.ts                 — re-exports from the active provider
  types.ts                 — shared AuthResult, AppUser, etc. types
  provider-stub.ts         — stub implementation of auth(), currentUser(), middleware
  provider-clerk.ts        — (future) Clerk implementation, same exports
  helpers.ts               — requireCurrentUser(), requireAdmin(), ensureAppUser()
```

`index.ts` selects the active provider based on environment:

```typescript
if (process.env.AUTH_PROVIDER === 'clerk') {
  // re-export from provider-clerk
} else {
  // re-export from provider-stub
}
```

Route handlers and middleware import only from `@/lib/auth` — never from `@clerk/nextjs/server` directly and never from `provider-stub` directly. This keeps the swap surface to a single file.

---

## 11. Contract Checklist

Before the Clerk swap (Phase 2), verify that the stub layer satisfies every row:

| # | Contract point | Stub must provide |
|---|---|---|
| 1 | `auth()` is async and returns `{ userId, sessionId, isAuthenticated, sessionClaims, ... }` | Yes |
| 2 | `auth.protect()` is a static method that rejects unauthenticated requests | Yes |
| 3 | `sessionClaims.metadata.role` carries the user's role | Yes |
| 4 | `currentUser()` is async and returns `{ id, firstName, lastName, emailAddresses, publicMetadata, ... }` or `null` | Yes |
| 5 | Middleware follows `clerkMiddleware(async (auth, req) => { ... })` shape | Yes |
| 6 | `createRouteMatcher()` accepts pattern arrays and returns a predicate | Yes |
| 7 | User IDs follow `user_` prefix convention | Yes |
| 8 | Session IDs follow `sess_` prefix convention | Yes |
| 9 | Test headers (`x-stub-user-id`, `x-stub-user-role`) allow identity switching | Yes (stub only) |
| 10 | `requireCurrentUser()` and `requireAdmin()` are app-level wrappers, not provider-specific | Yes |
| 11 | `authProviderUserId` on the local `User` model stores the value from `auth().userId` | Yes |
| 12 | Role checks use `sessionClaims?.metadata?.role`, not a separate mechanism | Yes |

---

## 12. What This Report Does Not Cover

- Clerk Dashboard configuration (session token customization, metadata setup)
- Clerk webhook integration for user sync
- Organization-based access control (out of scope for MVP)
- Clerk billing or subscription features
- Clerk UI components (`<SignIn />`, `<UserButton />`, etc.) — these are frontend concerns for Phase 2

These topics should be addressed in a separate report when the Clerk integration is imminent.
