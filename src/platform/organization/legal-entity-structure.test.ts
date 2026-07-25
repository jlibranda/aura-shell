import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ORG_UNIT_KINDS } from "@/platform/organization/org-unit";

/**
 * Structural guards (ADR-013 §3): there is exactly ONE LegalEntity aggregate
 * and ONE write entry point, Legal Entity is never modeled as an OrgUnit
 * `kind`, and Location is never given a legalEntityId — it stays tenant-level
 * and shareable across Legal Entities (ADR-013 §4).
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

describe("a single LegalEntity aggregate, owning OrgUnit but never a node within it", () => {
  const files = sourceFiles();

  it("declares the LegalEntityRecord aggregate in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?interface\s+LegalEntityRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/organization/legal-entity.ts"]);
  });

  it("declares the single write entry point (LegalEntityService) in exactly one file", () => {
    const services = files.filter((f) => /(export\s+)?class\s+LegalEntityService\b/.test(f.content));
    expect(services.map((f) => f.path)).toEqual(["src/platform/organization/legal-entity-service.ts"]);
  });

  it("keeps all LegalEntity domain code within the organization domain", () => {
    const foreign = files.filter((f) => /interface\s+LegalEntityRecord\b/.test(f.content) && !f.path.startsWith("src/platform/organization/"));
    expect(foreign).toEqual([]);
  });

  it("never models Legal Entity as an OrgUnit kind", () => {
    for (const kind of ORG_UNIT_KINDS) expect(kind).not.toMatch(/entity/i);
    expect(ORG_UNIT_KINDS as readonly string[]).not.toContain("LEGAL_ENTITY");
    expect(ORG_UNIT_KINDS as readonly string[]).not.toContain("ENTITY");
  });

  it("gives OrgUnit exactly one Legal Entity ownership field (legalEntityId), not a collection", () => {
    const orgUnitFile = files.find((f) => f.path === "src/platform/organization/org-unit.ts");
    expect(orgUnitFile).toBeDefined();
    expect(orgUnitFile!.content).toMatch(/legalEntityId:\s*string/);
    expect(orgUnitFile!.content).not.toMatch(/legalEntityIds/);
  });

  it("gives Assignment exactly one Legal Entity field (legalEntityId), always derived from its OrgUnit, never independently settable by TransferInput", () => {
    const assignmentFile = files.find((f) => f.path === "src/platform/organization/assignment.ts");
    expect(assignmentFile).toBeDefined();
    expect(assignmentFile!.content).toMatch(/legalEntityId:\s*string/);
    // TransferInput's own declaration block must not carry a legalEntityId field — ordinary transfer (Change Manager/Change Location included) always preserves it, never accepts a caller-supplied value.
    const transferInputMatch = assignmentFile!.content.match(/export interface TransferInput \{[\s\S]*?\n\}/);
    expect(transferInputMatch).not.toBeNull();
    expect(transferInputMatch![0]).not.toMatch(/legalEntityId/);
  });
});

describe("Location stays tenant-level, never owned by a Legal Entity (ADR-013 §4)", () => {
  it("gives Location no Legal-Entity-owning field", () => {
    const files = sourceFiles();
    const locationFile = files.find((f) => f.path === "src/platform/organization/location.ts");
    expect(locationFile).toBeDefined();
    expect(locationFile!.content).not.toMatch(/legalEntityId/);
  });
});
