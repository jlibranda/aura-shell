# Trusted submission gateway

## Internal flow

`Internal server caller → authenticated trusted request context → validated command → authorization → durable idempotency → durable runtime → Prisma Unit of Work → Employee and immutable AuditRecord commit → sanitized result`.

The gateway accepts no actor, tenant, role, permission, or authorization decision. Its caller supplies a server authentication adapter producing `TrustedRequestContext`; failure is denied before a durable claim or command runs.

## Durable idempotency

`submission_idempotency_records` is keyed by trusted tenant plus idempotency key. It stores a request hash, command type, lifecycle state, and only a sanitized completed result. Different requests using the same key are rejected; matching completed requests replay without a second durable creation; in-progress duplicates are rejected safely.

## Scope limits

This is not an HTTP endpoint, route handler, server action, or browser API. Runtime Hire remains preparation-only. The gateway exposes no personal fields in results, Government IDs, compensation, payroll, notifications, outbox behavior, or editing.
