import { describe, expect, it } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import { InMemoryScheduleAssignmentUnitOfWork } from "@/platform/timekeeping/in-memory-schedule-assignment-unit-of-work";
import type { ScheduleAssignmentTransactionRepositories } from "@/platform/timekeeping/schedule-assignment-repository";

const AUDITED_CONTEXT: UnitOfWorkContext = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  actorUserId: "user-1",
  requestId: "req-1",
  commandName: "AssignSchedule",
};

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryScheduleAssignmentUnitOfWork(undefined, undefined, undefined, events, audit);
  return { unitOfWork, audit, events };
}

describe("InMemoryScheduleAssignmentUnitOfWork — rollback", () => {
  it("leaves no persisted assignment, no domain event, and no audit record when the operation throws after a create", async () => {
    const { unitOfWork, audit, events } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: ScheduleAssignmentTransactionRepositories }) => {
        await tx.repositories.scheduleAssignments.create({ tenantId: "tenant-a", personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", createdBy: "user-1" });
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");

    expect(unitOfWork.getStore().assignments).toHaveLength(0);
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("restores the prior open window when a transfer transaction throws after ending the current row", async () => {
    const { unitOfWork, audit, events } = harness();
    const first = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: ScheduleAssignmentTransactionRepositories }) =>
      tx.repositories.scheduleAssignments.create({ tenantId: "tenant-a", personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", createdBy: "user-1" }),
    );
    events.clear(); audit.clear();
    const beforeSnapshot = [...unitOfWork.getStore().assignments];

    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: ScheduleAssignmentTransactionRepositories }) => {
        await tx.repositories.scheduleAssignments.end({ tenantId: "tenant-a", id: first.id, effectiveUntil: "2026-06-01" });
        throw new Error("downstream failure after end");
      }),
    ).rejects.toThrow("downstream failure after end");

    expect(unitOfWork.getStore().assignments).toEqual(beforeSnapshot);
    expect(unitOfWork.getStore().assignments[0].effectiveUntil).toBeUndefined();
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("creates no audit record when actor/request/command context is absent, even though the row and event still commit", async () => {
    const { unitOfWork, audit, events } = harness();
    const unauditedContext: UnitOfWorkContext = { tenantId: "tenant-a", correlationId: "corr-1" };
    await unitOfWork.execute(unauditedContext, (tx: { repositories: ScheduleAssignmentTransactionRepositories }) =>
      tx.repositories.scheduleAssignments.create({ tenantId: "tenant-a", personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", createdBy: "user-1" }),
    );
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(0);
    expect(unitOfWork.getStore().assignments).toHaveLength(1);
  });
});

describe("InMemoryScheduleAssignmentUnitOfWork — tenant isolation", () => {
  it("rejects a create whose tenantId does not match the transaction's own tenant", async () => {
    const { unitOfWork } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: ScheduleAssignmentTransactionRepositories }) =>
        tx.repositories.scheduleAssignments.create({ tenantId: "tenant-b", personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", createdBy: "user-1" }),
      ),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(unitOfWork.getStore().assignments).toHaveLength(0);
  });
});
