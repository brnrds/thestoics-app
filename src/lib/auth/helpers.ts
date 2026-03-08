import { UserRole, type User } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth, currentUser } from "@/lib/auth/provider-stub";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function appRoleFromSessionRole(role: string | undefined): UserRole {
  return role === "admin" ? UserRole.ADMIN : UserRole.USER;
}

export async function ensureAppUser(request?: Request): Promise<User> {
  const authResult = await auth(request);
  const profile = await currentUser(request);

  if (!authResult.userId || !profile) {
    throw new AuthError("Unauthorized", 401);
  }

  const email = profile.primaryEmailAddress?.emailAddress ?? profile.emailAddresses[0]?.emailAddress ?? null;
  const displayName = profile.fullName ?? profile.firstName ?? profile.username ?? null;
  const role = appRoleFromSessionRole(authResult.sessionClaims?.metadata?.role);

  return db.user.upsert({
    where: { authProviderUserId: authResult.userId },
    update: {
      email,
      displayName,
      role,
    },
    create: {
      authProviderUserId: authResult.userId,
      email,
      displayName,
      role,
    },
  });
}

export async function requireCurrentUser(request?: Request) {
  const authResult = await auth(request);

  if (!authResult.isAuthenticated || !authResult.userId) {
    throw new AuthError("Unauthorized", 401);
  }

  const appUser = await ensureAppUser(request);

  return {
    userId: authResult.userId,
    sessionClaims: authResult.sessionClaims,
    appUser,
  };
}

export async function requireAdmin(request?: Request) {
  const context = await requireCurrentUser(request);

  if (context.sessionClaims?.metadata?.role !== "admin") {
    throw new AuthError("Forbidden", 403);
  }

  return context;
}

export function authErrorToResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}
