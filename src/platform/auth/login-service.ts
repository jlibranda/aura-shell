import { verifyPassword } from "@/platform/auth/password";
import type { SessionRepository } from "@/platform/auth/session-repository";
import { generateSessionToken, hashSessionToken } from "@/platform/auth/session-token";
import type { UserRepository } from "@/platform/auth/user-repository";
import { logger } from "@/platform/observability/logger";
import { SESSION_DURATION_MS } from "@/platform/auth/session-cookie-name";

export type LoginFailureReason = "invalid_credentials" | "disabled_user" | "no_tenant_membership";

export type LoginResult =
  | Readonly<{ kind: "success"; token: string; expiresAt: Date; userId: string; tenantId: string }>
  | Readonly<{ kind: "failure"; reason: LoginFailureReason }>;

export interface LoginServiceDependencies {
  users: UserRepository;
  sessions: SessionRepository;
  secret: string;
}

/**
 * Every failure path returns the same generic "failure" shape to the caller
 * so the login page can show one uniform message — the distinct reason is
 * for server-side audit logging only, never rendered to the browser.
 */
export async function authenticateAndCreateSession(
  email: string,
  password: string,
  correlationId: string,
  deps: LoginServiceDependencies,
): Promise<LoginResult> {
  const fail = (reason: LoginFailureReason): LoginResult => {
    logger.warn("auth.login.failed", { component: "auth", operation: "login", correlationId, reason });
    return { kind: "failure", reason };
  };

  const user = await deps.users.findByEmail(email);
  if (!user) return fail("invalid_credentials");
  if (user.status !== "active") return fail("disabled_user");

  const passwordValid = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!passwordValid) return fail("invalid_credentials");

  const memberships = await deps.users.findActiveMemberships(user.id);
  const membership = memberships[0];
  if (!membership) return fail("no_tenant_membership");

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token, deps.secret);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await deps.sessions.create({ tokenHash, userId: user.id, tenantId: membership.tenantId, expiresAt });

  logger.info("auth.login.succeeded", { component: "auth", operation: "login", correlationId, userId: user.id, tenantId: membership.tenantId });
  return { kind: "success", token, expiresAt, userId: user.id, tenantId: membership.tenantId };
}

export async function terminateSession(token: string, correlationId: string, deps: Pick<LoginServiceDependencies, "sessions" | "secret">): Promise<void> {
  const tokenHash = hashSessionToken(token, deps.secret);
  await deps.sessions.deleteByTokenHash(tokenHash);
  logger.info("auth.logout", { component: "auth", operation: "logout", correlationId });
}
