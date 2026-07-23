import { redirect } from "next/navigation";
import { getDevelopmentRequestContext } from "@/platform/development-session";
import { resolveProductionRequestContext } from "@/platform/auth/production-request-context";
import type { TrustedRequestContext } from "@/platform/runtime-context";

/**
 * The single trusted-context entry point every protected loader, server
 * action, and the trusted submission gateway must call. Development and
 * production never share a code path: getDevelopmentRequestContext() already
 * fails closed outside development, so there is no risk of the hardcoded
 * identity ever being reachable in a production request.
 *
 * On an unauthenticated production request this redirects to /login (Next's
 * redirect() works from Server Components and Server Actions alike), so an
 * expired session discovered mid-submission produces the same "please sign
 * in again" navigation as an expired session discovered on page load.
 *
 * Deliberately not memoized with React's cache(): the react version this
 * project pins does not export it (verified — node_modules/react has no
 * cache export), so wrapping this would break at runtime, not just in tests.
 * A page that needs the context more than once pays one extra session
 * lookup; that's a acceptable, minor cost next to depending on an API this
 * dependency doesn't actually provide.
 */
export async function resolveRequestContext(): Promise<TrustedRequestContext> {
  if (process.env.NODE_ENV !== "production") return getDevelopmentRequestContext();

  const context = await resolveProductionRequestContext();
  if (!context) redirect("/login");
  return context;
}
