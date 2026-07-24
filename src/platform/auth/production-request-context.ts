import type { Permission, PlatformRole } from "@/platform/context";
import { logger } from "@/platform/observability/logger";
import { getRequestCorrelationId } from "@/platform/observability/request-context";
import { createProductionAuthRuntime } from "@/platform/auth/production-auth-runtime";
import { readSessionToken } from "@/platform/auth/session-cookie";
import { hashSessionToken } from "@/platform/auth/session-token";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";

const KNOWN_ROLES: readonly PlatformRole[] = ["hr_admin", "hr_operations", "payroll", "manager", "employee", "auditor"];

function toKnownRoles(roles: readonly string[]): PlatformRole[] {
  return roles.filter((role): role is PlatformRole => (KNOWN_ROLES as readonly string[]).includes(role));
}

/**
 * Mirrors the rule already embedded in context.ts's hasPermission() so the
 * command pipeline's separate PermissionSet check (which reads
 * TrustedRequestContext.permissions directly, not via hasPermission()) stays
 * consistent with it. Duplicated deliberately rather than editing the
 * existing, tested, preserved hasPermission() implementation.
 */
function derivePermissionsFromRoles(roles: readonly PlatformRole[]): Permission[] {
  const permissions = new Set<Permission>();
  if (roles.includes("hr_admin") || roles.includes("hr_operations")) {
    permissions.add("people.read");
    permissions.add("people.write");
    permissions.add("people.government_ids.read");
    permissions.add("people.employee.hire");
  }
  if (roles.includes("payroll")) permissions.add("people.government_ids.read");

  if (roles.includes("hr_admin")) {
    permissions.add("settings.view");
    permissions.add("settings.manage");
    permissions.add("settings.publish");
    permissions.add("settings.audit.view");
  }
  if (roles.includes("hr_operations")) {
    permissions.add("settings.view");
    permissions.add("settings.manage");
  }
  if (roles.includes("payroll")) permissions.add("settings.view");
  if (roles.includes("auditor")) {
    permissions.add("settings.view");
    permissions.add("settings.audit.view");
  }
  return [...permissions];
}

/**
 * Resolves a verified production TrustedRequestContext from the session
 * cookie. Returns undefined for any unauthenticated/invalid/expired/disabled
 * case — it never throws for ordinary "not signed in," so callers can choose
 * between a login redirect and a controlled denial screen.
 */
export async function resolveProductionRequestContext(): Promise<TrustedRequestContext | undefined> {
  const correlationId = getRequestCorrelationId();
  const token = readSessionToken();
  if (!token) return undefined;

  const { users, sessions, secret } = createProductionAuthRuntime();
  const tokenHash = hashSessionToken(token, secret);
  const session = await sessions.findByTokenHash(tokenHash);
  if (!session) {
    logger.warn("auth.session.not_found", { component: "auth", operation: "resolve", correlationId });
    return undefined;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    logger.warn("auth.session.expired", { component: "auth", operation: "resolve", correlationId, userId: session.userId });
    return undefined;
  }

  const user = await users.findById(session.userId);
  if (!user || user.status !== "active") {
    logger.warn("auth.session.user_disabled", { component: "auth", operation: "resolve", correlationId, userId: session.userId });
    return undefined;
  }

  const membership = await users.findActiveMembership(session.userId, session.tenantId);
  if (!membership) {
    logger.warn("auth.session.no_tenant_membership", { component: "auth", operation: "resolve", correlationId, userId: session.userId, tenantId: session.tenantId });
    return undefined;
  }

  const roles = toKnownRoles(membership.roles);
  return createTrustedRequestContext({
    principal: {
      subjectId: user.id,
      userId: user.id,
      tenantId: session.tenantId,
      email: user.email,
      authenticationMethod: "credentials",
      authenticatedAt: new Date().toISOString(),
    },
    roles,
    permissions: derivePermissionsFromRoles(roles),
    actorProvenance: "server_verified",
    correlationId,
  });
}
