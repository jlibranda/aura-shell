# Business Capability Registry

This registry is the version-controlled inventory of AURA business capabilities. A route, tab, drawer, button, component, or endpoint is an entry point, not the capability itself. The machine-readable companion is [`src/platform/capabilities/business-capabilities.ts`](../../src/platform/capabilities/business-capabilities.ts); it is validated in tests for IDs, statuses, dispositions, permissions, and audit requirements.

## Controlled runtime statuses

| Status | Meaning |
|---|---|
| `ACTIVE_RUNTIME` | Trusted runtime currently delivers the capability. |
| `ACTIVE_LEGACY` | Legacy implementation still delivers it outside the runtime boundary. |
| `DEFERRED_VISIBLE` | Safe, visible entry point exists but intentionally has no business data/action. |
| `DEFERRED_HIDDEN` | Not reachable in active UI; reason must be documented in its record. |
| `BLOCKED_SECURITY` | Known security control is missing; remediation is named in its record. |
| `PLANNED` | Known candidate, not an approved active product capability. |
| `RETIRED_APPROVED` | Removed only with explicit product and architecture approval. |

`DEFERRED_HIDDEN` records require an explicit reason. `RETIRED_APPROVED` requires recorded product and architecture approval; neither may be inferred from missing UI.

## Controlled migration dispositions

Every record has exactly one: `PRESERVE`, `MIGRATE_NOW`, `MIGRATE_AFTER_AUTH`, `MIGRATE_AFTER_PERSISTENCE`, `MIGRATE_AFTER_NEW_CONTRACT`, `MOVE_TO_ANOTHER_MODULE`, `KEEP_EXCLUDED`, or `RETIRE_WITH_APPROVAL`.

## People capability inventory

The manifest contains the full individual records, including actor, entry point, implementation, sensitivity, permission, service/command, DTO/read model, persistence, audit, tenant isolation, masking, tests, browser verification, dependencies, and risks.

| Group | Capability IDs / scope | Current status | Disposition |
|---|---|---|---|
| Directory | List, search, paginate, open profile; employee number, work email, position, status, department, manager, hire date, avatar; safe View Profile action; runtime hire preparation entry; local selection/clear | Runtime reads/actions and non-persisting hire preparation | Preserve safe runtime actions; employee creation waits for auth, audit, and persistence |
| Profile read | Overview, Employment, Work Information, Contact Information, organization labels, header, navigation, direct historical URLs, safe result states | Active runtime; historical URLs deferred visible | Preserve |
| Government IDs | Masked TIN, SSS, PhilHealth, Pag-IBIG; tab, reveal/hide/copy, update, verify/reject/cancel, verification metadata | Placeholder tab visible; former read/actions blocked | Masked read after auth; writes after persistence |
| Profile actions | Edit, contact/emergency update, promote, transfer, salary change, regularize, change manager | Deferred hidden; legacy drawers remain source-only | Commands after auth/persistence; compensation moves to Payroll |
| Legacy-only lifecycle methods | Suspend, reactivate, terminate, offboard | Planned, no active profile-menu entry | Require product decision; retirement needs approval |
| Deferred profile tabs | Compensation, Government IDs, Documents, Timeline, Notes, Emergency Contacts, Assets | Deferred visible safe runtime links | Contract/auth/persistence dependent; compensation moves module |

## Known security findings and follow-ups

1. `EmployeeGovernmentIdsDto` contains raw numbers and is **not** a browser read model. Create a masked `GovernmentIdReadModel` before restoring read UI.
2. Government identifiers are masked by default. Full reveal and clipboard copy require purpose-specific permissions and immutable audit events.
3. Legacy Government ID write paths must use a purpose-specific write permission and an authorized command before any runtime restoration.
4. Legacy Government ID updates bypassed `PeopleService`, used the legacy People store, localStorage verification state, and mock actor identity. Replace with tenant-isolated, durable, transactional persistence.
5. Legacy profile actions likewise bypassed commands and durable persistence. Rebuild each as a distinct authorized command; do not reactivate drawers.

Follow-up ownership: Epic 6 establishes authentication, trusted context, and durable persistence. A subsequent People write slice establishes the read models and commands. Payroll owns compensation authority.

## Capability change policy

Before modifying a module, identify every affected registry record. After implementation, classify each affected capability as preserved, migrated, deferred, moved, intentionally excluded, or retired. A slice is incomplete when an affected capability has an unknown disposition. Completion reports must list every hidden, removed, or changed capability and its disposition.

## Epic 6 protection baseline

