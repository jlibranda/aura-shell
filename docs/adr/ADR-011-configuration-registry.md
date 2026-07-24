# ADR-011: Configuration Registry

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-24 |
| **Foundation for** | Epic 7A.1 |
| **Related** | Epic 7 Slice 7A (Configuration Foundation); AURA Engineering Constitution v1.0 (§4 Engineering Principles, §8 Configuration Philosophy) |

This ADR describes an architecture. It defines no schema, interfaces, code, or
implementation tasks. It is the decision every 7A.1 implementation must follow.

---

## 1. Context

Epic 7A delivered the **configuration platform**: typed, versioned,
effective-dated configuration with a draft→publish lifecycle, immutable audit,
transactional outbox, tenant isolation, permission gating, and effective-date
resolvers. That is the *engine*. It is sound and this ADR does not revisit it.

What 7A did **not** deliver is a *catalog* — a description of which
configuration categories exist in the platform and what state each is in for a
given tenant. The Settings surface fills that gap by hand: the Settings home
enumerates its categories as inline markup, and only the one implemented
category (General) is wired to real per-tenant state. Every other category is a
static placeholder.

This was the correct scope for 7A — one working category proves the engine. But
it leaves the *surface* describing categories imperatively, in one place, for
one screen. The moment a second and third category arrive (Organization,
Attendance, Payroll), that imperative list is copied, and the cost of "add a
category" grows with the number of surfaces that must each learn about it.

A registry solves this by making the catalog a **first-class, declarative
primitive** that every configuration-aware surface reads, rather than a fact
each surface re-encodes.

---

## 2. Problem Statement

Today, the knowledge "what configuration categories exist and what is their
state" is not owned anywhere. It is implied by imperative UI. Concretely:

- **Hardcoded category list.** Categories exist only as inline markup on one
  screen. Adding a category means editing that screen — and every other screen
  that also needs the list.
- **Duplicated navigation.** Settings navigation and the Settings home both
  need the same category list. Two hand-maintained copies will diverge; a
  category will appear in one and not the other.
- **Duplicated status computation.** "Is this category configured for this
  tenant?" is computed ad hoc wherever it is needed. Each surface reimplements
  the same read against the resolvers, and they will disagree.
- **Future consumers need the same thing.** Readiness, guided setup, a health
  rollup, and an AI advisor all require the identical pairing of *category
  metadata* and *per-tenant state*. Without a shared primitive, each reinvents
  it, and the platform accumulates several subtly different answers to the same
  question.

The underlying defect is a missing single source of truth. Everything above is
a symptom of the same absence.

---

## 3. Decision

**The Configuration Registry is the single source of truth describing every
configuration category available in the platform.**

It describes each category along two axes — its **static identity** (what the
category *is*, identical for every tenant) and its **per-tenant runtime state**
(what this tenant has done with it) — and exposes the two as one coherent,
read-only, tenant-scoped view. Every configuration-aware surface consumes the
registry rather than re-deriving the catalog.

The registry is a **read-side catalog and projection**. It introduces no new
storage, no new authority, and no new business behavior. It reads what the 7A
engine already owns and presents it as a described list.

---

## 4. Architecture

The registry is two layers that must never be collapsed into one.

### Layer 1 — Static Manifest

A compile-time, code-resident declaration of the categories the platform build
provides. For each category it declares:

- **category key** — stable identifier
- **title** — human-facing name
- **description** — plain-language purpose
- **permission** — the permission that gates viewing/managing the category
- **implemented** — whether the category is functional or a declared future one
- **owner** — the team accountable for it
- **configuration type** — the typed-configuration link into the 7A engine
- **advisory dependencies** — categories this one is understood to depend on
- **advisory consumers** — categories/modules understood to consume it

The manifest describes the **shape of the software**. It is identical across all
tenants, changes only when the codebase changes, and is versioned and reviewed
with the code. The `dependencies`/`consumers` fields are explicitly
**advisory** — human-authored documentation, not enforced coupling (see §7).

### Layer 2 — Runtime Read Model

A per-tenant, per-request projection computed from the 7A repositories and
resolvers. For each category it reports:

