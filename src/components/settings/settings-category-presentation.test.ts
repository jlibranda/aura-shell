import { describe, expect, it } from "vitest";
import { presentSettingsCategory } from "@/components/settings/settings-category-presentation";
import type { DescribedConfigurationCategory } from "@/platform/configuration/registry/configuration-registry-service";

function described(overrides: Partial<DescribedConfigurationCategory>): DescribedConfigurationCategory {
  return Object.freeze({
    key: "general", title: "General", description: "d", group: "company", order: 10, owner: "P",
    implemented: true, route: "/settings/general", status: "not_configured", hasDraft: false, hasScheduledChange: false,
    dependencies: [], consumers: [], ...overrides,
  });
}

describe("presentSettingsCategory", () => {
  it("links an implemented category to its route", () => {
    const p = presentSettingsCategory(described({ status: "configured" }));
    expect(p.interactive).toBe(true);
    expect(p.href).toBe("/settings/general");
    expect(p.statusLabel).toBe("Configured");
  });

  it("renders a coming-soon category as non-interactive with no href", () => {
    const p = presentSettingsCategory(described({ key: "organization", implemented: false, route: undefined, status: "coming_soon" }));
    expect(p.interactive).toBe(false);
    expect(p.href).toBeUndefined();
    expect(p.statusLabel).toBe("Coming soon");
  });

  it("shows the not-set-up label for an implemented but unconfigured category", () => {
    expect(presentSettingsCategory(described({ status: "not_configured" })).statusLabel).toBe("Not set up yet");
  });

  it("surfaces a draft as an additive annotation without changing the primary status", () => {
    const p = presentSettingsCategory(described({ status: "configured", hasDraft: true }));
    expect(p.statusLabel).toBe("Configured");
    expect(p.annotations).toContain("Unpublished draft in progress");
  });

  it("surfaces a scheduled change with its date as an annotation", () => {
    const p = presentSettingsCategory(described({ status: "configured", hasScheduledChange: true, scheduledFor: "2999-09-01T00:00:00.000Z" }));
    expect(p.annotations.some((a) => a.startsWith("Change scheduled for"))).toBe(true);
  });

  it("builds an accessible status that includes annotations (status is not color-only)", () => {
    const p = presentSettingsCategory(described({ status: "configured", hasDraft: true }));
    expect(p.accessibleStatus).toContain("Configured");
    expect(p.accessibleStatus).toContain("Unpublished draft in progress");
  });
});
