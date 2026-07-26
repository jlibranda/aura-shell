import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { PermissionSet, type TenantContext } from "@/platform/context";
import { PrismaWorkScheduleUnitOfWork } from "@/platform/timekeeping/prisma-work-schedule-unit-of-work";
import { PrismaWorkScheduleReadRepository } from "@/platform/timekeeping/prisma-work-schedule-read-repository";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (schedule/version + audit + outbox commit
 * together), the DB-level unique constraints (tenant+code,
 * workScheduleId+versionNumber), the partial unique index enforcing at
 * most one ACTIVE version per schedule, the composite tenant-scoped
 * foreign key between work_schedule_versions and work_schedules, and real
 * tenant-isolated reads.
 */
describe("work schedule platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-tk3-${randomUUID()}`;
  const tenantB = `test-tenant-tk3-${randomUUID()}`;

  afterAll(async () => {
    await prisma.workScheduleVersion.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.workSchedule.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  });

  async function seedTenant(tenantId: string) {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  }

  function unitOfWorkContext(tenantId: string): UnitOfWorkContext {
    return { tenantId, correlationId: "corr-1", actorUserId: "user-1", requestId: "req-1", commandName: "CreateWorkSchedule" };
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermissionSet(["timekeeping.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  const weeklyPattern = {
    MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "12:00", end: "13:00" }] }],
    TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [],
  };

  it("commits the work schedule, audit record, and outbox message atomically", async () => {
    await seedTenant(tenantA);
    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const unitOfWork = new PrismaWorkScheduleUnitOfWork(prisma, events, audit);
    const code = `STD-${randomUUID().slice(0, 8)}`.toUpperCase();

    const schedule = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.workSchedules.create({ tenantId: tenantA, code, name: "Standard", createdBy: "user-1" }),
    );

    const dbSchedule = await prisma.workSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(dbSchedule.code).toBe(code);
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: schedule.id, eventName: "timekeeping.work_schedule.created" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: schedule.id, eventName: "timekeeping.work_schedule.created" } });
    expect(dbOutbox).not.toBeNull();
  });

  it("the database rejects a second schedule with the same (tenant_id, code) at the constraint level", async () => {
    await seedTenant(tenantA);
    const code = `DUP-${randomUUID().slice(0, 8)}`.toUpperCase();
    await prisma.workSchedule.create({ data: { tenantId: tenantA, code, name: "First", createdBy: "tester" } });
    await expect(prisma.workSchedule.create({ data: { tenantId: tenantA, code, name: "Second", createdBy: "tester" } })).rejects.toThrow();
  });

  it("the database rejects a second version with the same (work_schedule_id, version_number) at the constraint level", async () => {
    await seedTenant(tenantA);
    const schedule = await prisma.workSchedule.create({ data: { tenantId: tenantA, code: `VN-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "X", createdBy: "tester" } });
    const versionData = {
      tenantId: tenantA, workScheduleId: schedule.id, versionNumber: 1, status: "DRAFT", scheduleType: "FIXED_WEEKLY",
      timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h1", createdBy: "tester",
    };
    await prisma.workScheduleVersion.create({ data: versionData });
    await expect(prisma.workScheduleVersion.create({ data: { ...versionData, canonicalHash: "h2" } })).rejects.toThrow();
  });

  it("the database's partial unique index rejects a second simultaneously-ACTIVE version for the same schedule", async () => {
    await seedTenant(tenantA);
    const schedule = await prisma.workSchedule.create({ data: { tenantId: tenantA, code: `ACT-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "X", createdBy: "tester" } });
    await prisma.workScheduleVersion.create({
      data: { tenantId: tenantA, workScheduleId: schedule.id, versionNumber: 1, status: "ACTIVE", scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h1", createdBy: "tester" },
    });
    await expect(prisma.workScheduleVersion.create({
      data: { tenantId: tenantA, workScheduleId: schedule.id, versionNumber: 2, status: "ACTIVE", scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h2", createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("rejects a cross-tenant work schedule reference at the database (composite tenant-scoped foreign key)", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const scheduleInB = await prisma.workSchedule.create({ data: { tenantId: tenantB, code: `XT-${randomUUID().slice(0, 8)}`.toUpperCase(), name: "X", createdBy: "tester" } });
    await expect(prisma.workScheduleVersion.create({
      data: { tenantId: tenantA, workScheduleId: scheduleInB.id, versionNumber: 1, status: "DRAFT", scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h1", createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("activates a DRAFT and supersedes the prior ACTIVE atomically through the real UnitOfWork, leaving exactly one ACTIVE row", async () => {
    await seedTenant(tenantA);
    const unitOfWork = new PrismaWorkScheduleUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const code = `TWO-${randomUUID().slice(0, 8)}`.toUpperCase();

    const schedule = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.workSchedules.create({ tenantId: tenantA, code, name: "Standard", createdBy: "user-1" }),
    );
    const v1 = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.workSchedules.createVersion({ tenantId: tenantA, workScheduleId: schedule.id, scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h1", createdBy: "user-1" }),
    );
    const v2 = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.workSchedules.createVersion({ tenantId: tenantA, workScheduleId: schedule.id, scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern, canonicalHash: "h2", createdBy: "user-1" }),
    );
    await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.workSchedules.activateVersion({ tenantId: tenantA, workScheduleId: schedule.id, versionId: v1.id }));
    const activation2 = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.workSchedules.activateVersion({ tenantId: tenantA, workScheduleId: schedule.id, versionId: v2.id }));

    expect(typeof activation2).not.toBe("string");
    if (typeof activation2 !== "string") {
      expect(activation2.activated.id).toBe(v2.id);
      expect(activation2.retired?.id).toBe(v1.id);
    }

    const allVersions = await prisma.workScheduleVersion.findMany({ where: { workScheduleId: schedule.id } });
    expect(allVersions.filter((v) => v.status === "ACTIVE")).toHaveLength(1);
    expect(allVersions.find((v) => v.id === v1.id)?.status).toBe("RETIRED");
  });

  it("keeps work schedules strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const unitOfWork = new PrismaWorkScheduleUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const code = `ISO-${randomUUID().slice(0, 8)}`.toUpperCase();
    const schedule = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.workSchedules.create({ tenantId: tenantA, code, name: "Standard", createdBy: "user-1" }),
    );

    const reader = new PrismaWorkScheduleReadRepository(prisma);
    expect(await reader.getById(readContext(tenantA), schedule.id)).toBeDefined();
    expect(await reader.getById(readContext(tenantB), schedule.id)).toBeUndefined();
  });
});