- **configured** — whether the tenant has an effective configuration
- **current version** — the effective version, if any
- **scheduled version** — a published-but-future version, if any
- **readiness** — whether prerequisites are satisfied for this tenant
- **validation summary** — outstanding blocking issues, if any
- **warnings** — non-blocking advisories
- **last published** — when the category last changed

The read model describes **this tenant's state**. It is derived on demand and
**never stored** — it is a projection of the authoritative version/audit data,
not a second copy of it.

### Why the layers must stay separate

They have different lifecycles, different sources, and different trust levels.

- The manifest changes on **deploys**; the read model changes on **tenant
  actions**. Coupling them forces one to move at the other's cadence.
- The manifest's source is **code**; the read model's source is the
  **database**. Putting the manifest in the database means a category could
  "exist" in data with no code behind it, and invites migration churn and
  code↔data drift. Baking tenant state into code is simply impossible.
- The manifest is an **authoritative catalog**; the read model is a **derived
  projection**. Keeping them distinct preserves the platform's read/write
  discipline (Constitution §4, "Read Model"): the projection can always be
  recomputed and can never silently disagree with the audit trail.

The manifest is the stable contract. The read model is the live picture painted
against it.

---

## 5. Registry Service

There is exactly **one** service: `describeConfigurationCategories(context)`.

Its responsibility is to **join the two layers for a verified tenant**. Given a
trusted request context, it walks the static manifest and, for each category the
caller is permitted to see, decorates the static entry with that category's
runtime read model — computed via the existing 7A resolvers and repositories,
under the same permission checks those already enforce. It returns a per-tenant
list of *described categories*: metadata plus live state, as one view.

What it does **not** do is as important as what it does. It computes no business
outcome, enforces no lifecycle transition, and stores nothing. It is read-only,
tenant-scoped, and deny-by-default: a caller who cannot view a category does not
receive its state. It is a describer, not a decider.

*(No interface or code is defined here by design; the service's contract is a
7A.1 concern that must conform to this description.)*

---

## 6. Consumers

Every configuration-aware surface becomes a **consumer** of the described list
rather than an owner of its own catalog logic.

- **Settings Home** renders category cards from the described list instead of
  inline markup. Adding a category requires no change here.
- **Navigation** builds the Settings menu from the same described list, so
  navigation and home cannot drift apart.
- **Status Rollup / Health** is a pure function over the described list —
  counting categories that need attention, are scheduled, or carry warnings. No
  independent state computation.
- **Future Readiness** reads a category's *advisory dependencies* (manifest) and
  the *configured* state of those dependencies (read model) to answer "can this
  be set up yet" — with no new engine.
- **Future Guided Setup** derives each step's completion from the read model and
  stores no progress of its own, so it can never disagree with actual
  configuration state.
- **Future AI Advisor** consumes the described list as a **read model only**,
  honoring the Constitution's write-free AI boundary (§6) by construction.

These are consumers, not owners, because every one of them needs the *same*
join of metadata and per-tenant state. Implemented separately, they would
duplicate that join and diverge. Implemented against one registry, they share
one truth and one computation, and are consistent everywhere by default.

---

## 7. Non-Responsibilities

The registry's long-term integrity depends on what it **refuses** to become.
Each of these, if absorbed, turns a thin describer into the coupling point the
design exists to avoid.

- **Not a dependency engine.** `dependencies`/`consumers` are advisory
  documentation. The registry never resolves, orders, or enforces them. The
  real dependency is which code reads which configuration; a declared list is a
  comment, and is treated as one.
- **Not a workflow engine.** The registry describes lifecycle state; it never
  drives transitions. Draft→publish→retire remains owned by the 7A command
  pipeline.
- **Not a policy simulator.** It never computes attendance, payroll, or any
  business outcome. It reports *whether* a category is configured, never *what
  that configuration would produce*.
- **Not a graph engine.** No cycle detection, no topological sort, no
  dependency traversal. Advisory metadata is displayed, not computed over.
- **Not configuration storage.** It persists nothing. It reads the versions and
  audit records the 7A engine already owns.
- **Not business rules.** Validation, effective dating, and domain logic live in
  the platform and the typed category modules — never in the registry.
- **Not authorization.** The registry *respects* permissions; it is not their
  source. `hasPermission` and the command authorization policy remain the sole
  authorities.

The registry is a catalog and a projection. The instant it computes or enforces,
it has taken on a responsibility that belongs elsewhere.

