import { describe, expect, it } from "vitest";
import { isPermission } from "@/platform/context";
import { CONFIGURATION_MANIFEST, NAVIGATION_GROUPS, type ConfigurationCategoryManifestEntry } from "@/platform/configuration/registry/configuration-manifest";
import { validateConfigurationManifest } from "@/platform/configuration/registry/manifest-validation";

const base: ConfigurationCategoryManifestEntry = {
  key: "sample",
  title: "Sample",
  description: "A sample category.",
  group: "company",
  order: 10,
  permission: "settings.view",
  owner: "Platform",
  status: "coming_soon",
  dependencies: [],
  consumers: [],
};

describe("the real CONFIGURATION_MANIFEST", () => {
  it("passes its own validation with zero issues", () => {
    expect(validateConfigurationManifest(CONFIGURATION_MANIFEST)).toEqual([]);
  });

  it("has unique category keys", () => {
    const keys = CONFIGURATION_MANIFEST.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses only known navigation groups and real permissions", () => {
    for (const entry of CONFIGURATION_MANIFEST) {
      expect(NAVIGATION_GROUPS).toContain(entry.group);
      expect(isPermission(entry.permission)).toBe(true);
    }
  });

  it("gives every implemented category a route, and no coming-soon category a route", () => {
    for (const entry of CONFIGURATION_MANIFEST) {
      if (entry.status === "implemented") expect(entry.route).toBeTruthy();
      else expect(entry.route).toBeUndefined();
    }
  });

  it("references only known category keys in dependencies", () => {
    const keys = new Set(CONFIGURATION_MANIFEST.map((e) => e.key));
    for (const entry of CONFIGURATION_MANIFEST) {
      for (const dep of entry.dependencies) expect(keys.has(dep)).toBe(true);
    }
  });
});

describe("validateConfigurationManifest catches malformed manifests", () => {
  it("flags duplicate keys", () => {
    const issues = validateConfigurationManifest([base, { ...base, order: 20 }]);
    expect(issues.some((i) => i.code === "DUPLICATE_KEY")).toBe(true);
  });

  it("flags duplicate display order within a group", () => {
    const issues = validateConfigurationManifest([base, { ...base, key: "other" }]);
    expect(issues.some((i) => i.code === "DUPLICATE_ORDER")).toBe(true);
  });

  it("allows the same order in different groups", () => {
    const issues = validateConfigurationManifest([base, { ...base, key: "other", group: "workforce" }]);
    expect(issues.some((i) => i.code === "DUPLICATE_ORDER")).toBe(false);
  });

  it("flags an implemented category with no route", () => {
    const issues = validateConfigurationManifest([{ ...base, status: "implemented" }]);
    expect(issues.some((i) => i.code === "MISSING_ROUTE")).toBe(true);
  });

  it("flags duplicate routes across implemented categories", () => {
    const issues = validateConfigurationManifest([
      { ...base, key: "a", status: "implemented", route: "/settings/x" },
      { ...base, key: "b", order: 20, status: "implemented", route: "/settings/x" },
    ]);
    expect(issues.some((i) => i.code === "DUPLICATE_ROUTE")).toBe(true);
  });

  it("flags a coming-soon category that declares a route", () => {
    const issues = validateConfigurationManifest([{ ...base, route: "/settings/nope" }]);
    expect(issues.some((i) => i.code === "UNEXPECTED_ROUTE")).toBe(true);
  });

  it("flags an invalid permission", () => {
    const issues = validateConfigurationManifest([{ ...base, permission: "settings.superuser" as never }]);
    expect(issues.some((i) => i.code === "INVALID_PERMISSION")).toBe(true);
  });

  it("flags a self-dependency", () => {
    const issues = validateConfigurationManifest([{ ...base, dependencies: ["sample"] }]);
    expect(issues.some((i) => i.code === "SELF_DEPENDENCY")).toBe(true);
  });

  it("flags a dependency on an unknown category", () => {
    const issues = validateConfigurationManifest([{ ...base, dependencies: ["ghost"] }]);
    expect(issues.some((i) => i.code === "UNKNOWN_DEPENDENCY")).toBe(true);
  });

  it("flags duplicate dependency and consumer entries", () => {
    const issues = validateConfigurationManifest([
      { ...base, key: "a", dependencies: ["b", "b"], consumers: ["c", "c"] },
      { ...base, key: "b", order: 20 },
    ]);
    expect(issues.some((i) => i.code === "DUPLICATE_DEPENDENCY")).toBe(true);
    expect(issues.some((i) => i.code === "DUPLICATE_CONSUMER")).toBe(true);
  });

  it("does NOT treat consumers as enforced dependencies (an unknown consumer key is allowed)", () => {
    // A consumer may name a future module not yet in the manifest — advisory only (ADR-011 §7).
    const issues = validateConfigurationManifest([{ ...base, consumers: ["future_module_not_in_manifest"] }]);
    expect(issues.some((i) => i.code === "UNKNOWN_DEPENDENCY")).toBe(false);
    expect(issues).toEqual([]);
  });

  it("flags a configuration type declared on an unimplemented category", () => {
    const issues = validateConfigurationManifest([{ ...base, configurationType: "SOME_TYPE" }]);
    expect(issues.some((i) => i.code === "TYPE_ON_UNIMPLEMENTED")).toBe(true);
  });
});
