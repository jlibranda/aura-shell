# Repository ports and in-memory write adapter

## Purpose

`EmployeeAggregateRepository` is the write-side persistence port for a future employee aggregate. It is separate from the legacy raw-`Employee` repository and has no dependency on legacy stores or UI loaders.

## Contracts

The port accepts a trusted tenant write context plus an `EmployeeAggregateDraft`, and returns either a created aggregate or a work-email conflict. Persisted aggregates receive deterministic IDs and employee numbers from the adapter. The command never supplies tenant, actor, permission, identifier, or Government ID values.

## In-memory adapter

`InMemoryEmployeeAggregateRepository` stores records by tenant, compares work emails case-insensitively within that tenant, and returns server-owned identifiers, employee numbers, and timestamps. It is a test/development adapter only; it is not Prisma, a production database, or durable storage.

## Command integration

The browser-exposed Runtime Hire action continues to use `CreateEmployeeCommandHandler`, which only validates and prepares intent. A separate internal `CreateEmployeePersistenceHandler` proves handler-to-port integration through `ApplicationRuntime.executeInMemoryEmployeeCreate`. No browser action calls that method.

Authorization policy still runs before either handler. The internal handler now receives a Unit of Work rather than a repository directly. Durable persistence, audit storage, notifications, and browser-authoritative employee submission remain deferred.
