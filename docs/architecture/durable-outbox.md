# Durable People outbox

## Transaction flow

The durable Employee Unit of Work stages `EmployeeCreated` events and, inside the same Prisma transaction, writes Employee, append-only AuditRecord, and one `OutboxMessage` per event. Only after the transaction commits are the existing in-memory event and audit inspection collectors released.

Outbox rows contain the event identity, tenant, aggregate identifiers, correlation ID, occurrence time, and copied safe event payload. They do not query or serialize raw Employee aggregates, tenant sessions, permissions, Government IDs, compensation, or request bodies.

## Worker boundary

Slice 6L initially provided durable insertion and an explicit worker but did not persist ownership, leases, bounded exhaustion, dead-lettering, or guarded completion. Slice 6L.1 closes those gaps without changing the browser submission flow.

`OutboxWorker` is an internal primitive. It claims exactly one eligible message with an opaque server-generated lease owner, invokes an injected `OutboxDispatcher`, and makes a guarded state transition only when it still owns that lease. No scheduler or vendor dispatcher is registered in this slice.

## Reliability protocol

The permitted lifecycle is `pending -> processing -> processed | retry | dead_letter`; a ready `retry` may become `processing`, and an expired `processing` lease may be reclaimed as `processing` by a new owner. `processed` and `dead_letter` are terminal and are never eligible for normal polling.

PostgreSQL claim selection uses a short transaction with `FOR UPDATE SKIP LOCKED`. The row is selected, checked as ready (`pending`/`retry` with `availableAt <= now`, or expired `processing`), and changed to `processing` with the new owner in that transaction. This prevents concurrent workers from receiving the same active lease. Completion, retry, and dead-letter updates all condition on `messageId`, `processing` state, and `leaseOwner`; a stale worker therefore becomes a harmless no-op.

The default lease is five minutes. A claim increments attempts. Retryable failures use deterministic exponential delays (1s, 2s, 4s, capped at 60s) and stop after five attempts. Permanently invalid dispatches and exhausted attempts become `dead_letter`. Lease fields are cleared for processed, retry, and dead-letter transitions. Only short category codes and fixed generic text are stored; raw dispatcher errors, stack traces, credentials, and payload changes are never persisted.

Delivery remains at-least-once. A crash after an external dispatcher side effect but before `markProcessed` can cause a later redelivery after lease expiry; consumers must remain idempotent. This slice does not claim exactly-once delivery.

## Operations

`npm run outbox:inspect` is an explicit server-side diagnostic. It reports state counts only: it does not start a worker and does not output event payloads, lease owners, or error text. Worker execution remains an explicit internal composition concern.

## Explicit exclusions

There is no email, Slack, SMS, webhook, notification UI, event bus, outbox API, or browser access. Runtime Hire continues to use the existing trusted submission flow and never imports the outbox.
