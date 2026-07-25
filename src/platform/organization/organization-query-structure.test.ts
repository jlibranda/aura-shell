import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for Epic 7B.4 (Organization Query & People Integration):
 * exactly one query service and one placement-service implementation, and
 * the placement-resolution code path never reads a denormalized Employee
 * organization field (ADR-012 §12 invariant #5) — resolution goes through
 * Assignment, never `Employee.departmentId/teamId/managerId/workLocation`.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");
// `managerId` is deliberately excluded here: it is a legitimate field on
// AssignmentRecord itself (that is exactly what these files are supposed to
// read). The forbidden thing is reading it off an *Employee*-shaped value —
// checked separately, below, by property-access shape.
const LEGACY_EMPLOYEE_FIELDS_EXCEPT_MANAGER = /\b(departmentId|teamId|workLocation)\b/;
const EMPLOYEE_SHAPED_MANAGER_ACCESS = /\b(profile|employee)\.managerId\b/;

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

describe("a single OrganizationQueryService and a single OrganizationPlacementService implementation", () => {
  const files = sourceFiles();

  it("declares the OrganizationQueryService class in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?class\s+OrganizationQueryService\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/organization-query-service.ts"]);
  });

  it("declares the PrismaOrganizationPlacementService class in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?class\s+PrismaOrganizationPlacementService\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/people/read-models/prisma-organization-placement-service.ts"]);
  });
});

describe("placement resolution never reads a denormalized Employee organization field (ADR-012 §12)", () => {
  const files = sourceFiles();
  const placementResolutionPaths = [
    "src/platform/organization/organization-query-service.ts",
    "src/platform/people/read-models/organization-placement-service.ts",
    "src/platform/people/read-models/prisma-organization-placement-service.ts",
    "src/platform/people/profile-runtime-loader.ts",
  ];

  for (const path of placementResolutionPaths) {
    it(`${path} never references Employee.departmentId, Employee.teamId, or Employee.workLocation`, () => {
      const file = files.find((f) => f.path === path);
      expect(file, `expected ${path} to exist`).toBeDefined();
      expect(file!.content).not.toMatch(LEGACY_EMPLOYEE_FIELDS_EXCEPT_MANAGER);
    });

    it(`${path} never reads managerId off an Employee-shaped value (profile.managerId / employee.managerId)`, () => {
      const file = files.find((f) => f.path === path);
      expect(file, `expected ${path} to exist`).toBeDefined();
      expect(file!.content).not.toMatch(EMPLOYEE_SHAPED_MANAGER_ACCESS);
    });
  }

  it("the directory row resolver passes only person ids to placement resolution, never legacy fields", () => {
    const file = files.find((f) => f.path === "src/platform/people/directory-runtime-loader.ts");
    expect(file).toBeDefined();
    expect(file!.content).toMatch(/resolvePlacementSummaries\(\s*\n?\s*runtime\.context,\s*\n?\s*employees\.map\(\(employee\) => employee\.id\)/);
  });
});
