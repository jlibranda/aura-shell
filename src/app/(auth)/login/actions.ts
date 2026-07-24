"use server";

import { redirect } from "next/navigation";
import { authenticateAndCreateSession } from "@/platform/auth/login-service";
import { createProductionAuthRuntime } from "@/platform/auth/production-auth-runtime";
import { safeReturnTo } from "@/platform/auth/safe-return-to";
import { setSessionCookie } from "@/platform/auth/session-cookie";
import { getRequestCorrelationId } from "@/platform/observability/request-context";

export type LoginActionResult = Readonly<{ kind: "success" } | { kind: "error"; message: string }>;

export async function loginAction(email: string, password: string, returnTo?: string): Promise<LoginActionResult> {
  if (!email.trim() || !password) return { kind: "error", message: "Enter your work email and password." };

  const correlationId = getRequestCorrelationId();
  const deps = createProductionAuthRuntime();
  const result = await authenticateAndCreateSession(email, password, correlationId, deps);

  if (result.kind !== "success") return { kind: "error", message: "Invalid email or password." };

  setSessionCookie(result.token);
  redirect(safeReturnTo(returnTo));
}
