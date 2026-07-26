import { describe, expect, it } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import { InMemoryWorkScheduleUnitOfWork } from "@/platform/timekeeping/in-memory-work-schedule-unit-of-work";
import type { WorkScheduleTransactionRepositories } from "@/platform/timekeeping/work-schedule-repository";

const AUDITED_CONTEXT: UnitOfWorkContext = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  actorUserId: "user-1",
  requestId: "req-1",
  commandName: "CreateWorkSchedule",
};

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryWorkScheduleUnitOfWork(undefined, events, audit);
  return { unitOfWork, audit, events };
}

describe("InMemoryWorkScheduleUnitOfWork — rollback", () => {
  it("leaves no persisted schedule, no domain event, and no audit record when the operation throws after a create", async () => {
    const { unitOfWork, audit, events } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: WorkScheduleTransactionRepositories }) => {
        await tx.repositories.workSchedules.create({ tenantId: "tenant-a", code: "STD", name: "Standard", createdBy: "user-1" });
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");

    expect(unitOfWork.getStore().workSchedules).toHaveLength(0);
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("restores prior version state (including ACTIVE status) when an activation transaction throws partway through", async () => {
    const { unitOfWork, audit, events } = harness();
    const schedule = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: WorkScheduleTransactionRepositories }) =>
      tx.repositories.workSchedules.create({ tenantId: "tenant-a", code: "STD", name: "Standard", createdBy: "user-1" }),
    );
    const draft = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: WorkScheduleTransactionRepositories }) =>
      tx.repositories.workSchedules.createVersion({
        tenantId: "tenant-a", workScheduleId: schedule.id, scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC",
        weeklyPattern: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] }, canonicalHash: "hash-1", createdBy: "user-1",
      }),
    );
    await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: WorkScheduleTransactionRepositories }) =>
      tx.repositories.workSchedules.activateVersion({ tenantId: "tenant-a", workScheduleId: schedule.id, versionId: draft.id }),
    );
    events.clear(); audit.clear();

    const beforeSnapshot = [...unitOfWork.getStore().versions];

    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: WorkScheduleTransactionRepositories }) => {
        const draft2 = await tx.repositories.workSchedules.createVersion({
          tenantId: "tenant-a", workScheduleId: schedule.id, scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC",
          weeklyPattern: { MON: [], TUE: [{ start: "10:00", end: "18:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
          canonicalHash: "hash-2", createdBy: "user-1",
        });
        await tx.repositories.workSchedules.activateVersion({ tenantId: "tenant-a", workScheduleId: schedule.id, versionId: draft2.id });
        throw new Error("downstream failure after activation");
      }),
    ).rejects.toThrow("downstream failure after activation");

    expect(unitOfWork.getStore().versions).toEqual(beforeSnapshot);
    const active = unitOfWork.getStore().versions.filter((v) => v.workScheduleId === schedule.id && v.status === "ACTIVE");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(draft.id);
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("creates no audit record when actor/request/command context is absent, even though the row and event still commit", async () => {
    const { unitOfWork, audit, events } = harness();
    const unauditedContext: UnitOfWorkContext = { tenantId: "tenant-a", correlationId: "corr-1" };
    await unitOfWork.execute(unauditedContext, (tx: { repositories: WorkScheduleTransactionRepositories }) =>
      tx.repositories.workSchedules.create({ tenantId: "tenant-a", code: "STD", name: "Standard", createdBy: "user-1" }),
    );
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(0);
    expect(unitOfWork.getStore().workSchedules).toHaveLength(1);
  });
});

describe("InMemoryWorkScheduleUnitOfWork — tenant isolation", () => {
  it("rejects a create whose tenantId does not match the transaction's own tenant", async () => {
    const { unitOfWork } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: WorkScheduleTransactionRepositories }) =>
        tx.repositories.workSchedules.create({ tenantId: "tenant-b", code: "STD", name: "Standard", createdBy: "user-1" }),
      ),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(unitOfWork.getStore().workSchedules).toHaveLength(0);
  });
});
