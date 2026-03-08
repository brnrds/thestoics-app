import { NextResponse, type NextRequest } from "next/server";
import type { AuthResult, CurrentUserResult, SessionClaims } from "@/lib/auth/types";

export const ADMIN_COOKIE_NAME = "stoics_admin";
export const STUB_USER_ID_COOKIE_NAME = "stoics_user_id";
export const STUB_USER_ROLE_COOKIE_NAME = "stoics_user_role";
export const STUB_SESSION_ID_COOKIE_NAME = "stoics_session_id";

type StubRole = "user" | "admin";

type StubIdentity = {
  userId: string;
  sessionId: string;
  role: StubRole;
};

type ProtectParams = { role?: string; permission?: string };
type ProtectPredicate = (has: AuthResult["has"]) => boolean;
type RouteMatcher = (request: NextRequest) => boolean;
type AuthFn = ((request?: Request) => Promise<AuthResult>) & {
  protect: (
    requestOrParams?: Request | ProtectParams | ProtectPredicate,
    maybeParams?: ProtectParams | ProtectPredicate
  ) => Promise<AuthResult>;
};

const DEFAULT_STUB_USER: StubIdentity = {
  userId: "user_stub_user1",
  sessionId: "sess_stub_session1",
  role: "user",
};

const DEFAULT_STUB_ADMIN: StubIdentity = {
  userId: "user_stub_admin1",
  sessionId: "sess_stub_admin1",
  role: "admin",
};

class AuthProtectionError extends Error {
  response: Response;

  constructor(response: Response) {
    super("Authentication protection failed.");
    this.response = response;
  }
}

function getNowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isRequestLike(value: unknown): value is Request {
  return value instanceof Request;
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const chunk of cookieHeader.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (!name) {
      continue;
    }
    cookies.set(name, decodeURIComponent(rest.join("=") || ""));
  }

  return cookies;
}

function readCookie(request?: Request, name?: string): string | undefined {
  if (!request || !name) {
    return undefined;
  }

  return parseCookieHeader(request.headers.get("cookie")).get(name);
}

function getDefaultStubIdentity(): StubIdentity {
  return DEFAULT_STUB_USER;
}

function areStubHeaderOverridesEnabled(): boolean {
  return process.env.NODE_ENV === "test";
}

function normalizeStubRole(raw: string | null | undefined): StubRole | undefined {
  if (!raw) {
    return undefined;
  }

  return raw.toLowerCase() === "admin" ? "admin" : "user";
}

function normalizeStubUserId(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  return value.startsWith("user_") ? value : `user_${value}`;
}

function normalizeStubSessionId(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  return value.startsWith("sess_") ? value : `sess_${value}`;
}

function resolveStubIdentity(request?: Request): StubIdentity {
  const defaultIdentity = getDefaultStubIdentity();
  const adminToken = readCookie(request, ADMIN_COOKIE_NAME);

  if (validateAdminToken(adminToken)) {
    return DEFAULT_STUB_ADMIN;
  }

  if (!areStubHeaderOverridesEnabled()) {
    return defaultIdentity;
  }

  const headerUserId = normalizeStubUserId(request?.headers.get("x-stub-user-id"));
  const headerRole = normalizeStubRole(request?.headers.get("x-stub-user-role"));
  const headerSessionId = normalizeStubSessionId(request?.headers.get("x-stub-session-id"));

  const userId = headerUserId ?? defaultIdentity.userId;
  const role = headerRole ?? defaultIdentity.role;
  const sessionId = headerSessionId ?? defaultIdentity.sessionId;

  return {
    userId,
    sessionId,
    role,
  };
}

function sessionClaimsForIdentity(identity: StubIdentity): SessionClaims {
  const now = getNowSeconds();

  return {
    sub: identity.userId,
    sid: identity.sessionId,
    iss: "https://stub.clerk.local",
    iat: now,
    exp: now + 60 * 60 * 12,
    nbf: now,
    azp: "stoics-local",
    metadata: identity.role === "admin" ? { role: "admin" } : {},
  };
}

