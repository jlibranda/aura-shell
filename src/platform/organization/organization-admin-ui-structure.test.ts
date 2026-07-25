import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_MANIFEST } from "@/platform/configuration/registry/configuration-manifest";

/**
 * Structural guards for Epic 7B.5 (Organization Administration UI): exactly
 * one composition root and one employee-directory implementation, and the
 * Settings manifest's "organization" entry is activated correctly (not
 * silently duplicated or left pointing at the wrong permission/route).
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

describe("a single OrganizationAdminRuntime composition and employee-directory implementation", () => {
  const files = sourceFiles();

  it("declares createOrganizationAdminRuntime in exactly one file", () => {
    const declarers = files.filter((f) => /export function createOrganizationAdminRuntime\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/organization-admin-runtime.ts"]);
  });

  it("declares PrismaOrganizationEmployeeDirectory in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?class\s+PrismaOrganizationEmployeeDirectory\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/prisma-organization-employee-directory.ts"]);
  });

  it("no file under src/platform/organization/ imports the People module (ADR-012 §4: Organization never depends on People)", () => {
    const organizationFiles = files.filter((f) => f.path.startsWith("src/platform/organization/") && !f.path.endsWith(".test.ts"));
    for (const file of organizationFiles) {
      expect(file.content, `${file.path} must not import from @/platform/people`).not.toMatch(/from\s+["']@\/platform\/people\//);
    }
  });
});

describe("the Settings manifest's organization entry (Epic 7B.5 activation)", () => {
  const entry = CONFIGURATION_MANIFEST.find((e) => e.key === "organization");

  it("exists exactly once", () => {
    expect(CONFIGURATION_MANIFEST.filter((e) => e.key === "organization")).toHaveLength(1);
  });

  it("is implemented, with a route, gated by organization.view (not settings.view)", () => {
    expect(entry?.status).toBe("implemented");
    expect(entry?.route).toBe("/settings/organization");
    expect(entry?.permission).toBe("organization.view");
  });

  it("declares no configurationType — it is a functional area, not a versioned config category", () => {
    expect(entry?.configurationType).toBeUndefined();
  });
});
