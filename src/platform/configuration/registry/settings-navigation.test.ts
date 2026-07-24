import { describe, expect, it } from "vitest";
import { toGroupedSettingsNavigation, toSettingsNavigation } from "@/platform/configuration/registry/settings-navigation";
import type { DescribedConfigurationCategory } from "@/platform/configuration/registry/configuration-registry-service";

function described(overrides: Partial<DescribedConfigurationCategory>): DescribedConfigurationCategory {
  return Object.freeze({
    key: "general", title: "General", description: "d", group: "company", order: 10, owner: "P",
    implemented: true, route: "/settings/general", status: "not_configured", hasDraft: false, hasScheduledChange: false,
    dependencies: [], consumers: [], ...overrides,
  });
}

const CATEGORIES: readonly DescribedConfigurationCategory[] = [
  described({ key: "general", group: "company", order: 10, implemented: true, route: "/settings/general" }),
  described({ key: "organization", group: "company", order: 20, implemented: false, route: undefined, status: "coming_soon" }),
  described({ key: "audit", group: "governance", order: 10, implemented: true, route: "/settings/audit", status: "available" }),
];

describe("toSettingsNavigation", () => {
  it("projects each described category into a nav item, preserving the registry's order", () => {
    const nav = toSettingsNavigation(CATEGORIES);
    expect(nav.map((i) => i.key)).toEqual(["general", "organization", "audit"]);
  });

  it("gives implemented categories an href and marks coming-soon items non-linkable", () => {
    const nav = toSettingsNavigation(CATEGORIES);
    expect(nav.find((i) => i.key === "general")!.href).toBe("/settings/general");
    const org = nav.find((i) => i.key === "organization")!;
    expect(org.href).toBeUndefined();
    expect(org.comingSoon).toBe(true);
  });

  it("adds no category the registry did not already permission-filter (pure projection, no visibility logic)", () => {
    // Only what is passed in comes out — the projection performs no filtering itself.
    const nav = toSettingsNavigation([CATEGORIES[0]]);
    expect(nav).toHaveLength(1);
    expect(nav[0].key).toBe("general");
  });
});

describe("toGroupedSettingsNavigation", () => {
  it("buckets items by group while preserving order", () => {
    const grouped = toGroupedSettingsNavigation(CATEGORIES);
    expect(grouped.map((g) => g.group)).toEqual(["company", "governance"]);
    expect(grouped[0].items.map((i) => i.key)).toEqual(["general", "organization"]);
    expect(grouped[1].items.map((i) => i.key)).toEqual(["audit"]);
  });
});
