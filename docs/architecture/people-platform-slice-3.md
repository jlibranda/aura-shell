# People Platform Slice 3

The Slice 3 reference architecture separates UI consumers from People data access.

`Consumer → PeopleService → policy + validator → EmployeeRepository → result DTO`, with command paths also emitting `AuditRepository` events.

The composition root registers `EmployeeRepository`, `AuditRepository`, and `PeopleService` through typed service tokens. The current Employee adapter is development-only in-memory infrastructure seeded from the existing fixture factory. It clones data on read/write boundaries and is not production persistence.

Safe DTOs are explicit: directory/profile DTOs omit Government IDs and personal contact data; Government IDs have a dedicated, permission-enforced query and metadata-only audit event. List and search contracts are deterministic and bounded.

Remaining limitations: the UI still consumes legacy Zustand data; there are no APIs, persistent storage, real sessions/tenant resolution, server authorization, or production audit retention. These are prerequisites for People Productionization.
