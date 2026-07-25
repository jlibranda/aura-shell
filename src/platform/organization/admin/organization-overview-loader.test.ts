import { describe, expect, it } from "vitest";
import { computeOrganizationOverviewCounts } from "@/platform/organization/admin/organization-overview-loader";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { LocationRecord } from "@/platform/organization/location";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";
import type { AssignmentRecord } from "@/platform/organization/assignment";

function legalEntity(status: LegalEntityRecord["status"]): Pick<LegalEntityRecord, "status"> {
  return { status };
}
function orgUnit(status: OrgUnitRecord["status"]): Pick<OrgUnitRecord, "status"> {
  return { status };
}
function location(status: LocationRecord["status"]): Pick<LocationRecord, "status"> {
  return { status };
}

describe("computeOrganizationOverviewCounts", () => {
  it("splits legal entities, org units, and locations into active/archived", () => {
    const counts = computeOrganizationOverviewCounts(
      [legalEntity("ACTIVE"), legalEntity("ARCHIVED")],
      [orgUnit("ACTIVE"), orgUnit("ACTIVE"), orgUnit("ARCHIVED")],
      [location("ACTIVE"), location("ARCHIVED")],
      [],
      [],
    );
    expect(counts.activeLegalEntities).toBe(1);
    expect(counts.archivedLegalEntities).toBe(1);
    expect(counts.activeOrgUnits).toBe(2);
    expect(counts.archivedOrgUnits).toBe(1);
    expect(counts.activeLocations).toBe(1);
    expect(counts.archivedLocations).toBe(1);
  });

  it("splits employees into assigned/unassigned by whether they have a current primary assignment", () => {
    const counts = computeOrganizationOverviewCounts(
      [],
      [],
      [],
      [{ id: "e1", displayName: "A" }, { id: "e2", displayName: "B" }, { id: "e3", displayName: "C" }],
      [{ personId: "e1" } as Pick<AssignmentRecord, "personId">, { personId: "e3" } as Pick<AssignmentRecord, "personId">],
    );
    expect(counts.employeesWithAssignment).toBe(2);
    expect(counts.employeesWithoutAssignment).toBe(1);
  });

  it("reports zero unassigned when there are no employees at all", () => {
    const counts = computeOrganizationOverviewCounts([], [], [], [], []);
    expect(counts).toEqual({ activeLegalEntities: 0, archivedLegalEntities: 0, activeOrgUnits: 0, archivedOrgUnits: 0, activeLocations: 0, archivedLocations: 0, employeesWithAssignment: 0, employeesWithoutAssignment: 0 });
  });

  it("reports every employee as unassigned when no backfill has ever run (Epic 7B.5 Phase 1 finding)", () => {
    const counts = computeOrganizationOverviewCounts([], [], [], [{ id: "e1", displayName: "A" }, { id: "e2", displayName: "B" }], []);
    expect(counts.employeesWithAssignment).toBe(0);
    expect(counts.employeesWithoutAssignment).toBe(2);
  });
});
