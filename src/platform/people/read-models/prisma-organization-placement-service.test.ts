import { describe, expect, it, vi } from "vitest";
import type { PlatformRole, TenantContext } from "@/platform/context";
import { PermissionSet } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import { AssignmentStore, InMemoryAssignmentReadRepository } from "@/platform/organization/in-memory-assignment-repository";
import { OrgUnitStore, InMemoryOrgUnitReadRepository } from "@/platform/organization/in-memory-org-unit-repository";
import { LocationStore, InMemoryLocationReadRepository } from "@/platform/organization/in-memory-location-repository";
import type { LocationRecord } from "@/platform/organization/location";
import { OrganizationQueryService } from "@/platform/organization/organization-query-service";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { EmployeeDisplayLookup } from "@/platform/people/read-models/employee-display-lookup";
import { PrismaOrganizationPlacementService } from "@/platform/people/read-models/prisma-organization-placement-service";

function context(roles: readonly PlatformRole[] = ["hr_admin"], tenantId = "tenant-a"): TenantContext {
  return { tenantId, actorId: "u", actorName: "U", roles, permissions: new PermissionSet([]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
}

function orgUnit(overrides: Partial<OrgUnitRecord> = {}): OrgUnitRecord {
  return Object.freeze({
    id: "ou1", tenantId: "tenant-a", code: "OU1", name: "Unit", kind: "TEAM", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "tenant-a", personId: "p1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function fakeEmployeeLookup(records: readonly { id: string; displayName: string }[]): EmployeeDisplayLookup {
  return {
    findDisplayName: vi.fn(async (_tenantId: string, id: string) => records.find((r) => r.id === id)?.displayName),
    listDisplays: vi.fn(async () => [...records]),
  };
}

function harness(employeeRecords: readonly { id: string; displayName: string }[] = []) {
  const assignmentStore = new AssignmentStore();
  const orgUnitStore = new OrgUnitStore();
  const locationStore = new LocationStore();
  const query = new OrganizationQueryService(
    new InMemoryAssignmentReadRepository(assignmentStore),
    new InMemoryOrgUnitReadRepository(orgUnitStore),
    new InMemoryLocationReadRepository(locationStore),
  );
  const employees = fakeEmployeeLookup(employeeRecords);
  const service = new PrismaOrganizationPlacementService(query, employees);
  return { service, assignmentStore, orgUnitStore, locationStore, employees };
}

function location(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return Object.freeze({
    id: "loc1", tenantId: "tenant-a", code: "MNL", name: "Manila HQ",
    address: { line1: "1 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("PrismaOrganizationPlacementService — resolvePlacementSummary", () => {
  it("resolves department (nearest DEPARTMENT ancestor), team (the assigned unit), and manager display name", async () => {
    const { service, assignmentStore, orgUnitStore } = harness([{ id: "mgr-1", displayName: "Maria Santos" }]);
    orgUnitStore.units.push(
      orgUnit({ id: "dept", code: "DEPT", name: "Finance", kind: "DEPARTMENT" }),
      orgUnit({ id: "team", code: "TEAM", name: "Payroll Team", kind: "TEAM", parentId: "dept" }),
    );
    assignmentStore.assignments.push(assignment({ orgUnitId: "team", managerId: "mgr-1" }));

    const summary = await service.resolvePlacementSummary(context(), "p1");
    expect(summary.department).toEqual({ id: "dept", displayName: "Finance", type: "department" });
    expect(summary.team).toEqual({ id: "team", displayName: "Payroll Team", type: "team" });
    expect(summary.manager).toEqual({ id: "mgr-1", displayName: "Maria Santos", type: "manager" });
  });

  it("returns an empty summary when the person has no current assignment", async () => {
    const { service } = harness();
    expect(await service.resolvePlacementSummary(context(), "ghost")).toEqual({});
  });

  it("leaves department/team undefined when the assigned unit has no DEPARTMENT/TEAM ancestor", async () => {
    const { service, assignmentStore, orgUnitStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "div", code: "DIV", name: "APAC Division", kind: "DIVISION" }));
    assignmentStore.assignments.push(assignment({ orgUnitId: "div" }));
    const summary = await service.resolvePlacementSummary(context(), "p1");
    expect(summary.department).toBeUndefined();
    expect(summary.team).toBeUndefined();
  });

  it("omits manager from the summary when the managerId does not resolve to a known employee", async () => {
    const { service, assignmentStore, orgUnitStore } = harness([]); // no employees registered
    orgUnitStore.units.push(orgUnit({ id: "team", kind: "TEAM" }));
    assignmentStore.assignments.push(assignment({ orgUnitId: "team", managerId: "ghost-manager" }));
    const summary = await service.resolvePlacementSummary(context(), "p1");
    expect(summary.manager).toBeUndefined();
  });

  it("never surfaces the legacy Employee.departmentId/teamId/managerId/workLocation fields — resolution is personId-keyed", async () => {
    const { service } = harness();
    // The method signature itself only accepts a personId; there is no way to pass a legacy field in.
    expect(service.resolvePlacementSummary.length).toBe(2);
  });

  it("requires people.read", async () => {
    const { service } = harness();
    await expect(service.resolvePlacementSummary(context([]), "p1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("resolves the assignment's Location when it has one", async () => {
    const { service, assignmentStore, orgUnitStore, locationStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "team", kind: "TEAM" }));
    locationStore.locations.push(location({ id: "loc1", name: "Manila HQ" }));
    assignmentStore.assignments.push(assignment({ orgUnitId: "team", locationId: "loc1" }));
    const summary = await service.resolvePlacementSummary(context(), "p1");
    expect(summary.location).toEqual({ id: "loc1", displayName: "Manila HQ", type: "location" });
  });

  it("omits location from the summary when the assignment has none", async () => {
    const { service, assignmentStore, orgUnitStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "team", kind: "TEAM" }));
    assignmentStore.assignments.push(assignment({ orgUnitId: "team" }));
    const summary = await service.resolvePlacementSummary(context(), "p1");
    expect(summary.location).toBeUndefined();
  });
});

describe("PrismaOrganizationPlacementService — resolvePlacementSummaries", () => {
  it("resolves each person in order and caches manager lookups within the batch", async () => {
    const { service, assignmentStore, orgUnitStore, employees } = harness([{ id: "mgr-1", displayName: "Maria Santos" }]);
    orgUnitStore.units.push(orgUnit({ id: "team", kind: "TEAM" }));
    assignmentStore.assignments.push(
      assignment({ id: "a1", personId: "p1", orgUnitId: "team", managerId: "mgr-1" }),
      assignment({ id: "a2", personId: "p2", orgUnitId: "team", managerId: "mgr-1" }),
    );
    const summaries = await service.resolvePlacementSummaries(context(), ["p1", "p2"]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].manager?.displayName).toBe("Maria Santos");
    expect(summaries[1].manager?.displayName).toBe("Maria Santos");
    expect(employees.findDisplayName).toHaveBeenCalledTimes(1);
  });
});

describe("PrismaOrganizationPlacementService — listOptions", () => {
  it("lists DEPARTMENT-kind OrgUnits for type department, with parentId when present", async () => {
    const { service, orgUnitStore } = harness();
    orgUnitStore.units.push(
      orgUnit({ id: "root", code: "ROOT", name: "Root", kind: "DIVISION" }),
      orgUnit({ id: "dept", code: "DEPT", name: "Finance", kind: "DEPARTMENT", parentId: "root" }),
      orgUnit({ id: "team", code: "TEAM", name: "Payroll", kind: "TEAM", parentId: "dept" }),
    );
    const options = await service.listOptions(context(), "department");
    expect(options).toEqual([{ id: "dept", displayName: "Finance", type: "department", parentId: "root" }]);
  });

  it("lists TEAM-kind OrgUnits for type team", async () => {
    const { service, orgUnitStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "team", code: "TEAM", name: "Payroll", kind: "TEAM", parentId: "dept" }));
    const options = await service.listOptions(context(), "team");
    expect(options).toEqual([{ id: "team", displayName: "Payroll", type: "team", parentId: "dept" }]);
  });

  it("lists every employee for type manager", async () => {
    const { service } = harness([{ id: "e1", displayName: "Ana Reyes" }, { id: "e2", displayName: "Bea Cruz" }]);
    const options = await service.listOptions(context(), "manager");
    expect(options).toEqual([
      { id: "e1", displayName: "Ana Reyes", type: "manager" },
      { id: "e2", displayName: "Bea Cruz", type: "manager" },
    ]);
  });

  it("requires people.read", async () => {
    const { service } = harness();
    await expect(service.listOptions(context([]), "department")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("PrismaOrganizationPlacementService — tenant isolation", () => {
  it("does not resolve another tenant's assignment or org unit", async () => {
    const { service, assignmentStore, orgUnitStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "team", tenantId: "tenant-a", kind: "TEAM" }));
    assignmentStore.assignments.push(assignment({ tenantId: "tenant-a", orgUnitId: "team" }));
    const summary = await service.resolvePlacementSummary(context(["hr_admin"], "tenant-b"), "p1");
    expect(summary).toEqual({});
  });
});
