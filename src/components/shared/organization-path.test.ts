import { describe, expect, it } from "vitest";
import { organizationPathKindLabel, toOrganizationPathNodes, type OrganizationPathSegment } from "@/components/shared/organization-path";
import { ORG_UNIT_KINDS, type OrgUnitKind } from "@/platform/organization/org-unit";

function segment(overrides: Partial<OrganizationPathSegment> = {}): OrganizationPathSegment {
  return { id: "ou1", name: "Finance", kind: "DEPARTMENT", ...overrides };
}

describe("organizationPathKindLabel", () => {
  it("gives every OrgUnit kind a readable label", () => {
    const expected: Record<OrgUnitKind, string> = {
      DIVISION: "Division",
      BUSINESS_UNIT: "Business Unit",
      DEPARTMENT: "Department",
      BRANCH: "Branch",
      TEAM: "Team",
    };
    for (const kind of ORG_UNIT_KINDS) {
      expect(organizationPathKindLabel(kind)).toBe(expected[kind]);
    }
  });
});

describe("toOrganizationPathNodes", () => {
  it("handles an empty path (no current placement)", () => {
    expect(toOrganizationPathNodes([])).toEqual([]);
  });

  it("handles a flat (single-node) organization: one node, at depth 0, emphasized as the assigned unit", () => {
    const nodes = toOrganizationPathNodes([segment({ id: "hr", name: "Human Resources", kind: "BUSINESS_UNIT" })]);
    expect(nodes).toEqual([{ id: "hr", name: "Human Resources", kindLabel: "Business Unit", depth: 0, isAssignedUnit: true }]);
  });

  it("handles a multi-level organization: root-to-leaf order preserved, depth increases per level, only the last node is the assigned unit", () => {
    const nodes = toOrganizationPathNodes([
      segment({ id: "root", name: "Human Resources", kind: "BUSINESS_UNIT" }),
      segment({ id: "mid", name: "HR Operations", kind: "DEPARTMENT" }),
      segment({ id: "leaf", name: "Payroll", kind: "TEAM" }),
    ]);
    expect(nodes).toEqual([
      { id: "root", name: "Human Resources", kindLabel: "Business Unit", depth: 0, isAssignedUnit: false },
      { id: "mid", name: "HR Operations", kindLabel: "Department", depth: 1, isAssignedUnit: false },
      { id: "leaf", name: "Payroll", kindLabel: "Team", depth: 2, isAssignedUnit: true },
    ]);
  });

  it("derives kindLabel from each node's own kind, not from its depth or position", () => {
    // Deliberately "backwards" kinds relative to depth — the mapping must not assume a fixed hierarchy shape.
    const nodes = toOrganizationPathNodes([
      segment({ id: "root", name: "Alpha Team", kind: "TEAM" }),
      segment({ id: "leaf", name: "Beta Division", kind: "DIVISION" }),
    ]);
    expect(nodes[0].kindLabel).toBe("Team");
    expect(nodes[1].kindLabel).toBe("Division");
  });

  it("marks exactly one node — the last — as the assigned unit, regardless of path length", () => {
    const nodes = toOrganizationPathNodes([segment({ id: "a" }), segment({ id: "b" }), segment({ id: "c" }), segment({ id: "d" })]);
    expect(nodes.filter((node) => node.isAssignedUnit).map((node) => node.id)).toEqual(["d"]);
  });
});
