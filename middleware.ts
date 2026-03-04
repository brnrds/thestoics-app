import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminAuthorizedFromRequest, isAdminStubEnabled } from "@/lib/auth/admin-stub";

export function middleware(request: NextRequest) {
  if (!isAdminStubEnabled()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  if (pathname === "/admin/blocked" || pathname.startsWith("/api/admin/login")) {
    return NextResponse.next();
  }

  const authorized = isAdminAuthorizedFromRequest(request);

  if (authorized) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json(
      {
        error: "Admin access blocked. Provide stub token via /admin/blocked.",
      },
      { status: 401 }
    );
  }

  const blockedUrl = request.nextUrl.clone();
  blockedUrl.pathname = "/admin/blocked";
  blockedUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(blockedUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
