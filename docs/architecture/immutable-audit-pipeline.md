# Immutable audit pipeline

## Purpose

The immutable audit pipeline records completed authoritative business actions after their transaction commits. It is separate from logging, notifications, and domain events:

- A command expresses requested work.
- A domain event records a completed business fact.
- An audit record captures the trusted actor, request, transaction, command, event, result, and safe metadata for that completed action.
- A notification is a future delivery concern.
- Logging is operational diagnostics, not this compliance-oriented audit contract.

## Lifecycle

The internal employee-create handler supplies trusted tenant, actor, correlation, request, and command context to the Unit of Work. After repository commit succeeds, the Unit of Work releases domain events, creates immutable audit records through `AuditRecordFactory`, and sends them to `InMemoryAuditCollector` in commit order.

Audit IDs and timestamps are server-generated. Metadata is copied only from the safe EmployeeCreated event payload; it excludes Government IDs, payroll, permissions, session/authentication data, and raw request payloads. The current request ID equals the trusted correlation ID until a separate server request identifier is introduced.

## Failure behavior

Rollback clears staged events and produces no audit record. Commit failure likewise produces no event release or audit collection. The Runtime Hire preparation action never creates a transaction, event, or audit record.

## Deferred work

The active runtime collector is deterministic in-memory test/development infrastructure only. Slice 6H1 additionally provides an unregistered `PrismaAuditRecordRepository`: a durable Unit of Work writes its append-only audit record in the same Prisma transaction as the employee, then releases inspection collectors after commit. There is still no audit query API, audit UI, SIEM/log aggregation integration, outbox, event publisher, notification, webhook, or external logging integration. Runtime selection of durable persistence remains deferred.
