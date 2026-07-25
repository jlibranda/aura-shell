import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaAssignmentUnitOfWork } from "@/platform/organization/prisma-assignment-unit-of-work";
import { PrismaAssignmentReadRepository } from "@/platform/organization/prisma-assignment-read-repository";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { AssignmentService } from "@/platform/organization/assignment-service";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { PermissionSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (assignment + audit + outbox commit together), the
 * DB-level guards (self-manager CHECK, valid-window CHECK, the GIST exclusion
 * constraint preventing two overlapping primary assignments, the composite
 * tenant-scoped foreign keys), and real tenant-isolated queries.
 */
describe("assignment platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-7b2-${randomUUID()}`;
  const tenantB = `test-tenant-7b2-${randomUUID()}`;

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.orgUnit.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.legalEntity.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.employee.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  });

  async function seedTenant(tenantId: string) {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  }

  async function seedEmployee(tenantId: string, employeeId: string) {
    await prisma.employee.create({
      data: {
        tenantId, employeeId, employeeNumber: `E-${employeeId}`, displayName: "A A", firstName: "A", lastName: "A",
        dateOfBirth: new Date("2000-01-01"), gender: "M", maritalStatus: "single", nationality: "PH",
        workEmail: `${employeeId}@x.com`, mobileNumber: "1", homeAddress: "addr",
        departmentId: "dept", position: "role", employmentType: "FULL_TIME", hireDate: new Date("2020-01-01"), workLocation: "remote",
      },
    });
  }

  async function seedLegalEntity(tenantId: string): Promise<string> {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const entity = await prisma.legalEntity.create({ data: { tenantId, code: `LE-${suffix}`, legalName: "Test Legal Entity", countryCode: "PH", createdBy: "tester" } });
    return entity.id;
  }

  async function seedOrgUnit(tenantId: string, id: string, code: string) {
    const legalEntityId = await seedLegalEntity(tenantId);
    return prisma.orgUnit.create({ data: { id, tenantId, legalEntityId, code, name: code, kind: "TEAM", createdBy: "tester" } });
  }

  function request(tenantId: string) {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles: ["hr_admin"],
      permissions: ["organization.view", "organization.manage"],
      actorProvenance: "server_verified",
      correlationId: "corr-1",
    });
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermissionSet(["organization.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  it("commits the assignment, audit record, and outbox message atomically on assignPrimary", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const orgUnit = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const service = new AssignmentService(new PrismaAssignmentUnitOfWork(prisma, events, audit));

    const result = await service.assignPrimary(request(tenantA), { personId, orgUnitId: orgUnit.id, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const dbAssignment = await prisma.assignment.findUniqueOrThrow({ where: { id: result.value.assignment.id } });
    expect(dbAssignment.personId).toBe(personId);
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: result.value.assignment.id, eventName: "organization.assignment.assigned" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: result.value.assignment.id, eventName: "organization.assignment.assigned" } });
    expect(dbOutbox).not.toBeNull();
    expect(dbOutbox?.tenantId).toBe(tenantA);
  });

  it("the database rejects a self-manager and an invalid window (DB-level guards)", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const orgUnit = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    await expect(prisma.assignment.create({
      data: { tenantId: tenantA, personId, legalEntityId: orgUnit.legalEntityId, orgUnitId: orgUnit.id, managerId: personId, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();

    await expect(prisma.assignment.create({
      data: { tenantId: tenantA, personId, legalEntityId: orgUnit.legalEntityId, orgUnitId: orgUnit.id, effectiveFrom: new Date("2026-06-01"), effectiveUntil: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("the database's GIST exclusion constraint rejects two overlapping primary assignments for the same person", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const orgUnit = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    await prisma.assignment.create({ data: { tenantId: tenantA, personId, legalEntityId: orgUnit.legalEntityId, orgUnitId: orgUnit.id, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" } });
    await expect(prisma.assignment.create({
      data: { tenantId: tenantA, personId, legalEntityId: orgUnit.legalEntityId, orgUnitId: orgUnit.id, effectiveFrom: new Date("2026-06-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("performs a real transfer: ends the current placement and opens a new one in one transaction", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    const managerId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    await seedEmployee(tenantA, managerId);
    const orgUnitA = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());
    const orgUnitB = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    const service = new AssignmentService(new PrismaAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const first = await service.assignPrimary(request(tenantA), { personId, orgUnitId: orgUnitA.id, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    if (first.kind !== "success") throw new Error("seed assignment failed");

    const transferred = await service.transfer(request(tenantA), { personId, orgUnitId: orgUnitB.id, managerId, effectiveFrom: "2026-06-01T00:00:00.000Z" });
    expect(transferred.kind).toBe("success");
    if (transferred.kind !== "success") return;
    expect(transferred.value.previous.id).toBe(first.value.assignment.id);

    const reader = new PrismaAssignmentReadRepository(prisma);
    const current = await reader.getCurrentForPerson(readContext(tenantA), personId);
    expect(current?.orgUnitId).toBe(orgUnitB.id);
    expect(current?.managerId).toBe(managerId);
    const history = await reader.listHistoryForPerson(readContext(tenantA), personId);
    expect(history).toHaveLength(2);
    expect(history[0].effectiveUntil).not.toBeUndefined();
  });

  it("keeps assignments strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const orgUnit = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    const service = new AssignmentService(new PrismaAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const created = await service.assignPrimary(request(tenantA), { personId, orgUnitId: orgUnit.id, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    if (created.kind !== "success") throw new Error("create failed");

    const reader = new PrismaAssignmentReadRepository(prisma);
    expect(await reader.getCurrentForPerson(readContext(tenantA), personId)).toBeDefined();
    expect(await reader.getCurrentForPerson(readContext(tenantB), personId)).toBeUndefined();
  });

  it("rejects a cross-tenant org unit reference at the database (composite tenant-scoped foreign key)", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const foreignOrgUnit = await seedOrgUnit(tenantB, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    await expect(prisma.assignment.create({
      data: { tenantId: tenantA, personId, legalEntityId: foreignOrgUnit.legalEntityId, orgUnitId: foreignOrgUnit.id, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("listCurrentByManager returns only that manager's currently open direct reports (Epic 7B.4)", async () => {
    await seedTenant(tenantA);
    const managerId = `emp-${randomUUID().slice(0, 8)}`;
    const currentReportId = `emp-${randomUUID().slice(0, 8)}`;
    const formerReportId = `emp-${randomUUID().slice(0, 8)}`;
    const unrelatedManagerId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, managerId);
    await seedEmployee(tenantA, currentReportId);
    await seedEmployee(tenantA, formerReportId);
    await seedEmployee(tenantA, unrelatedManagerId);
    const orgUnit = await seedOrgUnit(tenantA, randomUUID(), `OU-${randomUUID().slice(0, 8)}`.toUpperCase());

    const service = new AssignmentService(new PrismaAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const current = await service.assignPrimary(request(tenantA), { personId: currentReportId, orgUnitId: orgUnit.id, managerId, effectiveFrom: "2026-01-01T00:00:00.000Z" });
    if (current.kind !== "success") throw new Error("seed failed");

    // A former report whose assignment to this manager has since ended must not appear.
    const former = await service.assignPrimary(request(tenantA), { personId: formerReportId, orgUnitId: orgUnit.id, managerId, effectiveFrom: "2025-01-01T00:00:00.000Z" });
    if (former.kind !== "success") throw new Error("seed failed");
    await service.endAssignment(request(tenantA), { personId: formerReportId, effectiveUntil: "2025-06-01T00:00:00.000Z" });

    const reader = new PrismaAssignmentReadRepository(prisma);
    const reports = await reader.listCurrentByManager(readContext(tenantA), managerId);
    expect(reports.map((a) => a.personId)).toEqual([currentReportId]);
    expect(await reader.listCurrentByManager(readContext(tenantA), unrelatedManagerId)).toHaveLength(0);
  });
});
