# Configuration platform (Epic 7 Slice 7A)

The reusable, tenant-safe, versioned, effective-dated settings foundation. This
slice fully implements one category — **General Company Settings** — on top of
it; every later Settings category (Organization, Access Control, Timekeeping,
Payroll, Leave, Holidays, Approval Workflows, Compliance, …) is expected to
reuse this platform rather than invent its own storage, validation,
publishing, audit, or assignment behavior.

## 1. Configuration architecture

```
Server action ("use server")
  → resolveRequestContext() (verified TrustedRequestContext; never browser-supplied)
  → durable-configuration-runtime.ts (createDurableConfigurationRuntime)
      → CommandExecutionPipeline (PermissionAuthorizationPolicy + AURA_COMMAND_PERMISSION_REQUIREMENTS)
      → *DurableHandler (validate → PrismaConfigurationUnitOfWork.execute)
          → ConfigurationWriteTransaction (buffers DomainEvents per mutation)
          → PrismaConfigurationWriteRepository ($transaction-scoped)
          → AuditRecordFactory.configurationEvent() + PrismaAuditRecordRepository.append()
          → toOutboxMessage() + PrismaOutboxRepository.append()
      → commit → events released to collectors only after commit succeeds

Server loader ("use server" via resolveRequestContext)
  → createPrismaConfigurationReadRuntime(request)
      → PrismaConfigurationReadRepository (every method requires settings.view)
      → ConfigurationResolvers (getEffectiveConfiguration / getConfigurationTimeline)
```

Reads and writes are separate ports (`ConfigurationReadRepository` /
`ConfigurationWriteRepository`), mirroring the existing People
directory/read-model split. The write repository is only ever constructed
inside a `PrismaConfigurationUnitOfWork` transaction; nothing outside that
boundary can mutate a `ConfigurationVersion` row.

## 2. Definition versus version versus assignment

- **`ConfigurationDefinition`** — the stable identity of one configurable
  policy object for a tenant: `type` (e.g. `GENERAL_COMPANY_SETTINGS`),
  `code` (unique per tenant, e.g. `"general"`), `name`, `description`. It
  never itself carries settings values.
- **`ConfigurationVersion`** — one typed, validated snapshot of that
  definition's values (`payload: Json`), plus lifecycle/effective-dating
  metadata (`status`, `versionNumber`, `effectiveFrom`, `effectiveUntil`,
  `publishedAt`/`publishedBy`, `changeReason`). All actual settings data
  lives here, never in the definition row and never as one unvalidated blob
  shared across categories — every category's payload shape is a typed
  TypeScript interface (`GeneralCompanySettingsPayload` today) validated by
  its own function before it is ever persisted.
- **Assignment** — deliberately **not implemented** this slice.
  `ConfigurationDefinition.scopeType`/`scopeRef` exist (currently always
  `"TENANT"`/the tenant ID) so the read contract's shape does not have to
  change when a later slice adds legal-entity/department/location-scoped
  assignment; no assignment table or resolution-by-hierarchy logic exists
  yet. See "Known deferred capabilities" below.

## 3. Lifecycle

`DRAFT → PUBLISHED → RETIRED`. `DRAFT` and `PUBLISHED`/`RETIRED` are stored
statuses; **"Scheduled" is a derived display state**, never stored — it is
simply a `PUBLISHED` version whose `effectiveFrom` is in the future
(`isScheduled()` in `configuration-version.ts`). A tenant may have at most one
`DRAFT` version per definition (Postgres partial unique index
`configuration_versions_one_draft_per_definition`); publishing consumes that
draft (its row transitions to `PUBLISHED`, it is not copied). Multiple
`PUBLISHED` versions can coexist — that is what effective-dating means, not
an error state.

A DB trigger (`configuration_versions_prevent_mutation`) enforces this at the
lowest level, independent of the application code: rows with status
`PUBLISHED` or `RETIRED` are immutable except for the one legitimate
system-driven transition `PUBLISHED → RETIRED` (and even then, only
`status`/`retired_at` may change — payload, dates, and publish metadata are
frozen). `RETIRED` is available via `ConfigurationWriteRepository.retireVersion()`
but is **not** invoked automatically on publish in this slice — see "Known
deferred capabilities."

