import type { NavigationGroup } from "@/platform/configuration/registry/configuration-manifest";
import type { DescribedConfigurationCategory } from "@/platform/configuration/registry/configuration-registry-service";

/**
 * The Settings navigation model, projected purely from the registry's described
 * categories. The Settings Home grid renders this today; any future Settings
 * sub-navigation renders the same model — so the two can never drift.
 *
 * This is a pure transform of already-permission-filtered, already-ordered
 * described categories. It performs no permission check or data access of its
 * own; visibility and ordering are the registry's responsibility (ADR-011).
 */
export interface SettingsNavigationItem {
  readonly key: string;
  readonly label: string;
  readonly group: NavigationGroup;
  /** Present only for implemented categories; coming-soon items are not linkable. */
  readonly href?: string;
  /** True for coming-soon categories — render as a labeled, non-interactive destination. */
  readonly comingSoon: boolean;
}

export interface SettingsNavigationGroup {
  readonly group: NavigationGroup;
  readonly items: readonly SettingsNavigationItem[];
}

/** Flat navigation list, in the registry's deterministic display order. */
export function toSettingsNavigation(categories: readonly DescribedConfigurationCategory[]): readonly SettingsNavigationItem[] {
  return Object.freeze(categories.map((category) => Object.freeze({
    key: category.key,
    label: category.title,
    group: category.group,
    ...(category.implemented && category.route ? { href: category.route } : {}),
    comingSoon: !category.implemented,
  })));
}

/** The same navigation, bucketed by group while preserving order — for a grouped sub-nav. */
export function toGroupedSettingsNavigation(categories: readonly DescribedConfigurationCategory[]): readonly SettingsNavigationGroup[] {
  const groups: NavigationGroup[] = [];
  const byGroup = new Map<NavigationGroup, SettingsNavigationItem[]>();
  for (const item of toSettingsNavigation(categories)) {
    if (!byGroup.has(item.group)) {
      byGroup.set(item.group, []);
      groups.push(item.group);
    }
    byGroup.get(item.group)!.push(item);
  }
  return Object.freeze(groups.map((group) => Object.freeze({ group, items: Object.freeze(byGroup.get(group)!) })));
}
