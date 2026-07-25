import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ORG_UNIT_KINDS } from "@/platform/organization/org-unit";

/**
 * Structural guards (ADR-012 §5): there is exactly ONE Location aggregate and
 * ONE write entry point, Location is never modeled as an OrgUnit `kind`, and
 * Employee.workLocation stays legacy — it must never regain authoritative
 * status by being re-declared as a source of truth elsewhere.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");

function sourceFiles(): { path: string; content: string }[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(full);
      if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) return [full];
      return [];
    });
  return walk(join(REPO_ROOT, "src")).map((absolute) => ({
    path: relative(REPO_ROOT, absolute).split("\\").join("/"),
    content: readFileSync(absolute, "utf8"),
  }));
}

describe("a single Location aggregate, orthogonal to OrgUnit", () => {
  const files = sourceFiles();

  it("declares the LocationRecord aggregate in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?interface\s+LocationRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/location.ts"]);
  });

  it("declares the single write entry point (LocationService) in exactly one file", () => {
    const services = files.filter((f) => /(export\s+)?class\s+LocationService\b/.test(f.content));
    expect(services.map((f) => f.path)).toEqual(["src/platform/organization/location-service.ts"]);
  });

  it("keeps all Location domain code within the organization domain (no Location aggregate leaks into other domains)", () => {
    const foreign = files.filter((f) => /interface\s+LocationRecord\b/.test(f.content) && !f.path.startsWith("src/platform/organization/"));
    expect(foreign).toEqual([]);
  });

  it("never models Location as an OrgUnit kind", () => {
    expect(ORG_UNIT_KINDS as readonly string[]).not.toContain("LOCATION");
  });

  it("gives OrgUnit no location-owning field (no locationId/locations on the OrgUnit record)", () => {
    const orgUnitFile = files.find((f) => f.path === "src/platform/organization/org-unit.ts");
    expect(orgUnitFile).toBeDefined();
    expect(orgUnitFile!.content).not.toMatch(/\blocationId\b/);
  });
});

describe("Employee.workLocation stays legacy", () => {
  it("does not reintroduce a legacy-locations join or backfill from Employee.workLocation in this slice", () => {
    const files = sourceFiles();
    const backfill = files.filter((f) => f.path.startsWith("src/platform/organization/") && /workLocation/.test(f.content));
    expect(backfill).toEqual([]);
  });
});
