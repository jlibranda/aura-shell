# ADR-013: Legal Entity as a First-Class Aggregate

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-25 |
| **Supersedes** | ADR-012 §5 "Legal Entity is intentionally deferred" (deferral only — the rest of ADR-012 stands unchanged) |
| **Foundation for** | Hire Placement Alignment (Epic 7B.6) |
| **Related** | ADR-012 (Organization Domain); AURA Engineering Constitution v1.0 (§4 Engineering Principles, §11 Non-Negotiables) |

This ADR records architectural decisions. It defines no schema, API, UI, code,
migration, or task beyond what is necessary to state the decision. Where it and
a lower-level document disagree, this document wins — or it is amended,
deliberately, with a version bump.

---

## 1. Context

ADR-012 §5 deferred Legal Entity: "There is no concrete consumer today
... Introducing Legal Entity now would be speculative structure." The deferral
was conditioned on an explicit trigger: "the first Payroll or multi-country
slice."

That trigger has arrived earlier than ADR-012 anticipated, and from a different
direction. AURA must support **a single tenant with multiple employers of
record** — one client organization that legally operates as more than one
registered entity, each hiring its own employees, before Timekeeping or
Payroll ship. This is a proven current product requirement, observed while
implementing Hire Placement Alignment, not speculative future scope. It is the
same shape of consumer ADR-012 anticipated for Payroll, arriving one slice
early.

## 2. Problem Statement

Continuing to defer Legal Entity means every hire, every OrgUnit, and every
Assignment in a multi-entity tenant is placed with no way to record which
legal employer it belongs to. That is not a gap Payroll can absorb later
without a redesign: OrgUnits and Assignments created today, with no entity
reference, would all need retroactive attribution the moment Payroll needs it.
ADR-012 §5 itself anticipated this shape of change would be additive — "an org
unit gains an optional owning-entity reference" — but "optional" is only
correct if no real multi-entity tenant exists yet. One does now, so the
reference must be adopted as a real ownership relationship, not an optional
attribute, from the moment OrgUnit and Assignment are created.

## 3. Decision — Legal Entity is a foundational Organization and Employment aggregate

**Legal Entity is promoted from deferred to adopted, effective now.** It joins
OrgUnit, Location, and Assignment as a peer aggregate in the Organization
domain (ADR-012 §5), with the same lifecycle discipline: tenant-scoped,
immutable audit, transactional outbox, archived-not-deleted, `id`/`code`
stable and never reused.

Minimum scope, deliberately narrow (Rule of Three — no speculative expansion
beyond what Hire Placement Alignment requires):

- `id`, `tenantId`, `code`, `legalName`, `countryCode`, `status`,
  `createdAt`/`createdBy`, `updatedAt`, `archivedAt`.

**Explicitly out of scope for this ADR and this slice**: tax registrations,
statutory account numbers, bank accounts, payroll calendars, benefit plans,
accounting setup, country payroll rules. These are Payroll-domain concerns
that attach to a Legal Entity later, when Payroll itself is built — Legal
Entity's adoption here does not pull Payroll's scope forward with it.

### Legal Entity is never an OrgUnit kind

This holds unchanged from ADR-012 §5's own framing of the (until-now
hypothetical) future shape: Legal Entity is a distinct aggregate that OrgUnits
belong to, not a node kind within the OrgUnit tree. `ORG_UNIT_KINDS` continues
to be `DIVISION`, `BUSINESS_UNIT`, `DEPARTMENT`, `BRANCH`, `TEAM` — unchanged
by this ADR.

### Ownership, not attribute

Every OrgUnit belongs to **exactly one** Legal Entity (`OrgUnit.legalEntityId`,
required, immutable once set in this slice — moving an OrgUnit across Legal
Entities is not a normal hierarchy move). A parent-child OrgUnit relationship
is only valid within the same Legal Entity. This is a stricter shape than
ADR-012 §5's "optional owning-entity reference" sketch, because the sketch
was written for a hypothetical Payroll consumer where retrofitting was
acceptable; the real multi-entity-tenant consumer requires the reference to be
correct from creation, not backfilled per-module later.

### Assignment carries Legal Entity directly

