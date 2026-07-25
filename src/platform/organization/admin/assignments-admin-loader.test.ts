import { describe, expect, it } from "vitest";
import { toAssignmentAdminRows } from "@/platform/organization/admin/assignments-admin-loader";
import type { AssignmentRecord } from "@/platform/organization/assignment";

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "t1", personId: "p1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("toAssignmentAdminRows", () => {
  const employees = [{ id: "p1", displayName: "Ana Domingo" }, { id: "p2", displayName: "Ben Cruz" }, { id: "mgr-1", displayName: "Maria Santos" }];
  const orgUnits = [{ id: "ou1", name: "Finance" }];

  it("joins person, org unit, and manager display names onto each row", () => {
    const rows = toAssignmentAdminRows([assignment({ managerId: "mgr-1" })], employees, orgUnits);
    expect(rows).toEqual([
      { assignmentId: "a1", personId: "p1", personName: "Ana Domingo", orgUnitId: "ou1", orgUnitName: "Finance", managerId: "mgr-1", managerName: "Maria Santos", effectiveFrom: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("omits managerId/managerName entirely when the assignment has no manager", () => {
    const rows = toAssignmentAdminRows([assignment()], employees, orgUnits);
    expect(rows[0]).not.toHaveProperty("managerId");
    expect(rows[0]).not.toHaveProperty("managerName");
  });

  it("falls back to the raw id when a person or org unit can't be resolved to a display name (defensive against orphaned data)", () => {
    const rows = toAssignmentAdminRows([assignment({ personId: "ghost", orgUnitId: "ghost-ou" })], employees, orgUnits);
    expect(rows[0].personName).toBe("ghost");
    expect(rows[0].orgUnitName).toBe("ghost-ou");
  });

  it("sorts rows by resolved person display name", () => {
    const rows = toAssignmentAdminRows(
      [assignment({ id: "a1", personId: "p2" }), assignment({ id: "a2", personId: "p1" })],
      employees,
      orgUnits,
    );
    expect(rows.map((r) => r.personName)).toEqual(["Ana Domingo", "Ben Cruz"]);
  });
});
