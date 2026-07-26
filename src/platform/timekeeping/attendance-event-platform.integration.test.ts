import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { PermissionSet, type TenantContext } from "@/platform/context";
import { PrismaAttendanceEventUnitOfWork } from "@/platform/timekeeping/prisma-attendance-event-unit-of-work";
import { PrismaAttendanceEventReadRepository } from "@/platform/timekeeping/prisma-attendance-event-read-repository";
import { PrismaAttendanceEventWriteRepository } from "@/platform/timekeeping/prisma-attendance-event-write-repository";
import type { CreateAttendanceEventInput } from "@/platform/timekeeping/attendance-event-repository";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: the
 * actual $transaction atomicity (attendance event + audit + outbox commit
 * together), the DB-level UNIQUE(tenant_id, idempotency_key) constraint that
 * backs deterministic idempotent replay/conflict detection, the immutability
 * trigger, and real tenant-isolated reads.
 */
describe("attendance event platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-tk1-${randomUUID()}`;
  const tenantB = `test-tenant-tk1-${randomUUID()}`;

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

  function input(tenantId: string, personId: string, overrides: Partial<CreateAttendanceEventInput> = {}): CreateAttendanceEventInput {
    return {
      tenantId,
      personId,
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "WEB_CLOCK",
      idempotencyKey: `idem-${randomUUID()}`,
      ...overrides,
    };
  }

  function unitOfWorkContext(tenantId: string): UnitOfWorkContext {
    return { tenantId, correlationId: "corr-1", actorUserId: "user-1", requestId: "req-1", commandName: "RecordAttendanceEvent" };
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermissionSet(["timekeeping.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  it("commits the attendance event, audit record, and outbox message atomically", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);

    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, events, audit);

    const outcome = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.attendanceEvents.create(input(tenantA, personId)));
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") return;

    const dbEvent = await prisma.attendanceEvent.findUniqueOrThrow({ where: { id: outcome.event.id } });
    expect(dbEvent.personId).toBe(personId);
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: outcome.event.id, eventName: "timekeeping.attendance_event.recorded" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: outcome.event.id, eventName: "timekeeping.attendance_event.recorded" } });
    expect(dbOutbox).not.toBeNull();
    expect(dbOutbox?.tenantId).toBe(tenantA);
  });

  it("regression: resolves a same-key/same-fact retry as a deterministic replay when create() runs inside the real UnitOfWork's interactive transaction, not just against the bare repository", async () => {
    // A failed unique-constraint INSERT aborts the whole Postgres
    // transaction; a naive try/catch-then-lookup implementation would fail
    // the follow-up lookup with "current transaction is aborted" (25P02)
    // the moment create() ran inside $transaction, which is the ONLY way
    // PrismaAttendanceEventUnitOfWork ever calls it in production. This
    // test exercises exactly that path, not the bare repository.
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const draft = input(tenantA, personId);

    const first = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.attendanceEvents.create(draft));
    const second = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.attendanceEvents.create(draft));

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    const rows = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: draft.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("regression: resolves a same-key/different-fact submission as a conflict when create() runs inside the real UnitOfWork's interactive transaction, leaving the existing row unmutated", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const unitOfWork = new PrismaAttendanceEventUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const draft = input(tenantA, personId);

    const first = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) => tx.repositories.attendanceEvents.create(draft));
    const conflict = await unitOfWork.execute(unitOfWorkContext(tenantA), (tx) =>
      tx.repositories.attendanceEvents.create({ ...draft, occurredAtUtc: "2026-07-26T09:30:00.000Z" }),
    );

    expect(first.kind).toBe("created");
    expect(conflict.kind).toBe("conflict");
    if (first.kind === "created" && conflict.kind === "conflict") {
      expect(conflict.existing.id).toBe(first.event.id);
      expect(conflict.existing.occurredAtUtc).toBe(first.event.occurredAtUtc);
    }
    const rows = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: draft.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("the database rejects a second row with the same (tenant_id, idempotency_key) at the constraint level", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const idempotencyKey = `idem-${randomUUID()}`;

    await prisma.attendanceEvent.create({
      data: { tenantId: tenantA, personId, occurredAtUtc: new Date("2026-07-26T08:00:00.000Z"), receivedAtUtc: new Date("2026-07-26T08:00:01.000Z"), source: "WEB_CLOCK", idempotencyKey },
    });
    await expect(prisma.attendanceEvent.create({
      data: { tenantId: tenantA, personId, occurredAtUtc: new Date("2026-07-26T09:00:00.000Z"), receivedAtUtc: new Date("2026-07-26T09:00:01.000Z"), source: "WEB_CLOCK", idempotencyKey },
    })).rejects.toThrow();
  });

  it("the immutability trigger rejects an UPDATE and a DELETE against attendance_events", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const created = await prisma.attendanceEvent.create({
      data: { tenantId: tenantA, personId, occurredAtUtc: new Date("2026-07-26T08:00:00.000Z"), receivedAtUtc: new Date("2026-07-26T08:00:01.000Z"), source: "WEB_CLOCK", idempotencyKey: `idem-${randomUUID()}` },
    });

    await expect(prisma.$executeRawUnsafe(`UPDATE attendance_events SET source = 'MOBILE' WHERE attendance_event_id = '${created.id}'`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`DELETE FROM attendance_events WHERE attendance_event_id = '${created.id}'`)).rejects.toThrow();
  });

  it("resolves a same-key/same-fact retry as a deterministic replay with no second row, via the repository's atomic create-or-detect path", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);
    const draft = input(tenantA, personId);

    const first = await repository.create(draft);
    const second = await repository.create(draft);

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    if (first.kind === "created" && second.kind === "replayed") expect(second.event.id).toBe(first.event.id);
    const rows = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: draft.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("resolves a same-key/different-fact submission as a conflict, leaving the existing row unmutated", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);
    const draft = input(tenantA, personId);

    const first = await repository.create(draft);
    const conflict = await repository.create({ ...draft, occurredAtUtc: "2026-07-26T09:30:00.000Z" });

    expect(first.kind).toBe("created");
    expect(conflict.kind).toBe("conflict");
    if (first.kind === "created" && conflict.kind === "conflict") {
      expect(conflict.existing.id).toBe(first.event.id);
      expect(conflict.existing.occurredAtUtc).toBe(first.event.occurredAtUtc);
    }
    const rows = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: draft.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("two concurrent creates with the same idempotency key resolve to exactly one 'created' and one 'replayed', never two rows", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);
    const draft = input(tenantA, personId);

    const [a, b] = await Promise.all([repository.create(draft), repository.create(draft)]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["created", "replayed"]);
    const rows = await prisma.attendanceEvent.count({ where: { tenantId: tenantA, idempotencyKey: draft.idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("allows the same idempotencyKey to be used independently across two tenants", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personA = `emp-${randomUUID().slice(0, 8)}`;
    const personB = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personA);
    await seedEmployee(tenantB, personB);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);
    const sharedKey = `idem-${randomUUID()}`;

    const a = await repository.create(input(tenantA, personA, { idempotencyKey: sharedKey }));
    const b = await repository.create(input(tenantB, personB, { idempotencyKey: sharedKey }));
    expect(a.kind).toBe("created");
    expect(b.kind).toBe("created");
  });

  it("orders listForPersonAndDateRange by occurredAtUtc ascending, not insertion order", async () => {
    await seedTenant(tenantA);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);

    await repository.create(input(tenantA, personId, { occurredAtUtc: "2026-07-26T10:00:00.000Z", receivedAtUtc: "2026-07-26T10:00:01.000Z" }));
    await repository.create(input(tenantA, personId, { occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z" }));
    await repository.create(input(tenantA, personId, { occurredAtUtc: "2026-07-26T09:00:00.000Z", receivedAtUtc: "2026-07-26T09:00:01.000Z" }));

    const listed = await repository.listForPersonAndDateRange({ tenantId: tenantA, personId, fromUtc: "2026-07-26T00:00:00.000Z", toUtc: "2026-07-27T00:00:00.000Z" });
    expect(listed.map((e) => e.occurredAtUtc)).toEqual(["2026-07-26T08:00:00.000Z", "2026-07-26T09:00:00.000Z", "2026-07-26T10:00:00.000Z"]);
  });

  it("keeps attendance events strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const personId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantA, personId);
    const repository = new PrismaAttendanceEventWriteRepository(prisma);
    const outcome = await repository.create(input(tenantA, personId));
    if (outcome.kind === "conflict") throw new Error("seed failed");

    const reader = new PrismaAttendanceEventReadRepository(prisma);
    expect(await reader.getById(readContext(tenantA), outcome.event.id)).toBeDefined();
    expect(await reader.getById(readContext(tenantB), outcome.event.id)).toBeUndefined();
  });

  it("rejects a cross-tenant person reference at the database (composite tenant-scoped foreign key)", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const foreignPersonId = `emp-${randomUUID().slice(0, 8)}`;
    await seedEmployee(tenantB, foreignPersonId);

    await expect(prisma.attendanceEvent.create({
      data: { tenantId: tenantA, personId: foreignPersonId, occurredAtUtc: new Date("2026-07-26T08:00:00.000Z"), receivedAtUtc: new Date("2026-07-26T08:00:01.000Z"), source: "WEB_CLOCK", idempotencyKey: `idem-${randomUUID()}` },
    })).rejects.toThrow();
  });

  it("has no updated_at column on attendance_events", async () => {
    const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'attendance_events'`,
    );
    expect(columns.map((c) => c.column_name)).not.toContain("updated_at");
  });
});