Infrastructure work must preserve the visible People experience: directory, search, pagination, profile shell/header, Overview, Employment, Work Information, Contact Information, all seven deferred links, selected-tab state, direct-route refresh, narrow-width horizontal navigation, and loading/unavailable/unauthorized/not-found states. Government ID values and profile write actions are not active capabilities and must not be accidentally enabled.

## Slice 5G.1 parity recovery

The runtime directory now has an Add employee entry, a safe View Profile action on rows and cards, and a local selection toolbar with Clear Selection plus an informational bulk-actions notice. The toolbar performs no export or mutation. Directory export, filters, sort, page size, saved views, density, and bulk mutations are registered as deferred capabilities rather than silently absent.

## Slice 5H runtime hire boundary

`/people/hire` is now a runtime-owned, refresh-safe preparation flow. It has a dedicated `RuntimeHireViewModel`, client-side validation, navigation, cancel confirmation, and a `RuntimeCreateEmployeeCommand` object containing only name, verified work email, position, and hire date. It imports neither a legacy repository/store nor browser identity, tenant, or persisted drafts.

Preparing the command is deliberately not employee creation: no repository call, authorization decision, audit event emission, or persistence occurs. `PEOPLE.EMPLOYEE.HIRE` is active runtime preparation; `PEOPLE.EMPLOYEE.CREATE.COMMAND` remains deferred until Epic 6 provides authenticated authorization, immutable auditing, and durable transactional persistence. Government IDs, compensation, personal contact details, emergency contacts, and organization assignment are excluded from this boundary.

## Slice 5H.1 hire field-parity recovery

The active Runtime Hire form restores the six visible legacy steps and all non-Government fields that can safely live in memory. Personal, Contact, Employment, Emergency Contact, and Review are runtime-owned. Department, Team, and Manager selectors use a tenant-isolated `OrganizationReferenceOptionDto` loader. Entity and Business Unit remain visible `DEFERRED_VISIBLE` fields pending verified reference contracts. Pay Frequency remains visible but is `MOVED_TO_ANOTHER_MODULE` under Payroll ownership. TIN, SSS, PhilHealth, and Pag-IBIG remain visible `BLOCKED_SECURITY` placeholders; no raw value is accepted or displayed.

`PEOPLE.EMPLOYEE.HIRE` means preparation only. `PEOPLE.EMPLOYEE.SUBMIT` remains deferred until Epic 6 establishes authentication, authorization, audit, and durable transactional persistence. Runtime Hire never uses localStorage drafts, legacy stores, repositories, or browser-supplied identity.

## Epic 6 Slice 6B application command layer

`PEOPLE.EMPLOYEE.CREATE.COMMAND` now prepares an immutable `CreateEmployeeCommand` through the server-owned `ApplicationRuntime` command pipeline. Its visible Hire behavior remains preparation only: no repository write, transaction, durable audit, notification, or employee creation occurs. `PEOPLE.EMPLOYEE.SUBMIT` remains deferred and all Government ID controls remain blocked.

## Epic 6 Slice 6C authorization policy boundary

`PEOPLE.EMPLOYEE.CREATE.COMMAND` is evaluated by a server-composed, deny-by-default authorization policy before its handler runs. The current preparation policy requires the trusted `people.employee.hire` permission. This adds no visible People capability, does not authorize authoritative submission, and preserves all deferred Government ID and profile-write controls.

## Epic 6 Slice 6D repository ports and in-memory write adapter

`PEOPLE.RUNTIME.EMPLOYEE_WRITE_PORT` is non-visible test/development infrastructure. Its tenant-isolated in-memory adapter validates port and command-handler integration, server-generated deterministic identifiers and timestamps, and work-email conflict behavior. It is never called by the Runtime Hire browser action. `PEOPLE.EMPLOYEE.SUBMIT` remains deferred pending durable persistence, transactions, and durable audit.

## Epic 6 Slice 6E Unit of Work and transaction boundary

`PEOPLE.RUNTIME.EMPLOYEE_TRANSACTION` is non-visible test/development infrastructure. It stages employee aggregate writes per trusted tenant and correlation ID, commits only after a successful internal command operation, and rolls back on failure. It changes no browser route or Hire action: `PEOPLE.EMPLOYEE.CREATE.COMMAND` remains preparation-only and `PEOPLE.EMPLOYEE.SUBMIT` remains deferred pending durable persistence and audit.

## Epic 6 Slice 6F domain events and post-commit collection

`PEOPLE.RUNTIME.DOMAIN_EVENTS` is non-visible infrastructure ready for future consumers. Immutable employee-created events are collected only after a successful in-memory transaction commit and are discarded on rollback or commit failure. Event publishing remains deferred: there is no event bus, outbox, notification, webhook, or audit persistence. No visible People capability changes status or disposition.

