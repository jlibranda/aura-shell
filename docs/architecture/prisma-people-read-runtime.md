# Prisma People read runtime

## Active flow

`/people` and `/people/[employeeId]` construct a trusted server read runtime from the server-owned development request adapter. The runtime creates a trusted tenant context and invokes dedicated Prisma read repositories. The UI receives only directory rows and profile/contact view models.

```text
Trusted request context
  → PrismaPeopleReadRuntime
  → tenant-scoped Prisma read repository
  → safe read model
  → existing loader/view model
  → read-only People UI
```

## Contracts and isolation

- `PeopleDirectoryReadRepository` projects only ID, employee number, display name, work email, organization reference IDs, hire date, position, and employment status.
- `EmployeeProfileReadRepository` separately projects profile-safe fields and verified work email.
- Every Prisma query predicates on the trusted `tenantId`; profile and contact lookups use the composite tenant/employee key.
- The loaders retain their existing safe `not_found`, `unauthorized`, and `unavailable` results. Contact failure is isolated from Overview, Employment, and Work Information.
- Organization labels continue through `OrganizationReferenceService`; failure produces existing neutral placeholders rather than a legacy fallback.

## Explicit exclusions

These read models never select or expose personal email, mobile number, home address, emergency contacts, Government IDs, compensation, tenant/session metadata, roles, permissions, audit data, or raw `Employee` objects. Government IDs remain deferred.

## Scope limits

The Prisma read runtime owns no commands, Unit of Work, aggregate repository, event publisher, outbox, browser action, or write capability. Runtime Hire remains preparation-only; the durable Create Employee command remains an internal trusted-server path.
