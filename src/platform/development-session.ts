import { permissionsForRoles } from "@/platform/context";
import { ApplicationError } from "@/platform/errors";
import { getRequestCorrelationId } from "@/platform/observability/request-context";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";

/**
 * Local-only server adapter. It is the sole temporary source of runtime
 * identity until an external identity provider is introduced in a later slice.
 * The development hr_admin gets exactly the permissions its roles grant via the
 * single role→permission source of truth, so new permissions need no change here.
 */
export function getDevelopmentRequestContext(): TrustedRequestContext {
  if (process.env.NODE_ENV === "production") throw new ApplicationError("DEVELOPMENT_SESSION_UNAVAILABLE", "A verified production request context is required to access this runtime screen.");
  return createTrustedRequestContext({
    principal: { subjectId: "development-subject-hr-admin", userId: "development-hr-admin", tenantId: "nw-ph", displayName: "Development HR Admin", email: "development.hr@example.invalid", authenticationMethod: "development-adapter", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles: ["hr_admin"],
    permissions: permissionsForRoles(["hr_admin"]),
    actorProvenance: "development_adapter",
    correlationId: getRequestCorrelationId(),
  });
}

/** Compatibility name for existing server runtime loaders; still server-owned and fail-closed in production. */
export const getDevelopmentSession = getDevelopmentRequestContext;
