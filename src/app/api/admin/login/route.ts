import { NextResponse } from "next/server";
import { createAdminStubCookies, isAdminStubEnabled, validateAdminToken } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAdminStubEnabled()) {
    return NextResponse.json(
      { error: "Admin stub auth is disabled." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const redirectPath =
    typeof body?.redirectPath === "string" && body.redirectPath.startsWith("/")
      ? body.redirectPath
      : "/admin";

  if (!validateAdminToken(token)) {
    return NextResponse.json(
      { error: "Invalid admin token. Update ADMIN_STUB_TOKEN or submit the correct value." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true, redirectPath });
  for (const cookie of createAdminStubCookies()) {
    response.cookies.set(cookie);
  }

  return response;
}
