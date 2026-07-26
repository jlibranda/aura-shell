import { describe, expect, it } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import type { UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import { InMemoryAttendancePolicyUnitOfWork } from "@/platform/timekeeping/in-memory-attendance-policy-unit-of-work";
import type { AttendancePolicyTransactionRepositories, CreateAttendancePolicyInput } from "@/platform/timekeeping/attendance-policy-repository";

const AUDITED_CONTEXT: UnitOfWorkContext = {
  tenantId: "tenant-a",
  correlationId: "corr-1",
  actorUserId: "user-1",
  requestId: "req-1",
  commandName: "CreateTenantAttendancePolicy",
};

const CREATE_INPUT: CreateAttendancePolicyInput = {
  tenantId: "tenant-a",
  scope: "TENANT",
  scopeId: "tenant-a",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  rounding: { incrementMinutes: 15, direction: "NEAREST" },
  gracePeriod: { lateArrivalGraceMinutes: 5, earlyDepartureGraceMinutes: 5 },
  breakRules: { unpaidBreakMinutes: 60, paidBreakMinutes: 15 },
  overtime: { dailyThresholdMinutes: 480, weeklyThresholdMinutes: 2400 },
  overtimeThresholdsAreStatutoryFloor: false,
  tolerance: { missedPunchToleranceMinutes: 10 },
  calculationAlgorithmVersion: 1,
  fingerprint: "hash-1",
  createdBy: "user-1",
};

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAttendancePolicyUnitOfWork(undefined, events, audit);
  return { unitOfWork, audit, events };
}

describe("InMemoryAttendancePolicyUnitOfWork — rollback", () => {
  it("leaves no persisted policy, no domain event, and no audit record when the operation throws after a create", async () => {
    const { unitOfWork, audit, events } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: AttendancePolicyTransactionRepositories }) => {
        await tx.repositories.attendancePolicies.create(CREATE_INPUT);
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");

    expect(unitOfWork.getStore().policies).toHaveLength(0);
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("restores the prior open window when a replace transaction throws after ending the current row", async () => {
    const { unitOfWork, audit, events } = harness();
    const first = await unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendancePolicyTransactionRepositories }) =>
      tx.repositories.attendancePolicies.create(CREATE_INPUT),
    );
    events.clear(); audit.clear();
    const beforeSnapshot = [...unitOfWork.getStore().policies];

    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, async (tx: { repositories: AttendancePolicyTransactionRepositories }) => {
        await tx.repositories.attendancePolicies.end({ tenantId: "tenant-a", attendancePolicyVersionId: first.attendancePolicyVersionId, effectiveUntil: "2026-06-01" });
        throw new Error("downstream failure after end");
      }),
    ).rejects.toThrow("downstream failure after end");

    expect(unitOfWork.getStore().policies).toEqual(beforeSnapshot);
    expect(unitOfWork.getStore().policies[0].effectiveUntil).toBeUndefined();
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });

  it("creates no audit record when actor/request/command context is absent, even though the row and event still commit", async () => {
    const { unitOfWork, audit, events } = harness();
    const unauditedContext: UnitOfWorkContext = { tenantId: "tenant-a", correlationId: "corr-1" };
    await unitOfWork.execute(unauditedContext, (tx: { repositories: AttendancePolicyTransactionRepositories }) =>
      tx.repositories.attendancePolicies.create(CREATE_INPUT),
    );
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(0);
    expect(unitOfWork.getStore().policies).toHaveLength(1);
  });
});

describe("InMemoryAttendancePolicyUnitOfWork — tenant isolation", () => {
  it("rejects a create whose tenantId does not match the transaction's own tenant", async () => {
    const { unitOfWork } = harness();
    await expect(
      unitOfWork.execute(AUDITED_CONTEXT, (tx: { repositories: AttendancePolicyTransactionRepositories }) =>
        tx.repositories.attendancePolicies.create({ ...CREATE_INPUT, tenantId: "tenant-b" }),
      ),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(unitOfWork.getStore().policies).toHaveLength(0);
  });
});
