import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "crm_session";

/**
 * Edge middleware: fast redirect for unauthenticated navigation. Real
 * authentication/authorization happens server-side in every layout, page and
 * route handler (guard.ts) — this is UX, not the security boundary.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE));
  // Logged-in users skip the public marketing home and land in the app.
  // (Cookie presence only: an invalid session bounces back at /app's guard.)
  if (pathname === "/" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/admin") || pathname.startsWith("/selecionar-empresa");
  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*", "/admin/:path*", "/selecionar-empresa"],
};