function displayNameFromIdentity(identity: StubIdentity): string {
  if (identity.role === "admin") {
    return "Stub Admin";
  }

  const suffix = identity.userId.replace(/^user_/, "").replace(/^stub_/, "");
  return suffix
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function currentUserFromIdentity(identity: StubIdentity): CurrentUserResult {
  const displayName = displayNameFromIdentity(identity);
  const emailAddress = `${identity.userId.replace(/^user_/, "")}@stub.local`;
  const emailId = `idn_${identity.userId.replace(/^user_/, "")}`;
  const now = Date.now();

  const email = {
    id: emailId,
    emailAddress,
    verification: { status: "verified" as const },
  };

  return {
    id: identity.userId,
    firstName: displayName,
    lastName: null,
    fullName: displayName,
    username: identity.userId.replace(/^user_/, ""),
    imageUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
    hasImage: true,
    emailAddresses: [email],
    primaryEmailAddressId: email.id,
    primaryEmailAddress: email,
    publicMetadata: identity.role === "admin" ? { role: "admin" } : {},
    privateMetadata: {},
    unsafeMetadata: {},
    passwordEnabled: false,
    banned: false,
    locked: false,
    createdAt: now,
    updatedAt: now,
    lastSignInAt: now,
    lastActiveAt: now,
  };
}

function unauthorizedResponse(request?: Request, message = "Unauthorized") {
  const pathname = request ? new URL(request.url).pathname : "/";

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const redirectUrl = request ? new URL("/", request.url) : new URL("http://localhost/");
  return NextResponse.redirect(redirectUrl);
}

function forbiddenResponse(request?: Request, message = "Forbidden") {
  const pathname = request ? new URL(request.url).pathname : "/";

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (pathname.startsWith("/admin") && request) {
    const blockedUrl = new URL("/admin/blocked", request.url);
    blockedUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(blockedUrl);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const redirectUrl = request ? new URL("/", request.url) : new URL("http://localhost/");
  return NextResponse.redirect(redirectUrl);
}

function evaluateProtection(result: AuthResult, params?: ProtectParams | ProtectPredicate) {
  if (!params) {
    return true;
  }

  if (typeof params === "function") {
    return params(result.has);
  }

  return result.has(params);
}

async function protectRequest(
  request: Request | undefined,
  params?: ProtectParams | ProtectPredicate
): Promise<AuthResult> {
  const result = await auth(request);

  if (!result.isAuthenticated || !result.userId) {
    throw new AuthProtectionError(unauthorizedResponse(request));
  }

  if (!evaluateProtection(result, params)) {
    throw new AuthProtectionError(forbiddenResponse(request));
  }

  return result;
}

export const auth: AuthFn = Object.assign(async (request?: Request): Promise<AuthResult> => {
  const identity = resolveStubIdentity(request);
  const sessionClaims = sessionClaimsForIdentity(identity);

  return {
    userId: identity.userId,
    sessionId: identity.sessionId,
    isAuthenticated: true,
    sessionClaims,
    sessionStatus: "active",
    tokenType: "session_token",
    orgId: undefined,
    orgRole: undefined,
    orgSlug: undefined,
    orgPermissions: undefined,
    factorVerificationAge: null,
    actor: undefined,
    getToken: async () => null,
    has: ({ role, permission }) => {
      if (permission) {
        return false;
      }

      if (role) {
        return sessionClaims.metadata?.role === role;
      }

      return true;
    },
    redirectToSignIn: () => {
      throw new AuthProtectionError(unauthorizedResponse(request));
    },
  };
}, {
  protect: async (
  requestOrParams?: Request | ProtectParams | ProtectPredicate,
  maybeParams?: ProtectParams | ProtectPredicate
) => {
  const request = isRequestLike(requestOrParams) ? requestOrParams : undefined;
  const params = isRequestLike(requestOrParams) ? maybeParams : requestOrParams;
  return protectRequest(request, params);
  },
});

export async function currentUser(request?: Request): Promise<CurrentUserResult | null> {
  const result = await auth(request);

  if (!result.userId) {
    return null;
  }

  return currentUserFromIdentity(resolveStubIdentity(request));
}

export function getAdminStubToken(): string {
  return process.env.ADMIN_STUB_TOKEN?.trim() || "stoics-admin";
}

export function isAdminStubEnabled(): boolean {
  const raw = process.env.ADMIN_STUB_ENABLED;
  if (raw === undefined) {
    return true;
  }
  return raw.toLowerCase() !== "false";
}

export function validateAdminToken(token: string | null | undefined): boolean {
  if (!isAdminStubEnabled()) {
    return false;
  }

  if (!token) {
    return false;
  }

  return token.trim() === getAdminStubToken();
}

export function isAdminAuthorizedFromRequest(request: NextRequest): boolean {
  return resolveStubIdentity(request).role === "admin";
}

export function createAdminStubCookies() {
  return [
    {
      name: STUB_USER_ID_COOKIE_NAME,
      value: DEFAULT_STUB_ADMIN.userId,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
    {
      name: STUB_USER_ROLE_COOKIE_NAME,
      value: DEFAULT_STUB_ADMIN.role,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
    {
      name: STUB_SESSION_ID_COOKIE_NAME,
      value: DEFAULT_STUB_ADMIN.sessionId,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
    {
      name: ADMIN_COOKIE_NAME,
      value: getAdminStubToken(),
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  ];
}

export function clerkMiddleware(
  callback: (
    auth: (() => Promise<AuthResult>) & {
      protect: (params?: ProtectParams | ProtectPredicate) => Promise<AuthResult>;
    },
    req: NextRequest
  ) => void | Response | Promise<void | Response>
) {
  return async function middleware(request: NextRequest) {
    const boundAuth = Object.assign(() => auth(request), {
      protect: (params?: ProtectParams | ProtectPredicate) => protectRequest(request, params),
    });

    try {
      const response = await callback(boundAuth, request);
      return response ?? NextResponse.next();
    } catch (error) {
      if (error instanceof AuthProtectionError) {
        return error.response;
      }

      throw error;
    }
  };
}

export function createRouteMatcher(patterns: string[]): RouteMatcher {
  const matchers = patterns.map((pattern) => new RegExp(`^${pattern}$`));
  return (request: NextRequest) =>
    matchers.some((matcher) => matcher.test(request.nextUrl.pathname));
}
