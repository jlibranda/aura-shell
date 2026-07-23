import { randomUUID } from "node:crypto";
import type { Permission, PlatformRole, TenantContext } from "@/platform/context";
import { PermissionSet } from "@/platform/context";
import { AuthorizationError, ApplicationError } from "@/platform/errors";

export type ActorProvenance = "server_verified" | "development_adapter";

/** Identity resolved by a server-side adapter; never constructed from browser request data. */
export type AuthenticatedPrincipal = Readonly<{
  subjectId: string;
  userId: string;
  tenantId: string;
  displayName?: string;
  email?: string;
  authenticationMethod: string;
  authenticatedAt: string;
}>;

export type TrustedRequestContext = Readonly<{
  principal: AuthenticatedPrincipal;
  roles: readonly PlatformRole[];
  permissions: PermissionSet;
  correlationId: string;
  actorProvenance: ActorProvenance;
  receivedAt: string;
}>;

export interface TrustedRequestContextInput {
  principal: AuthenticatedPrincipal;
  roles: readonly PlatformRole[];
  permissions: readonly Permission[];
  actorProvenance: ActorProvenance;
  correlationId?: string;
  receivedAt?: string;
}

function validPrincipal(principal: AuthenticatedPrincipal): boolean {
  return Boolean(principal.subjectId.trim() && principal.userId.trim() && principal.tenantId.trim() && principal.authenticationMethod.trim() && principal.authenticatedAt.trim());
}

/**
 * Constructs the request-local trust boundary after a server adapter has
 * verified identity. It intentionally has no header, cookie, query, or body
 * parsing API, so browser-supplied identity cannot become trusted implicitly.
 */
export function createTrustedRequestContext(input: TrustedRequestContextInput): TrustedRequestContext {
  if (!validPrincipal(input.principal)) throw new AuthorizationError("A verified authenticated principal is required.");
  const correlationId = input.correlationId?.trim() || randomUUID();
  if (!correlationId) throw new ApplicationError("INVALID_CORRELATION_ID", "A request correlation ID is required.");
  return Object.freeze({
    principal: Object.freeze({ ...input.principal }),
    roles: Object.freeze([...input.roles]),
    permissions: new PermissionSet(input.permissions),
    correlationId,
    actorProvenance: input.actorProvenance,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
  });
}

/** Maps trusted request identity into the application-service context. */
export function createTenantContext(request: TrustedRequestContext): TenantContext {
  const principal = request.principal;
  if (!validPrincipal(principal)) throw new AuthorizationError("An authenticated tenant session is required.");
  return Object.freeze({
    tenantId: principal.tenantId,
    actorId: principal.userId,
    actorName: principal.displayName?.trim() || principal.userId,
    roles: Object.freeze([...request.roles]),
    permissions: request.permissions,
    correlationId: request.correlationId,
    authenticationMethod: principal.authenticationMethod,
    actorProvenance: request.actorProvenance,
  });
}
