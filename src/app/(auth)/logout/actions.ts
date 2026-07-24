"use server";

import { redirect } from "next/navigation";
import { terminateSession } from "@/platform/auth/login-service";
import { createProductionAuthRuntime } from "@/platform/auth/production-auth-runtime";
import { clearSessionCookie, readSessionToken } from "@/platform/auth/session-cookie";
import { getRequestCorrelationId } from "@/platform/observability/request-context";

/** Safe to call in any environment: a no-op when there is no real session cookie to terminate. */
export async function logoutAction(): Promise<void> {
  const token = readSessionToken();
  if (token) {
    const correlationId = getRequestCorrelationId();
    const deps = createProductionAuthRuntime();
    await terminateSession(token, correlationId, deps);
  }
  clearSessionCookie();
  redirect("/login");
}