---

## 8. Architectural Principles

- **Single Source of Truth.** One catalog every surface reads, replacing N
  hand-maintained lists. This is the entire point: divergence becomes
  structurally impossible.
- **Read Model.** Layer 2 is a derived projection, never a stored duplicate,
  consistent with the platform's read/write split and the Constitution's
  refusal to duplicate authoritative state.
- **Declarative Metadata.** The manifest declares facts (this category exists;
  it is gated by this permission); it executes no behavior. Declarative data is
  reviewable and greppable and cannot drift the way imperative branches do.
- **Additive Evolution.** Adding a category is adding a manifest entry — not
  editing every surface (Constitution §4). The per-category cost is capped at
  one declaration plus its typed payload.
- **No Speculative Abstractions.** The registry ships as the concrete catalog
  its *current* consumers need. It builds no dependency, graph, or simulation
  machinery for consumers that do not yet exist (Constitution §4).
- **Rule of Three.** The abstraction is earned, not speculative: Settings home,
  navigation, and status rollup are three real consumers that already need the
  identical metadata-plus-state join. The primitive is justified by its third
  occurrence, exactly as the Constitution requires.

---

## 9. Alternatives Considered

- **Keep hardcoded pages.** Rejected. It is the status quo and the source of the
  debt: every new category edits multiple surfaces, navigation and home drift,
  and status logic is duplicated. It does not scale past a handful of
  categories.
- **Database-driven registry** (the category catalog stored as tenant rows).
  Rejected. The catalog describes the software build and is identical across
  tenants; storing it per tenant invites migration churn, code↔data drift, and
  the incoherent state of a category "existing" in data with no code behind it.
  The manifest belongs in code, versioned with the behavior it names.
- **Dependency engine** (enforced dependency graph). Rejected. Speculative — the
  consumers it would enforce against do not exist, hand-declared graphs drift
  from real code coupling, and it violates *No Speculative Abstractions*.
  Advisory metadata delivers most of the value at a fraction of the cost and
  risk.
- **Dynamic plugin loading** (categories discovered at runtime). Rejected.
  Categories are compile-time known and security-sensitive — each is gated by a
  permission and must be reviewable. Runtime discovery adds attack surface and
  unpredictability for no current benefit.

---

## 10. Consequences

**Positive.**
- One place to add a category; navigation, home, and status stay consistent by
  construction.
- Readiness, guided setup, health, and the AI advisor become thin views over a
  shared truth instead of independent subsystems.
- Highly testable: the manifest is data, the read model is a pure join over
  existing resolvers.
- Directly realizes Constitution §4 and §8.

**Negative / tradeoffs.**
- A layer of indirection: a surface reads the registry rather than inlining its
  list. This is the intended cost and is small.
- The manifest becomes a shared coordination file. Mitigated by keeping it
  declarative and minimal — a change is a reviewable data edit, not logic.
- Advisory dependency metadata can go stale. Accepted deliberately: it is
  labeled advisory and never enforced, so staleness is a documentation lag, not
  a correctness bug.

**Long-term.**
The registry is the seam every later module plugs into without renegotiation. It
caps the marginal cost of a new configuration category at "one manifest entry
plus its typed payload," which is the scalability property an enterprise
configuration platform must have.

---

## 11. Future Evolution

The registry supports the platform's full trajectory **without itself
changing** — that invariant is the test of whether this decision succeeded.

- **Organization** introduces scope. When scoped configuration arrives, the read
  model's version resolution gains a scope dimension, but the registry's shape —
  manifest plus per-tenant state — is untouched.
- **Attendance, Payroll, Leave** are each simply another described category:
  a manifest entry plus a typed payload. Their prerequisites (e.g. Payroll
  needing Organization and Attendance ready) are expressed as *advisory
  dependencies* the readiness consumer reads — not as new registry machinery.
- **Compliance** country packs are new categories and types, not registry
  changes.
- **AI** consumes the described list as a read model; the Constitution's
  write-free AI boundary holds by construction, because the registry offers
  nothing to write.

The invariant to defend in every future review: **new capability equals a new
manifest entry plus a new typed payload — never a change to the registry
primitive itself.** The day a proposal requires the registry to compute,
enforce, store, or orchestrate, it is proposing a different thing, and this ADR
is the reason to say no.