`Assignment.legalEntityId` is required, alongside `orgUnitId`, `locationId`,
and `managerId`. It must always equal the assigned OrgUnit's `legalEntityId` —
Assignment does not introduce a second, independently-editable source of
entity truth; it records the entity the OrgUnit already belongs to, at the
placement's effective date. This preserves ADR-012 §7's effective-dating
discipline: a Legal Entity change for a person is a new, effective-dated
Assignment, never a mutation of history.

### Legal Entity changes are deliberate, not incidental

Ordinary placement actions — Transfer Organization, Change Manager, Change
Location — preserve `legalEntityId` unchanged; they operate within the
person's current employer of record. Changing employer of record (an
inter-entity transfer) is a materially different, higher-consequence event
than a department transfer, and this slice does not build a dedicated
workflow for it. Consequently: **`legalEntityId` is selected once, at Hire,
and is not editable afterward in this slice.** A dedicated Change Legal
Entity / inter-entity transfer workflow is deferred, with the same explicit-
trigger discipline ADR-012 uses elsewhere: the trigger is the first slice that
needs to move an existing employee between employers of record.

## 4. Location remains tenant-level

**Location is not owned by a Legal Entity.** ADR-012 §5 already established
Location as "a dimension orthogonal to the org tree... a location may host
many units"; the same reasoning extends to Legal Entity: one physical office
can host employees from more than one employer of record in a shared-services
arrangement, so forcing a single owning entity onto a Location would be
incorrect for a real, common case, not merely unproven. `Location` gains no
`legalEntityId` column. `Assignment` still validates that the selected
Location is active and belongs to the same tenant as the placement — Location
is checked for tenant membership, not entity membership.

## 5. Relationship to ADR-012

ADR-012 is **not rewritten**. Its Context, Problem Statement, and every
decision other than the Legal Entity deferral in §5 stand as originally
recorded — they were correct when written and remain correct. Only the
deferral itself is superseded: where ADR-012 §5 said "this ADR defers it,"
that clause is now historical (it explains why Legal Entity did not exist
between 2026-07-24 and 2026-07-25), and this ADR's §3 is the current rule.
ADR-012 §11's "Premature Legal Entity" rejected-alternative entry is
similarly historical, not current guidance — the trigger it named ("the first
Payroll or multi-country slice") fired, one slice early, as recorded in §1
above.

## 6. Rejected alternatives

- **Keep deferring, model multi-entity as a labeling convention on OrgUnit
  name/code.** Rejected: unenforceable, gives no referential integrity, and
  is exactly the "structure as denormalized strings" failure ADR-012 §2
  already rejected for organization in general.
- **Legal Entity as an OrgUnit kind.** Rejected per the ticket's explicit
  constraint and per ADR-012 §5's own framing: Legal Entity is an owning
  aggregate above OrgUnit, not a node within its recursive tree — conflating
  the two would make "what kind is this node" and "who owns this node"
  indistinguishable.
- **Optional `legalEntityId` on OrgUnit (as ADR-012 §5 originally sketched).**
  Rejected now that a real multi-entity tenant exists: optional would allow
  new OrgUnits to be created with no employer of record, which is precisely
  the gap this ADR exists to close.
- **Build the dedicated inter-entity transfer workflow now.** Rejected as
  out of scope for this slice (Rule of Three — no proven consumer yet for a
  person moving between employers of record); Legal Entity is fixed at Hire
  instead, with the transfer workflow left as an explicit, named future
  trigger (§3).
- **`legalEntityId` on Location.** Rejected per §4 — a shared-services
  location hosting employees from multiple entities is a real, current case,
  not a hypothetical one.

## 7. Consequences

**Positive.** Every OrgUnit and Assignment created from this slice forward
carries a correct, referentially-enforced employer of record, so Payroll's
eventual per-entity processing and multi-country expansion need only new
reads against a stable identifier — exactly the test ADR-012 §13 sets for
success. No retroactive attribution work is deferred into a future slice.

**Negative / trade-offs.** Every tenant's existing OrgUnits and Assignments
predate Legal Entity and must be backfilled to a real, non-null
`legalEntityId` in the same migration that adds the column (never left
nullable as a permanent state) — a one-time, deterministic, idempotent
migration-created "Legacy Legal Entity" per affected tenant, to be renamed or
split by each tenant's administrator once their real legal entities are
known. Fixing `legalEntityId` at Hire (no edit workflow in this slice) means a
data-entry mistake at hire time requires a future inter-entity transfer
workflow to correct — an accepted, explicitly-triggered cost, chosen over
building that workflow speculatively.
