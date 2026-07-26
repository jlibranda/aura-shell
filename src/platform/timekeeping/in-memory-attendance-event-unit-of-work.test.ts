import { describe, expect, it } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import { InMemoryAttendanceEventUnitOfWork } from "@/platform/timekeeping/in-memory-attendance-event-unit-of-work";
import type { AttendanceEventTransactionRepositories } from "@/platform/timekeeping/attendance-event-repository";
import type { CreateAttendanceEventInput } from "@/platform/timekeeping/attendance-event-repository";

function input(overrides: Partial<CreateAttendanceEventInput> = {}): CreateAttendanceEventInput {
  return {
    tenantId: "tenant-a",
    personId: "emp-1",
    occurredAtUtc: "2026-07-26T08:00:00.000Z",
    receivedAtUtc: "2026-07-26T08:00:01.000Z",
    source: "WEB_CLOCK",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAttendanceEventUnitOfWork(undefined, events, audit);
  return { unitOfWork, audit, events };
}

const AUDITED_CONTEXT: UnitOfWorkContext = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  actorUserId: "user-1",
  requestId: "req-1",
  commandName: "RecordAttendanceEvent",
};

const UNAUDITED_CONTEXT: UnitOfWorkContext = { tenantId: "tenant-a", correlationId: "corr-1" };

describe("InMemoryAttendanceEventUnitOfWork — create", () => {
  it("persists a new event, publishes exactly one domain event, and creates an audit record when actor context is present", async () => {
    const { unitOfWork, audit, events } = harness();
    const outcome = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input()),
    );
    expect(outcome.kind).toBe("created");
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.attendance_event.recorded"]);
    expect(audit.list()).toHaveLength(1);
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(1);
  });

  it("creates no audit record when actor/request/command context is absent, even though the row and event still commit", async () => {
    const { unitOfWork, audit, events } = harness();
    const outcome = await unitOfWork.execute(UNAUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input()),
    );
    expect(outcome.kind).toBe("created");
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(0);
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(1);
  });
});

describe("InMemoryAttendanceEventUnitOfWork — idempotency", () => {
  it("returns the original record deterministically on a same-key/same-fact retry, with no second row, event, or audit record", async () => {
    const { unitOfWork, audit, events } = harness();
    const first = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input()),
    );
    const second = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input()),
    );

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    if (first.kind === "created" && second.kind === "replayed") {
      expect(second.event.id).toBe(first.event.id);
    }
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(1);
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(1);
  });

  it("rejects a same-key/different-fact submission as a conflict, leaving the existing record unmutated and producing no second event or audit record", async () => {
    const { unitOfWork, audit, events } = harness();
    await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input()),
    );
    const conflict = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input({ occurredAtUtc: "2026-07-26T09:00:00.000Z" })),
    );

    expect(conflict.kind).toBe("conflict");
    if (conflict.kind === "conflict") {
      expect(conflict.existing.occurredAtUtc).toBe("2026-07-26T08:00:00.000Z");
    }
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(1);
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(1);
  });
});

describe("InMemoryAttendanceEventUnitOfWork — rollback", () => {
  it("leaves no persisted row, no domain event, and no audit record when the operation throws after a create", async () => {
    const { unitOfWork, audit, events } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: AttendanceEventTransactionRepositories }) => {
        await tx.repositories.attendanceEvents.create(input());
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");

    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(0);
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });
});

describe("InMemoryAttendanceEventUnitOfWork — tenant isolation", () => {
  it("rejects a create whose tenantId does not match the transaction's own tenant", async () => {
    const { unitOfWork } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
        tx.repositories.attendanceEvents.create(input({ tenantId: "tenant-b" })),
      ),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(0);
  });

  it("allows the same idempotencyKey to be used independently across two tenants", async () => {
    const { unitOfWork } = harness();
    const a = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input({ tenantId: "tenant-a", idempotencyKey: "shared-key" })),
    );
    const bContext: UnitOfWorkContext = { ...AUDITED_CONTEXT, tenantId: "tenant-b" };
    const b = await unitOfWork.execute(bContext, (tx: { repositories: AttendanceEventTransactionRepositories }) =>
      tx.repositories.attendanceEvents.create(input({ tenantId: "tenant-b", idempotencyKey: "shared-key" })),
    );

    expect(a.kind).toBe("created");
    expect(b.kind).toBe("created");
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(2);
  });
});
