import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clerkMiddleware,
  createRouteMatcher,
  isAdminStubEnabled,
} from "@/lib/auth";

const isProtectedRoute = createRouteMatcher(["/chat(.*)", "/api/threads(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/admin/blocked" || pathname.startsWith("/api/admin/login")) {
    return NextResponse.next();
  }

  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  if (!isAdminRoute(request)) {
    return NextResponse.next();
  }

  const { sessionClaims } = await auth();
  if (sessionClaims?.metadata?.role === "admin") {
    return NextResponse.next();
  }

  if (!isAdminStubEnabled()) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json(
        {
          error: "Admin stub auth is disabled and no admin session is active.",
        },
        { status: 403 }
      );
    }

    return NextResponse.redirect(new URL("/", request.url));
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
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