## 4. Effective dating

`effectiveFrom`/`effectiveUntil` on `PUBLISHED` versions. Resolution helpers
(`configuration-resolvers.ts`):

- `getEffectiveConfiguration({ context, configurationType, asOf })` — the one
  `PUBLISHED` version whose range contains `asOf`, most-recent-`effectiveFrom`
  wins if ranges overlap.
- `getConfigurationTimeline({ context, configurationDefinitionId })` — every
  version (draft, published, scheduled, retired), newest-`versionNumber`
  first.

Both are pure functions over a `ConfigurationReadRepository`, tenant-scoped
via the caller's `TenantContext`, never a caller-supplied tenant string.

## 5. Inheritance

General Company Settings is the tenant-level default layer. No inheritance
resolution exists yet because no lower scope (legal entity, department,
location) can hold a configuration row this slice — `scopeType` is always
`"TENANT"`. When a scoped category is added, inheritance should resolve as
"most specific `PUBLISHED`+effective version wins, else fall back to the next
scope up, else the tenant default" — implement that as a new resolver
function that composes `getEffectiveConfiguration` at each scope, not as a
change to the stored schema.

## 6. Tenant isolation

Every write-repository method takes `tenantId` as an explicit parameter and
includes it in every `WHERE` clause (never inferred, never a default). Every
read-repository method takes the verified `TenantContext` and scopes to
`context.tenantId` — there is no method that accepts a caller-supplied tenant
override. Command contracts (`SaveGeneralSettingsDraftCommand`,
`PublishGeneralSettingsCommand`, `DiscardGeneralSettingsDraftCommand`) have no
`tenantId` field at all; handlers read `request.principal.tenantId` from the
already-verified `TrustedRequestContext`, so there is nothing for a browser
to spoof. Proven in `general-settings-durable-handlers.test.ts` (structural
scan) and `configuration-platform.integration.test.ts` (real cross-tenant
queries against Postgres).

## 7. Authorization

Four permissions (`src/platform/context.ts`): `settings.view`,
`settings.manage`, `settings.publish`, `settings.audit.view`. Role matrix
(`ROLE_PERMISSIONS` in `context.ts`, mirrored by `derivePermissionsFromRoles()`
in `production-request-context.ts`):

| Role          | view | manage | publish | audit.view |
|---------------|:----:|:------:|:-------:|:----------:|
| hr_admin      | ✅   | ✅     | ✅      | ✅         |
| hr_operations | ✅   | ✅     | ❌      | ❌         |
| payroll       | ✅   | ❌     | ❌      | ❌         |
| auditor       | ✅   | ❌     | ❌      | ✅         |
| manager       | ❌   | ❌     | ❌      | ❌         |
| employee      | ❌   | ❌     | ❌      | ❌         |

Enforced twice, independently: `AURA_COMMAND_PERMISSION_REQUIREMENTS` gates
every command through `PermissionAuthorizationPolicy` (deny-by-default —
an unregistered command type is denied, not silently allowed), and every
read-repository method calls `hasPermission(context, "settings.view")`
itself. A loader/page checking permission is a UX nicety, not the authority —
both layers fail closed even if a route forgets to check.

## 8. Audit and outbox integration

`PrismaConfigurationUnitOfWork` mirrors `PrismaEmployeeUnitOfWork` exactly:
one Prisma `$transaction` wraps the write repository call, the resulting
`DomainEvent`s (buffered by `ConfigurationWriteTransaction`), their derived
`AuditRecord`s (`AuditRecordFactory.configurationEvent()`, additive — the
pre-existing `employeeCreated()` method is untouched), and their
`OutboxMessage`s (`toOutboxMessage()`, reused as-is). All three commit
together or none do; events are only released to in-process collectors after
that commit succeeds. Audit metadata carries only safe identifiers
(`definitionId`, `versionId`, `versionNumber`, `status`, and for publish,
`effectiveFrom`/`effectiveUntil`) — never the raw settings payload.

## 9. Country-pack extension strategy

