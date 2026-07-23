# Unit of Work and transaction boundary

## Flow

Trusted request context â†’ authorization policy â†’ command pipeline â†’ internal persistence handler â†’ `UnitOfWork` â†’ transaction-scoped employee repository â†’ atomic commit or rollback.

`UnitOfWorkContext` carries only the trusted tenant ID and request correlation ID. The transaction exposes only repositories scoped to that context; it has no browser identity, role, permission, or raw request input.

## Lifecycle

`InMemoryEmployeeUnitOfWork` opens a staged employee-repository transaction, runs the handler operation, then commits only when it completes successfully. A thrown operation error causes rollback. Completed transactions reject further reads and writes. A transaction cannot access another tenant, and staged records remain invisible to the base repository until commit. Aggregate events are released to the in-memory collector only after that commit succeeds; immutable business audits are then generated from those committed events.

## Current scope

The in-memory transaction boundary is server-side test/development infrastructure only. `CreateEmployeePersistenceHandler` uses it to demonstrate authoritative aggregate creation under the command pipeline, while the Runtime Hire browser action still invokes only the validation/preparation handler.

It does not add Prisma, database transactions, durable audit records, event publishing, notifications, or browser submission. `PEOPLE.EMPLOYEE.SUBMIT` remains deferred.
