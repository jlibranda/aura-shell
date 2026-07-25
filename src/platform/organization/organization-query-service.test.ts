import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/platform/context";
import { PermissionSet } from "@/platform/context";
import { AssignmentStore, InMemoryAssignmentReadRepository } from "@/platform/organization/in-memory-assignment-repository";
import { OrgUnitStore, InMemoryOrgUnitReadRepository } from "@/platform/organization/in-memory-org-unit-repository";
import { LocationStore, InMemoryLocationReadRepository } from "@/platform/organization/in-memory-location-repository";
import { OrganizationQueryService } from "@/platform/organization/organization-query-service";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { LocationRecord } from "@/platform/organization/location";

function context(tenantId = "tenant-a"): TenantContext {
  return { tenantId, actorId: "u", actorName: "U", roles: ["hr_admin"], permissions: new PermissionSet(["organization.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
}

function orgUnit(overrides: Partial<OrgUnitRecord> = {}): OrgUnitRecord {
  return Object.freeze({
    id: "ou1", tenantId: "tenant-a", legalEntityId: "le1", code: "OU1", name: "Unit", kind: "TEAM", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "tenant-a", personId: "p1", legalEntityId: "le1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function harness() {
  const assignmentStore = new AssignmentStore();
  const orgUnitStore = new OrgUnitStore();
  const locationStore = new LocationStore();
  const service = new OrganizationQueryService(
    new InMemoryAssignmentReadRepository(assignmentStore),
    new InMemoryOrgUnitReadRepository(orgUnitStore),
    new InMemoryLocationReadRepository(locationStore),
  );
  return { service, assignmentStore, orgUnitStore, locationStore };
}

describe("OrganizationQueryService — assignment resolution", () => {
  it("resolveCurrentAssignment returns the open primary assignment", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(assignment());
    const result = await service.resolveCurrentAssignment(context(), "p1");
    expect(result?.id).toBe("a1");
  });

  it("resolveCurrentAssignment returns undefined when the person has none", async () => {
    const { service } = harness();
    expect(await service.resolveCurrentAssignment(context(), "ghost")).toBeUndefined();
  });

  it("resolveAssignmentAsOf resolves the placement in force at a past instant from full history", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(
      assignment({ id: "a1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
      assignment({ id: "a2", effectiveFrom: "2026-06-01T00:00:00.000Z" }),
    );
    expect((await service.resolveAssignmentAsOf(context(), "p1", new Date("2026-03-01T00:00:00.000Z")))?.id).toBe("a1");
    expect((await service.resolveAssignmentAsOf(context(), "p1", new Date("2026-07-01T00:00:00.000Z")))?.id).toBe("a2");
  });

  it("resolveAssignmentHistory returns the full history, ascending", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(
      assignment({ id: "a2", effectiveFrom: "2026-06-01T00:00:00.000Z" }),
      assignment({ id: "a1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
    );
    const history = await service.resolveAssignmentHistory(context(), "p1");
    expect(history.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});

describe("OrganizationQueryService — manager and reports", () => {
  it("resolveManager returns the current manager's person id", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(assignment({ managerId: "mgr-1" }));
    expect(await service.resolveManager(context(), "p1")).toBe("mgr-1");
  });

  it("resolveManager returns undefined when there is no current assignment or no manager", async () => {
    const { service, assignmentStore } = harness();
    expect(await service.resolveManager(context(), "ghost")).toBeUndefined();
    assignmentStore.assignments.push(assignment({ id: "a2", personId: "p2" }));
    expect(await service.resolveManager(context(), "p2")).toBeUndefined();
  });

  it("resolveReports returns every current report for a manager", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(
      assignment({ id: "a1", personId: "p1", managerId: "mgr-1" }),
      assignment({ id: "a2", personId: "p2", managerId: "mgr-1" }),
      assignment({ id: "a3", personId: "p3", managerId: "mgr-2" }),
    );
    const reports = await service.resolveReports(context(), "mgr-1");
    expect(reports.map((a) => a.personId).sort()).toEqual(["p1", "p2"]);
  });

  it("resolveReports excludes ended assignments", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(assignment({ id: "a1", personId: "p1", managerId: "mgr-1", effectiveUntil: "2026-06-01T00:00:00.000Z" }));
    expect(await service.resolveReports(context(), "mgr-1")).toHaveLength(0);
  });
});

describe("OrganizationQueryService — current placement", () => {
  it("resolves the assignment together with its OrgUnit", async () => {
    const { service, assignmentStore, orgUnitStore } = harness();
    orgUnitStore.units.push(orgUnit({ id: "ou1", name: "Finance" }));
    assignmentStore.assignments.push(assignment({ orgUnitId: "ou1" }));
    const placement = await service.resolveCurrentPlacement(context(), "p1");
    expect(placement?.orgUnit.name).toBe("Finance");
    expect(placement?.assignment.id).toBe("a1");
  });

  it("returns undefined when the person has no current assignment", async () => {
    const { service } = harness();
    expect(await service.resolveCurrentPlacement(context(), "ghost")).toBeUndefined();
  });

  it("returns undefined when the assigned OrgUnit no longer resolves (defensive against orphaned data)", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(assignment({ orgUnitId: "missing-ou" }));
    expect(await service.resolveCurrentPlacement(context(), "p1")).toBeUndefined();
  });
});

describe("OrganizationQueryService — current assignments (Epic 7B.5 admin list)", () => {
  it("resolveCurrentAssignments returns every currently open primary assignment for the tenant", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(
      assignment({ id: "a1", personId: "p1" }),
      assignment({ id: "a2", personId: "p2" }),
      assignment({ id: "a3", personId: "p3", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
    );
    const current = await service.resolveCurrentAssignments(context());
    expect(current.map((a) => a.personId).sort()).toEqual(["p1", "p2"]);
  });

  it("resolveCurrentAssignments never returns another tenant's assignments", async () => {
    const { service, assignmentStore } = harness();
    assignmentStore.assignments.push(assignment({ tenantId: "tenant-a", personId: "p1" }));
    expect(await service.resolveCurrentAssignments(context("tenant-b"))).toEqual([]);
  });
});

describe("OrganizationQueryService — hierarchy queries", () => {
  function seedTree(orgUnitStore: OrgUnitStore) {
    orgUnitStore.units.push(
      orgUnit({ id: "root", name: "Root", code: "ROOT" }),
      orgUnit({ id: "a", name: "A", code: "A", parentId: "root" }),
      orgUnit({ id: "b", name: "B", code: "B", parentId: "a" }),
      orgUnit({ id: "c", name: "C", code: "C", parentId: "a" }),
      orgUnit({ id: "sibling", name: "Sibling", code: "SIB", parentId: "root" }),
    );
  }

  it("resolveOrgPath returns the ancestor chain from root to the given unit, inclusive", async () => {
    const { service, orgUnitStore } = harness();
    seedTree(orgUnitStore);
    const path = await service.resolveOrgPath(context(), "b");
    expect(path.map((u) => u.id)).toEqual(["root", "a", "b"]);
  });

  it("resolveOrgPath for a root unit returns just that unit", async () => {
    const { service, orgUnitStore } = harness();
    seedTree(orgUnitStore);
    expect((await service.resolveOrgPath(context(), "root")).map((u) => u.id)).toEqual(["root"]);
  });

  it("resolveOrgPath for a missing unit returns an empty path", async () => {
    const { service } = harness();
    expect(await service.resolveOrgPath(context(), "ghost")).toEqual([]);
  });

  it("resolveDescendants returns every unit strictly below the given unit", async () => {
    const { service, orgUnitStore } = harness();
    seedTree(orgUnitStore);
    const descendants = await service.resolveDescendants(context(), "a");
    expect(descendants.map((u) => u.id).sort()).toEqual(["b", "c"]);
  });

  it("resolveDescendants excludes siblings and the unit itself", async () => {
    const { service, orgUnitStore } = harness();
    seedTree(orgUnitStore);
    const descendants = await service.resolveDescendants(context(), "root");
    expect(descendants.map((u) => u.id).sort()).toEqual(["a", "b", "c", "sibling"]);
  });

  it("resolveOrgUnitsByKind returns only units of the requested kind", async () => {
    const { service, orgUnitStore } = harness();
    orgUnitStore.units.push(
      orgUnit({ id: "d1", code: "D1", kind: "DEPARTMENT" }),
      orgUnit({ id: "d2", code: "D2", kind: "DEPARTMENT" }),
      orgUnit({ id: "t1", code: "T1", kind: "TEAM", parentId: "d1" }),
    );
    const departments = await service.resolveOrgUnitsByKind(context(), "DEPARTMENT");
    expect(departments.map((u) => u.id).sort()).toEqual(["d1", "d2"]);
    const teams = await service.resolveOrgUnitsByKind(context(), "TEAM");
    expect(teams.map((u) => u.id)).toEqual(["t1"]);
  });
});

describe("OrganizationQueryService — location lookup (standalone, not linked to Assignment)", () => {
  function location(overrides: Partial<LocationRecord> = {}): LocationRecord {
    return Object.freeze({
      id: "loc1", tenantId: "tenant-a", code: "HQ", name: "Head Office",
      address: { line1: "123 Ayala Ave", city: "Makati" }, countryCode: "PH", timezone: "Asia/Manila",
      status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });
  }

  it("resolveLocationById and resolveLocationByCode resolve independently of any Assignment", async () => {
    const { service, locationStore } = harness();
    locationStore.locations.push(location());
    expect((await service.resolveLocationById(context(), "loc1"))?.code).toBe("HQ");
    expect((await service.resolveLocationByCode(context(), "HQ"))?.id).toBe("loc1");
  });
});

describe("OrganizationQueryService — tenant isolation", () => {
  it("never returns another tenant's assignment, org unit, or location", async () => {
    const { service, assignmentStore, orgUnitStore, locationStore } = harness();
    assignmentStore.assignments.push(assignment({ tenantId: "tenant-a", personId: "shared-id" }));
    orgUnitStore.units.push(orgUnit({ id: "shared-id", tenantId: "tenant-a" }));
    locationStore.locations.push(Object.freeze({
      id: "shared-id", tenantId: "tenant-a", code: "HQ", name: "HQ", address: { line1: "x", city: "y" },
      countryCode: "PH", timezone: "Asia/Manila", status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    const asB = context("tenant-b");
    expect(await service.resolveCurrentAssignment(asB, "shared-id")).toBeUndefined();
    expect(await service.resolveOrgPath(asB, "shared-id")).toEqual([]);
    expect(await service.resolveLocationById(asB, "shared-id")).toBeUndefined();
  });
});
