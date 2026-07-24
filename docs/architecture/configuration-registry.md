# Configuration Registry — implementation guide (Epic 7A.1)

The Configuration Registry is the single source of truth describing every
Settings category. It implements ADR-011; this document explains **how to use
and extend it**. For *why* it is shaped this way — the two-layer decision, the
non-responsibilities, the alternatives rejected — read
[ADR-011](../adr/ADR-011-configuration-registry.md). This guide does not repeat
that reasoning.

## Where things live

| Concern | File |
|---|---|
| Layer 1 — static manifest (the category catalog) | `src/platform/configuration/registry/configuration-manifest.ts` |
| Manifest validation | `src/platform/configuration/registry/manifest-validation.ts` |
| Layer 2 — describe service + read model | `src/platform/configuration/registry/configuration-registry-service.ts` |
| Navigation projection (pure) | `src/platform/configuration/registry/settings-navigation.ts` |
| Batched status read | `getConfigurationSummaries` on `ConfigurationReadRepository` |
| Settings Home (consumer) | `src/app/(app)/settings/page.tsx` |
| Card presentation (consumer) | `src/components/settings/settings-category-card.tsx`, `settings-category-presentation.ts` |

## Static vs. derived — the two layers

**Static (Layer 1, `configuration-manifest.ts`):** everything identical across
tenants — key, title, description, group, order, permission, owner,
implementation status, route, configurationType, and advisory
dependencies/consumers. This is code, versioned with the build. It never
touches the database.

**Derived per tenant (Layer 2, the service):** current status, effective/
scheduled version dates, and the draft/scheduled flags — computed on demand
from the existing configuration read side. Never stored, never a new column.

The service `describeConfigurationCategories(context, reader)` joins the two:
it filters the manifest to the categories the caller may see, fetches their
runtime state in one batched call, and returns an ordered list of described
categories.

## How permissions affect visibility

Each manifest entry names the `permission` that gates it. The service excludes
any category the caller lacks that permission for, using the existing
`hasPermission`. **This is visibility, not authorization** — the route handlers
and command pipeline still enforce their own server-side authorization
independently (ADR-011 §7, ticket §8). Hiding a card is never the control.

## How runtime status is derived (and its precedence)

Primary status, in order:

1. **coming_soon** — the category is not implemented in this build. No query is
   performed for it.
2. **available** — implemented but not a versioned configuration category
   (e.g. the audit trail): usable, nothing to configure.
3. **configured** — a configuration category with an effective version in force.
4. **not_configured** — a configuration category with no effective version yet.

`hasDraft` and `hasScheduledChange` are **additive flags**, shown alongside the
primary status (a scheduled change or in-progress draft never hides the current
effective state). "Needs attention" is intentionally **not** produced: there is
no truthful read-side validation source yet, and a fabricated one would violate
the Constitution's "clear status, never arbitrary" rule.

## Query strategy (performance)

Settings Home issues **no per-category query**. The service collects the visible,
implemented, versioned category codes and calls `getConfigurationSummaries`
once — two queries total (definitions, then their versions), regardless of how
many categories exist. Effective/draft/scheduled are derived in memory with the
same rules as the single-record read methods, so a summary can never disagree
with `getEffectiveVersion`. No caching layer, no denormalized status (ADR-011,
ticket §10).

## Why dependencies and consumers are advisory

The manifest's `dependencies`/`consumers` are human-authored documentation. The
registry never resolves, orders, or enforces them — the real dependency is
which code reads which configuration, and a declared list can lag that. Manifest
validation therefore checks only referential hygiene (dependencies name real
keys; no self/duplicate entries) and deliberately allows a `consumer` to name a
future module not yet in the manifest. There is no graph, no cycle detection, no
topological sort (ADR-011 §7).

## Adding a new Settings category

1. **Add one manifest entry** to `CONFIGURATION_MANIFEST`. Pick a stable `key`,
   a `group` and unique `order`, the gating `permission`, an `owner`, and the
   `status`. That is the *only* change the Settings surface needs — Home and
   navigation pick it up automatically.
2. If it is a **coming-soon** category, stop here: no route, no configuration
   type. It renders as a labeled, non-interactive card.
3. If it is an **implemented configuration category**, additionally: build its
   typed payload + validator (mirror `general-company-settings.ts`), its
   commands/handlers, and its routes (mirror `/settings/general/*`); set
   `status: "implemented"`, its `route`, and its `configurationType`; and add
   the type→code entry to `CONFIGURATION_TYPE_TO_CODE` (and the resolver's
   `CONFIGURATION_TYPE_CODES`). The registry then derives its status with no
   further change to the service.
4. Add an icon for the key in `settings-category-icons.tsx` (presentation only).
5. Run the manifest validation test — it will fail loudly on a duplicate key,
   duplicate route, duplicate order-within-group, missing route, invalid
   permission, or bad dependency reference.

## What the registry intentionally does NOT do

It never writes configuration, publishes, authorizes commands, audits, emits
outbox messages, computes a business outcome, stores anything, or acts as a
dependency/graph/workflow/simulation engine. It is a read-only catalog and a
per-tenant projection. Enforcing these boundaries: the import-boundary fitness
rules `configuration-registry-must-not-import-write-side`,
`configuration-manifest-must-not-import-persistence`, and
`client-components-must-not-import-configuration-server-composition`, plus the
structural test that Settings Home renders from the registry rather than a
hardcoded list.
