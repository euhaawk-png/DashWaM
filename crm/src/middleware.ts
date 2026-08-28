import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "crm_session";

/**
 * Edge middleware: fast redirect for unauthenticated navigation. Real
 * authentication/authorization happens server-side in every layout, page and
 * route handler (guard.ts) — this is UX, not the security boundary.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/admin") || pathname.startsWith("/selecionar-empresa");
  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/selecionar-empresa"],
};
