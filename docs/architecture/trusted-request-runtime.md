# Trusted request runtime boundary

## Flow

Verified server adapter → `AuthenticatedPrincipal` → `TrustedRequestContext` → `ApplicationRuntime` → application services.

Each request context contains an immutable principal, tenant, role snapshot, `PermissionSet`, actor provenance, received timestamp, and correlation ID. `ApplicationRuntime` creates a fresh DI scope per request and maps that trusted context to the tenant context consumed by services.

## Trust rules

There is intentionally no API that converts browser headers, cookies, query parameters, form values, localStorage, or client state into an `AuthenticatedPrincipal` or tenant context. Future identity-provider adapters must verify those transport mechanisms before calling `createTrustedRequestContext` on the server.

The temporary development adapter is the only local identity source. It is server-owned, tags provenance as `development_adapter`, and throws in production. It does not provide login UI or external authentication.

## Deferred authority

The command policy boundary evaluates the trusted permission snapshot before a command handler may prepare an operation. It does not write audits durably, create employees through any browser flow, reveal Government IDs, or use durable persistence. The correlation ID is attached to in-memory audit events now so later durable audit work retains request traceability.
