import { describe, expect, it } from "vitest";
import { flattenOrgUnitTreeForDisplay } from "@/components/people/hire/org-unit-tree-select";
import { buildOrgUnitTree, type OrgUnitRecord } from "@/platform/organization/org-unit";

function unit(overrides: Partial<OrgUnitRecord> = {}): OrgUnitRecord {
  return Object.freeze({
    id: "ou1", tenantId: "t1", legalEntityId: "le1", code: "OU1", name: "Unit", kind: "DEPARTMENT", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("flattenOrgUnitTreeForDisplay", () => {
  it("flattens a multi-level tree depth-first, root first, preserving each node's own kind", () => {
    const units = [
      unit({ id: "bu", name: "Cashalo", kind: "BUSINESS_UNIT" }),
      unit({ id: "div", name: "Human Resources", kind: "DIVISION", parentId: "bu" }),
      unit({ id: "dept", name: "HR Operations", kind: "DEPARTMENT", parentId: "div" }),
    ];
    const rows = flattenOrgUnitTreeForDisplay(buildOrgUnitTree(units));
    expect(rows.map((row) => [row.node.id, row.depth, row.node.kind])).toEqual([
      ["bu", 0, "BUSINESS_UNIT"],
      ["div", 1, "DIVISION"],
      ["dept", 2, "DEPARTMENT"],
    ]);
  });

  it("includes BUSINESS_UNIT-kind roots (Business Unit is reachable end-to-end, not excluded)", () => {
    const rows = flattenOrgUnitTreeForDisplay(buildOrgUnitTree([unit({ id: "bu", kind: "BUSINESS_UNIT" })]));
    expect(rows).toHaveLength(1);
    expect(rows[0].node.kind).toBe("BUSINESS_UNIT");
  });

  it("handles multiple independent root units (a flat org, or several trees) at depth 0", () => {
    const rows = flattenOrgUnitTreeForDisplay(buildOrgUnitTree([
      unit({ id: "a", name: "Alpha" }),
      unit({ id: "b", name: "Beta" }),
    ]));
    expect(rows.every((row) => row.depth === 0)).toBe(true);
    expect(rows.map((row) => row.node.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty list for no org units", () => {
    expect(flattenOrgUnitTreeForDisplay(buildOrgUnitTree([]))).toEqual([]);
  });
});
