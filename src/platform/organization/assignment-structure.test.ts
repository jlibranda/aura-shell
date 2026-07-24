import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards (ADR-012 §7, §12): there is exactly ONE Assignment
 * aggregate, ONE overlap-detection implementation, and ONE write entry point.
 * These catch the specific failure mode the ADR rejects — a second placement
 * record type, or a parallel overlap check drifting away from the one the
 * GIST exclusion constraint mirrors.
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

describe("a single Assignment aggregate and a single overlap implementation", () => {
  const files = sourceFiles();

  it("declares the AssignmentRecord aggregate in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?interface\s+AssignmentRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/assignment.ts"]);
  });

  it("declares the overlap-detection helper in exactly one file", () => {
    const overlapCheckers = files.filter((f) => /export\s+function\s+windowsOverlap\b/.test(f.content));
    expect(overlapCheckers.map((f) => f.path)).toEqual(["src/platform/organization/assignment.ts"]);
  });

  it("declares the single write entry point (AssignmentService) in exactly one file", () => {
    const services = files.filter((f) => /(export\s+)?class\s+AssignmentService\b/.test(f.content));
    expect(services.map((f) => f.path)).toEqual(["src/platform/organization/assignment-service.ts"]);
  });

  it("keeps all Assignment domain code within the organization domain (no Assignment aggregate leaks into other domains)", () => {
    const foreign = files.filter((f) => /interface\s+AssignmentRecord\b/.test(f.content) && !f.path.startsWith("src/platform/organization/"));
    expect(foreign).toEqual([]);
  });
});
