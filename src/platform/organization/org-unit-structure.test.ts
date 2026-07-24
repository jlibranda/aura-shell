import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards (ADR-012): there is exactly ONE OrgUnit aggregate and ONE
 * hierarchy implementation. These catch the specific failure mode the ADR
 * rejects — a second org-unit type or a parallel tree/cycle implementation
 * drifting away from the canonical one.
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

describe("a single OrgUnit aggregate and a single hierarchy implementation", () => {
  const files = sourceFiles();

  it("declares the OrgUnitRecord aggregate in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?interface\s+OrgUnitRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/org-unit.ts"]);
  });

  it("declares the hierarchy helpers (tree build + cycle detection) in exactly one file", () => {
    const treeBuilders = files.filter((f) => /export\s+function\s+buildOrgUnitTree\b/.test(f.content));
    const cycleCheckers = files.filter((f) => /export\s+function\s+wouldCreateCycle\b/.test(f.content));
    expect(treeBuilders.map((f) => f.path)).toEqual(["src/platform/organization/org-unit.ts"]);
    expect(cycleCheckers.map((f) => f.path)).toEqual(["src/platform/organization/org-unit.ts"]);
  });

  it("keeps all OrgUnit domain code within the organization domain (no OrgUnit aggregate leaks into other domains)", () => {
    const foreign = files.filter((f) => /interface\s+OrgUnitRecord\b/.test(f.content) && !f.path.startsWith("src/platform/organization/"));
    expect(foreign).toEqual([]);
  });
});
