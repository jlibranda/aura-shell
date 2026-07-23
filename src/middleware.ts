import { NextResponse, type NextRequest } from "next/server";
import { CORRELATION_ID_HEADER } from "@/platform/observability/correlation-header";

/**
 * Generates the one trusted, server-owned correlation ID for this request.
 * Any inbound copy of this header is discarded before it reaches application
 * code — a browser can never supply the value the rest of the system trusts.
 * Uses the Web Crypto API (not node:crypto) because middleware runs on the
 * Edge runtime, which does not bundle Node built-ins.
 */
export function middleware(request: NextRequest): NextResponse {
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();

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