General Company Settings is deliberately country-agnostic: no Philippine,
PHP, Asia/Manila, Monday-first, or five-day-week default anywhere in
`general-company-settings.ts` — every field is a plain required/optional
input validated against real IANA/ISO/BCP-47 data via `Intl`. A future
country pack (e.g. Philippine statutory compliance) should be a **new**
`ConfigurationDefinition` `type` (e.g. `PH_COMPLIANCE_SETTINGS`) with its own
payload/validator/warnings module, not a set of optional fields bolted onto
General. `warnGeneralCompanySettings()`'s country/time-zone mismatch check is
the one place General is even aware a "primary country" concept exists, and
it is advisory only — it never blocks publish.

## 10. How future Timekeeping settings should integrate

Add a new `configurationType` constant + payload interface + validator
(mirroring `general-company-settings.ts`), reuse
`ConfigurationWriteRepository`/`ConfigurationReadRepository`/
`PrismaConfigurationUnitOfWork` unchanged, add new command/handler classes
(mirroring `general-settings-commands.ts` /
`general-settings-durable-handlers.ts`), and read the tenant's default time
zone/working-days/first-day-of-week from `getEffectiveConfiguration` against
`GENERAL_COMPANY_SETTINGS_TYPE` rather than re-asking the user or
hardcoding a default.

## 11. How future Payroll settings should integrate

Same pattern as Timekeeping. Payroll's `settings.view`-only role (this slice)
should be extended in `context.ts`'s `ROLE_PERMISSIONS` map with a
payroll-specific manage/publish permission when that category is built —
do not widen `settings.manage`/`settings.publish` to payroll generically, or
payroll gains edit rights over every settings category including General.
Read the tenant's default currency from General via `getEffectiveConfiguration`
rather than re-collecting it.

## 12. How to add a new typed settings category

1. Define `constants + payload interface + validate*()` (pure, `Intl`-based
   where relevant) — no new npm dependency.
2. Reuse `ConfigurationWriteRepository`/`ConfigurationReadRepository`/
   `PrismaConfigurationUnitOfWork`/`ConfigurationWriteTransaction` as-is.
3. Add `create*Event()` functions in a category-specific events module
   (mirror `configuration-events.ts`), or add cases to it if the shape is
   identical.
4. Add three commands + a `*DurableHandler` class per command (save draft /
   discard / publish), mirroring `general-settings-durable-handlers.ts`.
5. Register the new command types in `AURA_COMMAND_PERMISSION_REQUIREMENTS`.
6. Add the definition→code mapping to `CONFIGURATION_TYPE_CODES` in
   `configuration-resolvers.ts`.
7. Add routes under `/settings/<category>` following the same
   view/edit/review/history/versions/[versionId] shape.
8. Extend `import-boundaries.ts` if the new category introduces its own
   write-runtime/read-runtime modules (same naming convention as the
   `platform/configuration/*` entries already added).

## 13. Migration and deployment requirements

Migration `20260724020000_configuration_foundation` adds
`configuration_definitions`/`configuration_versions` plus the CHECK
constraints, partial unique index, and immutability trigger described above.
Standard `prisma migrate deploy` (already wired via the existing `postinstall`
hook) applies it; no data backfill is required since these are new tables.
No new environment variables. No changes to `NEXTAUTH_SECRET`, session
cookies, or any 6M0.1/6M1 infrastructure.

## 14. Known deferred capabilities

Explicitly out of scope this slice (see the ticket's "Out of Scope" section
for the full list): configuration **assignment** to a specific legal
entity/department/location (only tenant-wide `scopeType: "TENANT"` exists);
automatic retirement of a superseded `PUBLISHED` version on publish (multiple
published versions simply coexist, resolved by effective date at query time);
any Settings category besides General (Organization, Access Control,
Timekeeping, Payroll, Leave, Holidays, Approval Workflows, Notifications,
Compliance, Integrations, Data Management ship as labeled "Coming soon"
cards only); a full side-by-side draft-vs-published comparison view (the
Review screen shows the draft's fields; comparing against the currently
effective version today means visiting `/settings/general` separately); a
complete RBAC/custom-role editor for the `settings.*` permissions themselves
(the role→permission matrix is fixed in code, not admin-editable).
