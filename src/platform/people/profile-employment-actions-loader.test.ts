import { describe, expect, it } from "vitest";
import { toEmploymentHistoryRows, toEmploymentPickerOptions, toOrganizationPathSegments } from "@/platform/people/profile-employment-actions-loader";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "t1", personId: "p1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function orgUnit(overrides: Partial<OrgUnitRecord> = {}): OrgUnitRecord {
  return Object.freeze({
    id: "ou1", tenantId: "t1", code: "OU1", name: "Finance", kind: "DEPARTMENT", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("toEmploymentHistoryRows", () => {
  const orgUnitNames = new Map([["ou1", "Finance"], ["ou2", "Engineering"]]);
  const employeeNames = new Map([["mgr-1", "Maria Santos"]]);

  it("joins org unit and manager display names onto each row", () => {
    const rows = toEmploymentHistoryRows([assignment({ managerId: "mgr-1" })], orgUnitNames, employeeNames);
    expect(rows).toEqual([{ assignmentId: "a1", orgUnitName: "Finance", managerName: "Maria Santos", effectiveFrom: "2026-01-01T00:00:00.000Z" }]);
  });

  it("omits managerName entirely when the placement has no manager", () => {
    const rows = toEmploymentHistoryRows([assignment()], orgUnitNames, employeeNames);
    expect(rows[0]).not.toHaveProperty("managerName");
  });

  it("includes effectiveUntil only for ended placements", () => {
    const [ongoing, ended] = toEmploymentHistoryRows(
      [assignment({ id: "a1", effectiveFrom: "2026-06-01T00:00:00.000Z" }), assignment({ id: "a2", effectiveUntil: "2026-06-01T00:00:00.000Z" })],
      orgUnitNames,
      employeeNames,
    );
    expect(ongoing.effectiveUntil).toBeUndefined();
    expect(ended.effectiveUntil).toBe("2026-06-01T00:00:00.000Z");
  });

  it("sorts most recent first", () => {
    const rows = toEmploymentHistoryRows(
      [
        assignment({ id: "a1", orgUnitId: "ou1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
        assignment({ id: "a2", orgUnitId: "ou2", effectiveFrom: "2026-06-01T00:00:00.000Z" }),
      ],
      orgUnitNames,
      employeeNames,
    );
    expect(rows.map((row) => row.orgUnitName)).toEqual(["Engineering", "Finance"]);
  });

  it("falls back to the raw id when an org unit or manager can't be resolved (defensive against orphaned data)", () => {
    const rows = toEmploymentHistoryRows([assignment({ orgUnitId: "ghost-ou", managerId: "ghost-mgr" })], orgUnitNames, employeeNames);
    expect(rows[0].orgUnitName).toBe("ghost-ou");
    expect(rows[0].managerName).toBe("ghost-mgr");
  });
});

describe("toEmploymentPickerOptions", () => {
  it("includes only ACTIVE org units in the Transfer picker", () => {
    const { orgUnitOptions } = toEmploymentPickerOptions([orgUnit({ id: "ou1", status: "ACTIVE" }), orgUnit({ id: "ou2", status: "ARCHIVED" })], [], "p1");
    expect(orgUnitOptions.map((option) => option.id)).toEqual(["ou1"]);
  });

  it("excludes the employee themselves from their own manager candidates", () => {
    const { managerOptions } = toEmploymentPickerOptions([], [{ id: "p1", displayName: "Self" }, { id: "p2", displayName: "Other" }], "p1");
    expect(managerOptions.map((option) => option.id)).toEqual(["p2"]);
  });

  it("labels org unit options with name and code", () => {
    const { orgUnitOptions } = toEmploymentPickerOptions([orgUnit({ id: "ou1", name: "Finance", code: "FIN" })], [], "p1");
    expect(orgUnitOptions).toEqual([{ id: "ou1", label: "Finance (FIN)" }]);
  });
});

describe("toOrganizationPathSegments", () => {
  it("carries the path through as id/name/kind triples, in the given order — kind taken directly from the OrgUnit record, never derived from position", () => {
    const segments = toOrganizationPathSegments([
      orgUnit({ id: "root", name: "APAC", kind: "DIVISION" }),
      orgUnit({ id: "mid", name: "Philippines", kind: "BRANCH" }),
      orgUnit({ id: "leaf", name: "Payroll", kind: "TEAM" }),
    ]);
    expect(segments).toEqual([
      { id: "root", name: "APAC", kind: "DIVISION" },
      { id: "mid", name: "Philippines", kind: "BRANCH" },
      { id: "leaf", name: "Payroll", kind: "TEAM" },
    ]);
  });

  it("handles a single-node (flat) organization, preserving whatever kind that node actually has", () => {
    expect(toOrganizationPathSegments([orgUnit({ id: "hr", name: "Human Resources", kind: "BUSINESS_UNIT" })])).toEqual([
      { id: "hr", name: "Human Resources", kind: "BUSINESS_UNIT" },
    ]);
  });

  it("handles no placement at all", () => {
    expect(toOrganizationPathSegments([])).toEqual([]);
  });
});