## Epic 6 Slice 6G immutable audit pipeline

`PEOPLE.RUNTIME.IMMUTABLE_AUDIT` is non-visible infrastructure ready for future durable audit consumers. It derives immutable audit records only after a successful transaction commit and committed domain event release. Audit persistence, audit UI, audit search, SIEM integration, logging aggregation, and notifications remain deferred. No visible People capability changes status or disposition.

## Epic 6 Slice 6A trusted request boundary

`PEOPLE.RUNTIME.TRUSTED_REQUEST_CONTEXT` is active infrastructure for server runtime loaders. It supplies a request-scoped authenticated principal, permission representation, actor provenance, tenant context, and correlation ID. It changes no visible People route, field, tab, action, capability status, or Government ID control. The development adapter is server-owned and fails closed in production; it is not authentication-provider implementation.

## Epic 6 Slice 6H2 durable command activation

`PEOPLE.RUNTIME.DURABLE_EMPLOYEE_CREATE` is an active **non-visible** trusted-server capability. Its explicit server composition routes the existing `people.employee.create` command through the established authorization policy, `PrismaEmployeeUnitOfWork`, durable employee persistence, immutable audit insertion, and post-commit domain-event collection. This does not change `PEOPLE.EMPLOYEE.CREATE.COMMAND`, which remains Runtime Hire preparation, or `PEOPLE.EMPLOYEE.SUBMIT`, which remains `DEFERRED_HIDDEN`: no page, server action, or public API invokes durable creation.

## Epic 6 Slice 6H3 controlled development seed

`PEOPLE.RUNTIME.DEVELOPMENT_SEED` is active non-visible development infrastructure, invoked only by `npm run seed:development`. It inserts the approved 48-record synthetic projection into an empty development Employee table for tenant `nw-ph`, or reports `already_seeded` for that exact fixture set. It is blocked in production, never runs automatically, never overwrites or resets data, and creates no audit records. It does not change any browser capability, Runtime Hire behavior, Government ID control, or production workflow.

## Epic 6 Slice 6I Prisma People read migration

`PEOPLE.RUNTIME.PRISMA_READ_MODELS` is an active non-visible server read boundary. The active directory and employee-profile loaders now use tenant-scoped Prisma projections through dedicated directory and profile read repositories. Existing visible directory, profile, navigation, and safe error capabilities remain preserved. Runtime Hire stays preparation-only; this read boundary exposes no raw Employee, command, audit, event, Government ID, or browser persistence capability.

## Epic 6 Slice 6J trusted submission gateway

`PEOPLE.RUNTIME.TRUSTED_SUBMISSION_GATEWAY` is active non-visible server infrastructure. It accepts a validated internal Create Employee request only after a server authentication adapter returns a trusted request context, repeats centralized authorization, claims a tenant-scoped durable idempotency key, and invokes the existing durable runtime. Replayed success returns only employee ID, employee number, and correlation ID. No route handler, server action, public API, or Runtime Hire interaction calls the gateway. `PEOPLE.EMPLOYEE.SUBMIT` therefore remains `DEFERRED_HIDDEN`.

## Epic 6 Slice 6K Runtime Hire activation

`PEOPLE.EMPLOYEE.SUBMIT` is active only from the prepared Runtime Hire review. Its server action receives command intent and an idempotency key, resolves the development trusted request context on the server, and invokes the trusted submission gateway. The browser receives only a sanitized result and navigates to the resulting profile. Government IDs, payroll, compensation, notifications, outbox behavior, and other write paths remain excluded.

## Epic 6 Slice 6L durable outbox

`PEOPLE.RUNTIME.DURABLE_OUTBOX` is active non-visible infrastructure. The durable Unit of Work writes safe domain-event messages atomically with Employee and immutable AuditRecord persistence, then releases existing inspection collectors only after commit. An internal worker and dispatcher interface supports later delivery and retry, but no scheduler or external notification integration is registered.

## Epic 6 Slice 6L.1 outbox reliability

`PEOPLE.RUNTIME.DURABLE_OUTBOX` remains active non-visible infrastructure. Its PostgreSQL-backed worker claims rows under a short `FOR UPDATE SKIP LOCKED` transaction, records opaque expiring leases, and guards terminal transitions by lease owner. Retry is bounded and deterministic; permanent or exhausted messages are retained as dead letters. `npm run outbox:inspect` is an explicit server-only state-count diagnostic. No scheduler, external dispatcher, notification, or browser capability has been enabled.
