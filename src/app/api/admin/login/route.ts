import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, validateAdminToken } from "@/lib/auth/admin-stub";

export async function POST(request: Request) {
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
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
