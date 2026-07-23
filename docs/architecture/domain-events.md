# Domain events

## Purpose

Domain events are immutable records of business facts that have already occurred. The first event is `people.employee.created`, created only by the internal authoritative employee persistence path after command validation and authorization.

A command expresses requested intent. An event records a completed fact. A notification is a future delivery concern, and an audit record is a separate durable compliance concern. This slice implements none of notification delivery, event publishing, or audit persistence.

## Lifecycle

The employee aggregate root records `EmployeeCreated` while its repository transaction stages the aggregate. The event includes server-generated ID and timestamp, aggregate and tenant identity, correlation and request IDs, a version placeholder, and only safe creation payload fields.

The Unit of Work commits staged data first. Only after commit succeeds does it pull aggregate events and add them to `InMemoryDomainEventCollector`. It then derives immutable audit records from those committed events. The collector preserves order for server-side tests and has no publish, webhook, message-bus, notification, or outbox behavior.

On rollback or commit failure, staged events are cleared and never reach the collector. Runtime Hire still invokes only the preparation handler, so it opens no transaction and records no events.

## Deferred work

Durable audit records, an outbox, replay, event sourcing, CQRS projections, and any event bus or messaging integration remain deferred. A later slice may replace the in-memory collector behind the same post-commit boundary.
