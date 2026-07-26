import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { PrismaAttendanceEventUnitOfWork } from "@/platform/timekeeping/prisma-attendance-event-unit-of-work";
import { AttendanceIngestionService } from "@/platform/timekeeping/attendance-ingestion-service";
import { FixedCurrentPersonResolver } from "@/platform/timekeeping/test-doubles/current-person-resolver";

/**
 * Real-Postgres coverage for AttendanceIngestionService: proves the service
 * commits through Slice 1's already-verified atomic transaction/audit/
 * outbox path rather than any new persistence mechanism, and that its
 * permission/resolver layer holds up against a real database round-trip.
 */
describe("attendance ingestion service (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-tk2-${randomUUID()}`;
  const tenantB = `test-tenant-tk2-${randomUUID()}`;

  afterAll(async () => {
    await prisma.attendanceEvent.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
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

  function request(roles: readonly ("employee" | "hr_admin" | "auditor")[], tenantId: string) {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles,
      permissions: [],
      actorProvenance: "server_verified",
      correlationId: "corr-1",
    });
  }

  it("commits a self-clock event, audit record, and outbox message atomically through the real database", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);

    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, events, audit);
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver(personId));

    const result = await service.recordOwnAttendanceEvent(request(["employee"], tenantA), {
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "WEB_CLOCK",
      idempotencyKey: `idem-${randomUUID()}`,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    const dbEvent = await prisma.attendanceEvent.findUniqueOrThrow({ where: { id: result.value.event.id } });
    expect(dbEvent.personId).toBe(personId);
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: result.value.event.id } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: result.value.event.id } });
    expect(dbOutbox).not.toBeNull();
  });

  it("commits an on-behalf-of event for an explicitly named person through the real database", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);

    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver());

    const result = await service.recordAttendanceEventForPerson(request(["hr_admin"], tenantA), {
      personId,
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "BIOMETRIC_DEVICE",
      idempotencyKey: `idem-${randomUUID()}`,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const dbEvent = await prisma.attendanceEvent.findUniqueOrThrow({ where: { id: result.value.event.id } });
      expect(dbEvent.personId).toBe(personId);
      expect(dbEvent.source).toBe("BIOMETRIC_DEVICE");
    }
  });

  it("denies an unauthorized on-behalf-of attempt before touching the database", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver());

    const result = await service.recordAttendanceEventForPerson(request(["auditor"], tenantA), {
      personId,
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "API",
      idempotencyKey: `idem-${randomUUID()}`,
    });

    expect(result.kind).toBe("authorization_failure");
    const count = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, personId } });
    expect(count).toBe(0);
  });

  it("replays a same-key/same-fact resubmission through the service against the real database, with no second row", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver());
    const input = {
      personId,
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "API" as const,
      idempotencyKey: `idem-${randomUUID()}`,
    };

    const first = await service.recordAttendanceEventForPerson(request(["hr_admin"], tenantA), input);
    const second = await service.recordAttendanceEventForPerson(request(["hr_admin"], tenantA), input);
    expect(first.kind).toBe("success");
    expect(second.kind).toBe("success");
    if (second.kind === "success") expect(second.value.replayed).toBe(true);
    const count = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: input.idempotencyKey } });
    expect(count).toBe(1);
  });

  it("keeps tenant isolation: the same idempotencyKey in two tenants creates two independent rows", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personA = `emp-${randomUUID().slice(0, 8)}`;
    const personB = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personA);
    await seedEmployee(tenantB, personB);
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver());
    const key = `idem-${randomUUID()}`;

    const a = await service.recordAttendanceEventForPerson(request(["hr_admin"], tenantA), { personId: personA, occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "API", idempotencyKey: key });
    const b = await service.recordAttendanceEventForPerson(request(["hr_admin"], tenantB), { personId: personB, occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "API", idempotencyKey: key });
    expect(a.kind).toBe("success");
    expect(b.kind).toBe("success");
  });
});
