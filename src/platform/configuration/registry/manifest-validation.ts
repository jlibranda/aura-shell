import { isPermission } from "@/platform/context";
import { NAVIGATION_GROUPS, type ConfigurationCategoryManifestEntry } from "@/platform/configuration/registry/configuration-manifest";

export interface ManifestValidationIssue {
  /** The category key the issue concerns, or "manifest" for whole-manifest issues. */
  key: string;
  code: string;
  message: string;
}

/**
 * Validates the static manifest's internal integrity. This guards the one
 * place category metadata lives — a malformed manifest is a build-time defect,
 * not a runtime surprise. It deliberately performs NO graph analysis: no cycle
 * detection, no topological ordering, no dependency enforcement (ADR-011 §7).
 * Dependencies and consumers are advisory; the only checks are referential
 * sanity (they name real keys) and hygiene (no self/duplicate entries).
 */
export function validateConfigurationManifest(
  entries: readonly ConfigurationCategoryManifestEntry[] = [],
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];
  const keys = new Set<string>();
  const routes = new Set<string>();
  const orderByGroup = new Map<string, Set<number>>();
  const knownKeys = new Set(entries.map((entry) => entry.key));

  for (const entry of entries) {
    // Unique keys.
    if (keys.has(entry.key)) issues.push({ key: entry.key, code: "DUPLICATE_KEY", message: `Category key "${entry.key}" is declared more than once.` });
    keys.add(entry.key);

    // Group is known.
    if (!(NAVIGATION_GROUPS as readonly string[]).includes(entry.group)) {
      issues.push({ key: entry.key, code: "UNKNOWN_GROUP", message: `Category "${entry.key}" uses unknown navigation group "${entry.group}".` });
    }

    // Deterministic ordering: unique order within a group.
    const groupOrders = orderByGroup.get(entry.group) ?? new Set<number>();
    if (groupOrders.has(entry.order)) {
      issues.push({ key: entry.key, code: "DUPLICATE_ORDER", message: `Category "${entry.key}" reuses display order ${entry.order} within group "${entry.group}".` });
    }
    groupOrders.add(entry.order);
    orderByGroup.set(entry.group, groupOrders);

    // Permission is a real platform permission.
    if (!isPermission(entry.permission)) {
      issues.push({ key: entry.key, code: "INVALID_PERMISSION", message: `Category "${entry.key}" references unknown permission "${entry.permission}".` });
    }

    // Implemented categories must have a unique route.
    if (entry.status === "implemented") {
      if (!entry.route || entry.route.trim() === "") {
        issues.push({ key: entry.key, code: "MISSING_ROUTE", message: `Implemented category "${entry.key}" must declare a route.` });
      } else {
        if (routes.has(entry.route)) issues.push({ key: entry.key, code: "DUPLICATE_ROUTE", message: `Route "${entry.route}" is used by more than one category.` });
        routes.add(entry.route);
      }
    } else if (entry.route) {
      issues.push({ key: entry.key, code: "UNEXPECTED_ROUTE", message: `Coming-soon category "${entry.key}" must not declare a route until it is implemented.` });
    }

    // An implemented *configuration* category (one that declares a configurationType) must name a recognized type.
    // A configurationType is only meaningful for implemented categories.
    if (entry.configurationType !== undefined && entry.status !== "implemented") {
      issues.push({ key: entry.key, code: "TYPE_ON_UNIMPLEMENTED", message: `Category "${entry.key}" declares a configuration type but is not implemented.` });
    }

    // Dependency hygiene: reference known keys, no self-dependency, no duplicates.
    const seenDeps = new Set<string>();
    for (const dep of entry.dependencies) {
      if (dep === entry.key) issues.push({ key: entry.key, code: "SELF_DEPENDENCY", message: `Category "${entry.key}" lists itself as a dependency.` });
      if (!knownKeys.has(dep)) issues.push({ key: entry.key, code: "UNKNOWN_DEPENDENCY", message: `Category "${entry.key}" depends on unknown category "${dep}".` });
      if (seenDeps.has(dep)) issues.push({ key: entry.key, code: "DUPLICATE_DEPENDENCY", message: `Category "${entry.key}" lists dependency "${dep}" more than once.` });
      seenDeps.add(dep);
    }

    // Consumer hygiene: no duplicates, no self. Consumers are advisory and are
    // deliberately NOT validated as enforced dependencies (unknown keys are
    // permitted — a consumer may be a future module not yet in the manifest).
    const seenConsumers = new Set<string>();
    for (const consumer of entry.consumers) {
      if (consumer === entry.key) issues.push({ key: entry.key, code: "SELF_CONSUMER", message: `Category "${entry.key}" lists itself as a consumer.` });
      if (seenConsumers.has(consumer)) issues.push({ key: entry.key, code: "DUPLICATE_CONSUMER", message: `Category "${entry.key}" lists consumer "${consumer}" more than once.` });
      seenConsumers.add(consumer);
    }
  }

  return issues;
}
