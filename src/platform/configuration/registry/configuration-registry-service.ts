import { hasPermission, type TenantContext } from "@/platform/context";
import type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";
import {
  CONFIGURATION_MANIFEST,
  CONFIGURATION_TYPE_TO_CODE,
  NAVIGATION_GROUPS,
  type ConfigurationCategoryManifestEntry,
  type NavigationGroup,
} from "@/platform/configuration/registry/configuration-manifest";

/**
 * ADR-011 Layer 2 — the per-tenant Runtime Read Model, and the one service
 * that joins it to the static manifest (Layer 1).
 *
 * The primary status of a category, in truthful precedence:
 * - "coming_soon": the category is not implemented in this build. (No query.)
 * - "available":   implemented, but not a versioned configuration category
 *                  (e.g. the audit trail) — nothing to configure, just usable.
 * - "configured":  a configuration category with an effective version in force.
 * - "not_configured": a configuration category with no effective version yet.
 *
 * `hasDraft` and `hasScheduledChange` are ADDITIVE flags, never a replacement
 * for the primary status: a scheduled change or an in-progress draft is shown
 * ALONGSIDE the current effective state, never hiding it (ADR-011 / ticket §5).
 *
 * "needs attention" is intentionally NOT produced here: there is no truthful
 * read-side validation/warning source in this slice, and a fabricated one
 * would violate the Constitution's "clear status, never arbitrary" rule.
 */
export type ConfigurationCategoryStatus = "coming_soon" | "available" | "not_configured" | "configured";

/** The described category returned to consumers: static metadata + derived per-tenant state. */
export interface DescribedConfigurationCategory {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly group: NavigationGroup;
  readonly order: number;
  readonly owner: string;
  readonly implemented: boolean;
  readonly route?: string;
  readonly configurationType?: string;
  readonly status: ConfigurationCategoryStatus;
  /** An editable draft exists (may coexist with an effective version). */
  readonly hasDraft: boolean;
  /** A future-dated published version is scheduled (shown without hiding the effective state). */
  readonly hasScheduledChange: boolean;
  /** The effective version's start date, when configured. */
  readonly effectiveSince?: string;
  /** The scheduled version's start date, when one is scheduled. */
  readonly scheduledFor?: string;
  /** Advisory only (ADR-011 §7) — never enforced. */
  readonly dependencies: readonly string[];
  /** Advisory only (ADR-011 §7) — never enforced. */
  readonly consumers: readonly string[];
}

const GROUP_ORDER: Readonly<Record<NavigationGroup, number>> = Object.freeze(
  Object.fromEntries(NAVIGATION_GROUPS.map((group, index) => [group, index])) as Record<NavigationGroup, number>,
);

/** Deterministic display order: by group, then by the entry's order, then by key. */
function byDisplayOrder(a: DescribedConfigurationCategory, b: DescribedConfigurationCategory): number {
  if (GROUP_ORDER[a.group] !== GROUP_ORDER[b.group]) return GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
  if (a.order !== b.order) return a.order - b.order;
  return a.key.localeCompare(b.key);
}

/**
 * Server-only. Describes every configuration category the caller is permitted
 * to see, joining static manifest metadata with derived per-tenant state.
 *
 * It is read-only and tenant-scoped: it never writes, publishes, authorizes a
 * command, audits, or computes a business outcome. Tenant identity comes only
 * from the verified context. Categories the caller cannot view are excluded
 * (registry filtering is visibility, NOT a substitute for the route/command
 * authorization that remains in place independently).
 *
 * Runtime state is fetched in one batched call (≤2 queries) for the visible,
 * implemented, versioned categories — never one query per category.
 */
export async function describeConfigurationCategories(
  context: TenantContext,
  reader: ConfigurationReadRepository,
  manifest: readonly ConfigurationCategoryManifestEntry[] = CONFIGURATION_MANIFEST,
  asOf: Date = new Date(),
): Promise<readonly DescribedConfigurationCategory[]> {
  const visible = manifest.filter((entry) => hasPermission(context, entry.permission));

  // Only implemented configuration categories (those with a configurationType)
  // carry per-tenant state; fetch all of them in one batched read.
  const codeByType = (type: string): string | undefined => CONFIGURATION_TYPE_TO_CODE[type];
  const configCodes = visible
    .filter((entry) => entry.status === "implemented" && entry.configurationType)
    .map((entry) => codeByType(entry.configurationType!))
    .filter((code): code is string => Boolean(code));

  const summaries = configCodes.length > 0
    ? await reader.getConfigurationSummaries(context, configCodes, asOf)
    : new Map();

  const described = visible.map((entry): DescribedConfigurationCategory => {
    const base = {
      key: entry.key,
      title: entry.title,
      description: entry.description,
      group: entry.group,
      order: entry.order,
      owner: entry.owner,
      implemented: entry.status === "implemented",
      ...(entry.route ? { route: entry.route } : {}),
      ...(entry.configurationType ? { configurationType: entry.configurationType } : {}),
      dependencies: entry.dependencies,
      consumers: entry.consumers,
    };

    // Not implemented → coming soon, no per-tenant state, no query performed.
    if (entry.status !== "implemented") {
      return Object.freeze({ ...base, status: "coming_soon" as const, hasDraft: false, hasScheduledChange: false });
    }

    // Implemented but not a versioned configuration category (e.g. audit) → available.
    const code = entry.configurationType ? codeByType(entry.configurationType) : undefined;
    if (!code) {
      return Object.freeze({ ...base, status: "available" as const, hasDraft: false, hasScheduledChange: false });
    }

    // Implemented configuration category → derive from the batched summary.
    const summary = summaries.get(code);
    const configured = Boolean(summary?.configured);
    return Object.freeze({
      ...base,
      status: configured ? ("configured" as const) : ("not_configured" as const),
      hasDraft: Boolean(summary?.hasDraft),
      hasScheduledChange: Boolean(summary?.scheduledFrom),
      ...(summary?.effectiveFrom ? { effectiveSince: summary.effectiveFrom } : {}),
      ...(summary?.scheduledFrom ? { scheduledFor: summary.scheduledFrom } : {}),
    });
  });

  return Object.freeze([...described].sort(byDisplayOrder));
}
