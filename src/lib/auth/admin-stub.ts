import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "stoics_admin";

export function isAdminStubEnabled(): boolean {
  const raw = process.env.ADMIN_STUB_ENABLED;
  if (raw === undefined) {
    return true;
  }
  return raw.toLowerCase() !== "false";
}

export function getAdminStubToken(): string {
  return process.env.ADMIN_STUB_TOKEN?.trim() || "stoics-admin";
}

export function validateAdminToken(token: string | null | undefined): boolean {
  if (!isAdminStubEnabled()) {
    return true;
  }
  if (!token) {
    return false;
  }
  return token.trim() === getAdminStubToken();
}

export function isAdminAuthorizedFromRequest(request: NextRequest): boolean {
  if (!isAdminStubEnabled()) {
    return true;
  }

  const cookieToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return validateAdminToken(cookieToken);
}
