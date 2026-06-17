import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Proxy (Next 16's renamed Middleware). Optimistic auth gate only: it redirects
// page navigations to /login when the predictionsession cookie is absent. Real
// authentication + authorization happen server-side (layout calls /auth/me and
// Go enforces RBAC per request) — see node_modules/next/dist/docs proxy guide.

const PUBLIC_PAGES = new Set<string>(["/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes proxy to Go, which returns 401 itself — never redirect them.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  if (!request.cookies.has("predictionsession")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
