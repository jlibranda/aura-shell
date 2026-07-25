import { describe, expect, it } from "vitest";
import { toEmploymentHistoryRows, toEmploymentPickerOptions, toOrganizationPathSegments } from "@/platform/people/profile-employment-actions-loader";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { LocationRecord } from "@/platform/organization/location";

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "t1", personId: "p1", legalEntityId: "le1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function orgUnit(overrides: Partial<OrgUnitRecord> = {}): OrgUnitRecord {
  return Object.freeze({
    id: "ou1", tenantId: "t1", legalEntityId: "le1", code: "OU1", name: "Finance", kind: "DEPARTMENT", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function location(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return Object.freeze({
    id: "loc1", tenantId: "t1", code: "LOC1", name: "Manila HQ",
    address: { line1: "1 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila", status: "ACTIVE",
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

describe("toEmploymentHistoryRows — location history", () => {
  const orgUnitNames = new Map([["ou1", "Finance"]]);
  const employeeNames = new Map<string, string>();
  const locationNames = new Map([["loc-makati", "Makati Office"], ["loc-manila", "Manila HQ"]]);

  it("shows the location on a row that has one, with no change note on the very first placement", () => {
    const rows = toEmploymentHistoryRows([assignment({ locationId: "loc-makati" })], orgUnitNames, employeeNames, locationNames);
    expect(rows[0].locationName).toBe("Makati Office");
    expect(rows[0].locationChangedFrom).toBeUndefined();
  });

  it("marks a later placement's location as changed, naming the immediately preceding location — effective-dated, most recent first", () => {
    const rows = toEmploymentHistoryRows(
      [
        assignment({ id: "a1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-07-25T00:00:00.000Z", locationId: "loc-makati" }),
        assignment({ id: "a2", effectiveFrom: "2026-07-25T00:00:00.000Z", locationId: "loc-manila" }),
      ],
      orgUnitNames,
      employeeNames,
      locationNames,
    );
    // Most recent first.
    expect(rows.map((r) => r.assignmentId)).toEqual(["a2", "a1"]);
    const [latest, earliest] = rows;
    expect(latest.locationName).toBe("Manila HQ");
    expect(latest.locationChangedFrom).toBe("Makati Office");
    expect(latest.effectiveFrom).toBe("2026-07-25T00:00:00.000Z");
    expect(earliest.locationName).toBe("Makati Office");
    expect(earliest.locationChangedFrom).toBeUndefined();
  });

  it("does not mark a change when the location stayed the same across a transfer (e.g. org-unit-only change)", () => {
    const rows = toEmploymentHistoryRows(
      [
        assignment({ id: "a1", orgUnitId: "ou1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z", locationId: "loc-makati" }),
        assignment({ id: "a2", orgUnitId: "ou2", effectiveFrom: "2026-06-01T00:00:00.000Z", locationId: "loc-makati" }),
      ],
      new Map([["ou1", "Finance"], ["ou2", "Engineering"]]),
      employeeNames,
      locationNames,
    );
    const latest = rows.find((r) => r.assignmentId === "a2")!;
    expect(latest.locationName).toBe("Makati Office");
    expect(latest.locationChangedFrom).toBeUndefined();
  });

  it("omits locationName entirely for a placement with no location, and does not crash across placements with mixed presence", () => {
    const rows = toEmploymentHistoryRows(
      [
        assignment({ id: "a1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
        assignment({ id: "a2", effectiveFrom: "2026-06-01T00:00:00.000Z", locationId: "loc-manila" }),
      ],
      orgUnitNames,
      employeeNames,
      locationNames,
    );
    expect(rows.find((r) => r.assignmentId === "a1")?.locationName).toBeUndefined();
    const latest = rows.find((r) => r.assignmentId === "a2")!;
    expect(latest.locationName).toBe("Manila HQ");
    // The prior placement had no location at all, so there's nothing to name as "changed from".
    expect(latest.locationChangedFrom).toBeUndefined();
  });

  it("falls back to the raw id when a location can't be resolved (defensive against orphaned data)", () => {
    const rows = toEmploymentHistoryRows([assignment({ locationId: "ghost-loc" })], orgUnitNames, employeeNames, locationNames);
    expect(rows[0].locationName).toBe("ghost-loc");
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

  it("includes only ACTIVE locations in the Change Location picker, sourced from Location master data", () => {
    const { locationOptions } = toEmploymentPickerOptions([], [], "p1", [
      location({ id: "loc1", status: "ACTIVE" }),
      location({ id: "loc2", status: "ARCHIVED" }),
    ]);
    expect(locationOptions.map((option) => option.id)).toEqual(["loc1"]);
  });

  it("labels location options with name and code, matching the org unit / manager picker convention", () => {
    const { locationOptions } = toEmploymentPickerOptions([], [], "p1", [location({ id: "loc1", name: "Manila HQ", code: "MNL" })]);
    expect(locationOptions).toEqual([{ id: "loc1", label: "Manila HQ (MNL)" }]);
  });

  it("defaults to no location options when none are supplied", () => {
    const { locationOptions } = toEmploymentPickerOptions([], [], "p1");
    expect(locationOptions).toEqual([]);
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
