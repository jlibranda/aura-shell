import { ApplicationError } from "@/platform/errors";
import { getRequestCorrelationId } from "@/platform/observability/request-context";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";

/**
 * Local-only server adapter. It is the sole temporary source of runtime
 * identity until an external identity provider is introduced in a later slice.
 */
export function getDevelopmentRequestContext(): TrustedRequestContext {
  if (process.env.NODE_ENV === "production") throw new ApplicationError("DEVELOPMENT_SESSION_UNAVAILABLE", "A verified production request context is required to access this runtime screen.");
  return createTrustedRequestContext({
    principal: { subjectId: "development-subject-hr-admin", userId: "development-hr-admin", tenantId: "nw-ph", displayName: "Development HR Admin", email: "development.hr@example.invalid", authenticationMethod: "development-adapter", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles: ["hr_admin"],
    permissions: ["people.read", "people.write", "people.government_ids.read", "people.employee.hire", "settings.view", "settings.manage", "settings.publish", "settings.audit.view"],
    actorProvenance: "development_adapter",
    correlationId: getRequestCorrelationId(),
  });
}

/** Compatibility name for existing server runtime loaders; still server-owned and fail-closed in production. */
export const getDevelopmentSession = getDevelopmentRequestContext;
