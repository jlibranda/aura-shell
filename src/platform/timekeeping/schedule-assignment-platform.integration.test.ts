import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import { PrismaScheduleAssignmentUnitOfWork } from "@/platform/timekeeping/prisma-schedule-assignment-unit-of-work";
import { PrismaScheduleAssignmentReadRepository } from "@/platform/timekeeping/prisma-schedule-assignment-read-repository";
import { ScheduleAssignmentService } from "@/platform/timekeeping/schedule-assignment-service";
import type { PermissionSet } from "@/platform/context";
import { PermissionSet as PermSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (assignment + audit + outbox commit together), the
 * DB-level GIST exclusion constraint (scoped to non-cancelled rows), the
 * CHECK for a non-empty window, the composite tenant/work-schedule/version
 * foreign key, cross-tenant rejection, and — the genuinely new risk this
 * slice introduces (Slice 4 Decision 9) — that the Organization Assignment
 * as-of read really executes inside the same Prisma transaction as the
 * ScheduleAssignment write, against real data, not a stub.
 */
describe("schedule assignment platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-tk4-${randomUUID()}`;
  const tenantB = `test-tenant-tk4-${randomUUID()}`;

  afterAll(async () => {
    await prisma.scheduleAssignment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.workScheduleVersion.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.workSchedule.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
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

  /** Seeds a real Organization Assignment placement window for a person — the row PrismaOrganizationAssignmentAsOfRepository reads directly. */
  async function seedOrganizationAssignment(tenantId: string, personId: string, effectiveFrom: string, effectiveUntil?: string) {
    const legalEntity = await prisma.legalEntity.create({ data: { tenantId, code: `LE-${randomUUID().slice(0, 8)}`.toUpperCase(), legalName: "Test Legal Entity", countryCode: "PH", createdBy: "tester" } });
    const orgUnit = await prisma.orgUnit.create({ data: { tenantId, legalEntityId: legalEntity.id, code: `OU-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "Unit", kind: "TEAM", createdBy: "tester" } });
    await prisma.assignment.create({
      data: {
        tenantId, personId, legalEntityId: legalEntity.id, orgUnitId: orgUnit.id, isPrimary: true,
        effectiveFrom: new Date(effectiveFrom), effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null, createdBy: "tester",
      },
    });
  }

  const weeklyPattern = {
    MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [] }],
    TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [],
  };

  async function seedActiveWorkScheduleVersion(tenantId: string) {
    const schedule = await prisma.workSchedule.create({ data: { tenantId, code: `WS-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "Standard", createdBy: "tester" } });
    const version = await prisma.workScheduleVersion.create({
      data: {
        tenantId, workScheduleId: schedule.id, versionNumber: 1, status: "ACTIVE", scheduleType: "FIXED_WEEKLY",
        timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: `h-${randomUUID()}`, createdBy: "tester", activatedAt: new Date(),
      },
    });
    return { schedule, version };
  }

  function request(tenantId: string): TrustedRequestContext {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles: ["hr_admin"],
      permissions: ["timekeeping.view", "timekeeping.manage"],
      actorProvenance: "server_verified",
    });
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermSet(["timekeeping.view"]) as PermissionSet, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  it("commits the schedule assignment, audit record, and outbox message atomically", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    await seedOrganizationAssignment(tenantA, personId, "2020-01-01T00:00:00.000Z");
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);

    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const service = new ScheduleAssignmentService(new PrismaScheduleAssignmentUnitOfWork(prisma, events, audit));
    const result = await service.assignSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");

    const id = result.kind === "success" ? result.value.assignment.id : "";
    const dbRow = await prisma.scheduleAssignment.findUniqueOrThrow({ where: { id } });
    expect(dbRow.workScheduleVersionId).toBe(version.id);
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: id, eventName: "timekeeping.schedule_assignment.created" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: id, eventName: "timekeeping.schedule_assignment.created" } });
    expect(dbOutbox).not.toBeNull();
  });

  it("resolves the Organization Assignment as-of check against real data inside the same transaction as the write (Slice 4 Decision 9)", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    // The real placement only starts in 2030 — an assignment effective in 2026 must be rejected.
    await seedOrganizationAssignment(tenantA, personId, "2030-01-01T00:00:00.000Z");
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);

    const service = new ScheduleAssignmentService(new PrismaScheduleAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const tooEarly = await service.assignSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: "2026-01-01" });
    expect(tooEarly.kind).toBe("validation_failure");

    const afterPlacementStarts = await service.assignSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: "2031-01-01" });
    expect(afterPlacementStarts.kind).toBe("success");
  });

  it("the database's exclusion constraint rejects a second overlapping non-cancelled assignment for the same person", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);
    await prisma.scheduleAssignment.create({ data: { tenantId: tenantA, personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" } });
    await expect(prisma.scheduleAssignment.create({
      data: { tenantId: tenantA, personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2026-06-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("the database's exclusion constraint allows an overlapping window once the earlier row is cancelled (Slice 4 Decision 6/7)", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);
    const first = await prisma.scheduleAssignment.create({ data: { tenantId: tenantA, personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2099-01-01"), createdBy: "tester" } });
    await prisma.scheduleAssignment.update({ where: { id: first.id }, data: { cancelledAt: new Date(), cancelledBy: "tester" } });
    await expect(prisma.scheduleAssignment.create({
      data: { tenantId: tenantA, personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2099-01-01"), createdBy: "tester" },
    })).resolves.toBeDefined();
  });

  it("the database's CHECK constraint rejects a non-empty window violation (effective_until <= effective_from)", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);
    await expect(prisma.scheduleAssignment.create({
      data: { tenantId: tenantA, personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2026-06-01"), effectiveUntil: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("the database rejects a workScheduleVersionId that does not belong to the given workScheduleId (composite FK)", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const { schedule: scheduleA } = await seedActiveWorkScheduleVersion(tenantA);
    const { version: versionB } = await seedActiveWorkScheduleVersion(tenantA);
    await expect(prisma.scheduleAssignment.create({
      data: { tenantId: tenantA, personId, workScheduleId: scheduleA.id, workScheduleVersionId: versionB.id, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("rejects a cross-tenant person reference at the database (composite tenant-scoped foreign key)", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personInB = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantB, personInB);
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);
    await expect(prisma.scheduleAssignment.create({
      data: { tenantId: tenantA, personId: personInB, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: new Date("2026-01-01"), createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("performs a real transfer: ends the current assignment and opens a new one in one transaction, forming adjacent windows", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    await seedOrganizationAssignment(tenantA, personId, "2020-01-01T00:00:00.000Z");
    const { schedule, version: version1 } = await seedActiveWorkScheduleVersion(tenantA);

    const service = new ScheduleAssignmentService(new PrismaScheduleAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const first = await service.assignSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version1.id, effectiveFrom: "2026-01-01" });
    expect(first.kind).toBe("success");

    const version2 = await prisma.workScheduleVersion.create({
      data: { tenantId: tenantA, workScheduleId: schedule.id, versionNumber: 2, status: "DRAFT", scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: `h-${randomUUID()}`, createdBy: "tester" },
    });
    // A DRAFT version cannot be newly assigned, so promote it the same way Slice 3's activateVersion does — direct row update, no need for the full WorkScheduleService here. Retire before activate: the partial unique index allows only one ACTIVE row per schedule at a time. version1 remains valid on the existing assignment even after being retired (Slice 4 Decision 4).
    await prisma.workScheduleVersion.update({ where: { id: version1.id }, data: { status: "RETIRED", retiredAt: new Date() } });
    await prisma.workScheduleVersion.update({ where: { id: version2.id }, data: { status: "ACTIVE", activatedAt: new Date() } });

    const transferred = await service.transferSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version2.id, effectiveFrom: "2026-06-01" });
    expect(transferred.kind).toBe("success");
    if (transferred.kind === "success") {
      expect(transferred.value.previous.effectiveUntil).toBe(transferred.value.assignment.effectiveFrom);
    }

    const reader = new PrismaScheduleAssignmentReadRepository(prisma);
    const current = await reader.findCurrentAssignment(readContext(tenantA), personId);
    expect(current?.workScheduleVersionId).toBe(version2.id);
    const history = await reader.listAssignmentsForPerson(readContext(tenantA), personId);
    expect(history).toHaveLength(2);
  });

  it("keeps schedule assignments strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    await seedOrganizationAssignment(tenantA, personId, "2020-01-01T00:00:00.000Z");
    const { schedule, version } = await seedActiveWorkScheduleVersion(tenantA);

    const service = new ScheduleAssignmentService(new PrismaScheduleAssignmentUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    await service.assignSchedule(request(tenantA), { personId, workScheduleId: schedule.id, workScheduleVersionId: version.id, effectiveFrom: "2026-01-01" });

    const reader = new PrismaScheduleAssignmentReadRepository(prisma);
    expect(await reader.findCurrentAssignment(readContext(tenantA), personId)).toBeDefined();
    expect(await reader.findCurrentAssignment(readContext(tenantB), personId)).toBeUndefined();
  });
});
