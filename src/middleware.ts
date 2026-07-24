import { NextResponse, type NextRequest } from "next/server";
import { CORRELATION_ID_HEADER } from "@/platform/observability/correlation-header";
import { SESSION_COOKIE_NAME } from "@/platform/auth/session-cookie-name";

/** Paths reachable without a session. Everything else is treated as protected. */
const PUBLIC_PATH_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/diagnostics"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Generates the one trusted, server-owned correlation ID for this request.
 * Any inbound copy of this header is discarded before it reaches application
 * code — a browser can never supply the value the rest of the system trusts.
 * Uses the Web Crypto API (not node:crypto) because middleware runs on the
 * Edge runtime, which does not bundle Node built-ins.
 *
 * Also performs a coarse, production-only authentication check: does a
 * session cookie exist at all? This is deliberately cheap (no database call
 * is possible/appropriate on the Edge runtime) — it exists only to bounce
 * the common "no cookie at all" case to /login immediately. It is not the
 * authority: resolveRequestContext() re-verifies the cookie's session against
 * the database on the server for every protected loader and action, and is
 * what actually decides whether a request is trusted.
 */
export function middleware(request: NextRequest): NextResponse {
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();

  if (process.env.NODE_ENV === "production" && !isPublicPath(request.nextUrl.pathname)) {
    const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!hasSessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  response.headers.set("x-aura-request-started-at", String(startedAt));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
