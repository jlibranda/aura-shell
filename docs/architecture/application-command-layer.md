# Application command layer

## Purpose

Commands are the framework-free write-side boundary for future AURA business workflows. A command describes business intent; it is not a persistence model, entity, HTTP request, or browser object.

## Current lifecycle

`Runtime Hire form` → immutable `CreateEmployeeCommand` → server action → `ApplicationRuntime` → authorization policy → `CommandExecutionPipeline` → `CreateEmployeeCommandHandler` → prepared result.

The handler currently performs application validation only. A successful result means that the intent is structurally valid and has been prepared; it never means that an employee was created.

## Contracts and results

Every handler receives exactly a `TrustedRequestContext` and a command. The runtime supplies the former on the server; it never accepts actor, tenant, role, permission, or audit identity from the browser.

`CommandResult` is a typed future API boundary: `success`, `validation_failure`, `authorization_failure`, `conflict`, `infrastructure_failure`, or `unexpected_failure`. Expected validation returns a result rather than throwing.

The current `CreateEmployeeCommand` is deeply frozen and contains only non-Government Hire intent. It contains no entities, repository handles, tenant/session data, permissions, or Government IDs.

## Validation stages

- UI validation gives immediate six-step form guidance.
- Application validation checks the command shape, required values, allowed enums, formats, and cross-field date consistency.
- The centralized authorization policy evaluates the trusted permission snapshot before handler execution.
- Business, persistence, and conflict validation remain deferred.

## In-memory persistence test seam

The internal `CreateEmployeePersistenceHandler` proves the repository port through a deterministic in-memory adapter and Unit of Work. The adapter generates aggregate IDs, employee numbers, and creation/update timestamps on the server; none are command or browser fields. Its `EmployeeCreated` domain event becomes available only after its transaction commits. It is never called by the Runtime Hire browser action and is not authoritative production persistence.

## Deferred integration points

Future slices may add durable repository persistence, transactions, immutable durable audit, notifications, and richer conflict checks behind command handlers. They must not bypass the command pipeline.
