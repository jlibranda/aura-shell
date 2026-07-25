import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { createTrustedRequestContext } from "@/platform/runtime-context";

/**
 * Real-Postgres coverage for Epic 7B.5's Settings > Organization admin
 * composition: createOrganizationAdminRuntime is exactly the runtime the
 * server actions and page loaders use, so this exercises the same code path
 * end to end — create an org unit and a location, assign an employee,
 * transfer them, end the placement, and confirm the new
 * listCurrentPrimary/resolveCurrentAssignments read method reflects it —
 * plus tenant isolation for the new OrganizationEmployeeDirectory.
 */
describe("organization admin runtime (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-7b5-${randomUUID()}`;
  const tenantB = `test-tenant-7b5-${randomUUID()}`;

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.location.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.orgUnit.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.employee.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  });

  async function seedTenant(tenantId: string) {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  }

  async function seedEmployee(tenantId: string, employeeId: string, displayName = "A A") {
    await prisma.employee.create({
      data: {
        tenantId, employeeId, employeeNumber: `E-${employeeId}`, displayName, firstName: "A", lastName: "A",
        dateOfBirth: new Date("2000-01-01"), gender: "M", maritalStatus: "single", nationality: "PH",
        workEmail: `${employeeId}@x.com`, mobileNumber: "1", homeAddress: "addr",
        departmentId: "dept", position: "role", employmentType: "FULL_TIME", hireDate: new Date("2020-01-01"), workLocation: "remote",
      },
    });
  }

  function request(tenantId: string) {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "admin-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles: ["hr_admin"],
      permissions: ["organization.view", "organization.manage"],
      actorProvenance: "server_verified",
      correlationId: "corr-1",
    });
  }

  it("drives org unit, location, and assignment creation through one runtime, and reflects it in the admin read surface", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    const managerId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId, "Jane Employee");
    await seedEmployee(tenantA, managerId, "Mary Manager");

    const runtime = createOrganizationAdminRuntime(request(tenantA));

    const unitCode = `FIN-${randomUUID().slice(0, 8)}`.toUpperCase();
    const unitResult = await runtime.orgUnits.service.createOrgUnit(request(tenantA), { code: unitCode, name: "Finance", kind: "DEPARTMENT" });
    expect(unitResult.kind).toBe("success");
    if (unitResult.kind !== "success") return;

    const locationResult = await runtime.locations.service.createLocation(request(tenantA), {
      code: `HQ-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Head Office",
      address: { line1: "123 Ayala Ave", city: "Makati" },
      countryCode: "PH",
      timezone: "Asia/Manila",
    });
    expect(locationResult.kind).toBe("success");

    const assignResult = await runtime.assignments.service.assignPrimary(request(tenantA), {
      personId, orgUnitId: unitResult.value.unit.id, managerId, effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(assignResult.kind).toBe("success");

    const current = await runtime.queries.resolveCurrentAssignments(runtime.context);
    expect(current.map((a) => a.personId)).toContain(personId);

    const employees = await runtime.employees.listAll(tenantA);
    expect(employees.map((e) => e.id).sort()).toEqual([managerId, personId].sort());

    const orgUnits = await runtime.orgUnits.read.listAll(runtime.context);
    expect(orgUnits.some((u) => u.code === unitCode)).toBe(true);
  });

  it("transfers and then ends an assignment; listCurrentPrimary reflects each state", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId, "Transfer Target");
    const runtime = createOrganizationAdminRuntime(request(tenantA));

    const unitA = await runtime.orgUnits.service.createOrgUnit(request(tenantA), { code: `A-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "Unit A", kind: "TEAM" });
    const unitB = await runtime.orgUnits.service.createOrgUnit(request(tenantA), { code: `B-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "Unit B", kind: "TEAM" });
    if (unitA.kind !== "success" || unitB.kind !== "success") throw new Error("seed org units failed");

    const assigned = await runtime.assignments.service.assignPrimary(request(tenantA), { personId, orgUnitId: unitA.value.unit.id, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    if (assigned.kind !== "success") throw new Error("seed assignment failed");

    const transferred = await runtime.assignments.service.transfer(request(tenantA), { personId, orgUnitId: unitB.value.unit.id, effectiveFrom: "2026-06-01T00:00:00.000Z" });
    expect(transferred.kind).toBe("success");

    let current = await runtime.queries.resolveCurrentAssignments(runtime.context);
    expect(current.find((a) => a.personId === personId)?.orgUnitId).toBe(unitB.value.unit.id);

    const ended = await runtime.assignments.service.endAssignment(request(tenantA), { personId, effectiveUntil: "2026-12-01T00:00:00.000Z" });
    expect(ended.kind).toBe("success");

    current = await runtime.queries.resolveCurrentAssignments(runtime.context);
    expect(current.some((a) => a.personId === personId)).toBe(false);
  });

  it("never returns another tenant's employees, org units, or current assignments", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId, "Tenant A Employee");

    const runtimeA = createOrganizationAdminRuntime(request(tenantA));
    const unit = await runtimeA.orgUnits.service.createOrgUnit(request(tenantA), { code: `IS-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "Isolated Unit", kind: "TEAM" });
    if (unit.kind !== "success") throw new Error("seed org unit failed");
    const assigned = await runtimeA.assignments.service.assignPrimary(request(tenantA), { personId, orgUnitId: unit.value.unit.id, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    if (assigned.kind !== "success") throw new Error("seed assignment failed");

    const runtimeB = createOrganizationAdminRuntime(request(tenantB));
    expect(await runtimeB.employees.listAll(tenantB)).toEqual([]);
    expect((await runtimeB.orgUnits.read.listAll(runtimeB.context)).some((u) => u.id === unit.value.unit.id)).toBe(false);
    expect(await runtimeB.queries.resolveCurrentAssignments(runtimeB.context)).toEqual([]);
  });
});
