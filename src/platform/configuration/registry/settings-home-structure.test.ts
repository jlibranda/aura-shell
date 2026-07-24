import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard (ADR-011): the Settings Home must render from the registry,
 * not carry its own category list. This is a focused structural check, not a
 * formatting scan — it asserts the page renders categories via a single mapped
 * component and sources them from the registry loader.
 */
describe("Settings Home is registry-driven, not hardcoded", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/settings/page.tsx"), "utf8");

  it("sources its categories from the registry loader", () => {
    expect(source).toContain("loadSettingsHome");
  });

  it("renders exactly one SettingsCategoryCard element (a single mapped render, not N hardcoded cards)", () => {
    const usages = source.match(/<SettingsCategoryCard\b/g) ?? [];
    expect(usages).toHaveLength(1);
  });

  it("maps over the registry-provided categories rather than listing them inline", () => {
    expect(source).toMatch(/categories\.map\(/);
  });

  it("does not re-declare category identity metadata that belongs to the manifest", () => {
    // The old hardcoded titles/descriptions must be gone from the page; identity lives in the manifest.
    for (const hardcodedTitle of ["\"Organization\"", "\"Access Control\"", "\"Timekeeping\"", "\"Payroll\""]) {
      expect(source).not.toContain(hardcodedTitle);
    }
  });
});
