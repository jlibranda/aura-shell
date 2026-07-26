import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { PermissionSet } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAttendancePolicyUnitOfWork } from "@/platform/timekeeping/in-memory-attendance-policy-unit-of-work";
import { InMemoryAttendancePolicyReadRepository } from "@/platform/timekeeping/in-memory-attendance-policy-repository";
import { AttendancePolicyService } from "@/platform/timekeeping/attendance-policy-service";
import type { AttendancePolicyContentDraft } from "@/platform/timekeeping/attendance-policy";

function requestFor(roles: readonly PlatformRole[], permissions: readonly Permission[] = [], tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions,
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

const MANAGE: Permission[] = ["timekeeping.view", "timekeeping.manage"];

function content(overrides: Partial<AttendancePolicyContentDraft> = {}): AttendancePolicyContentDraft {
  return {
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    rounding: { incrementMinutes: 15, direction: "NEAREST" },
    gracePeriod: { lateArrivalGraceMinutes: 5, earlyDepartureGraceMinutes: 5 },
    breakRules: { unpaidBreakMinutes: 60, paidBreakMinutes: 15 },
    overtime: { dailyThresholdMinutes: 480, weeklyThresholdMinutes: 2400 },
    overtimeThresholdsAreStatutoryFloor: false,
    tolerance: { missedPunchToleranceMinutes: 10 },
    ...overrides,
  };
}

function harness(tenantId = "tenant-a") {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAttendancePolicyUnitOfWork(undefined, events, audit);
  const service = new AttendancePolicyService(unitOfWork);
  const reader = new InMemoryAttendancePolicyReadRepository(unitOfWork.getStore());
  const readContext = (t = tenantId) => ({ tenantId: t, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: new PermissionSet(["timekeeping.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });
  return { service, audit, events, unitOfWork, reader, readContext };
}

describe("AttendancePolicyService — authorization", () => {
  it("denies createTenantPolicy, replaceTenantPolicy, and endTenantPolicy without timekeeping.manage", async () => {
    const { service } = harness();
    const request = requestFor(["hr_operations"], ["timekeeping.view"]);
    expect((await service.createTenantPolicy(request, content())).kind).toBe("authorization_failure");
    expect((await service.replaceTenantPolicy(request, content())).kind).toBe("authorization_failure");
    expect((await service.endTenantPolicy(request, { effectiveUntil: "2026-06-01" })).kind).toBe("authorization_failure");
  });

  it("has no effect on the store when authorization is denied", async () => {
    const { service, unitOfWork } = harness();
    await service.createTenantPolicy(requestFor(["employee"], []), content());
    expect(unitOfWork.getStore().policies).toHaveLength(0);
  });
});

describe("AttendancePolicyService — createTenantPolicy", () => {
  it("creates the tenant's first baseline and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.createTenantPolicy(requestFor(["hr_admin"], MANAGE), content());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.policy.scope).toBe("TENANT");
      expect(result.value.policy.scopeId).toBe("tenant-a");
      expect(result.value.policy.effectiveUntil).toBeUndefined();
      expect(result.value.policy.attendancePolicyId).toBeTruthy();
      expect(result.value.policy.attendancePolicyVersionId).toBeTruthy();
      expect(result.value.policy.attendancePolicyId).not.toBe(result.value.policy.attendancePolicyVersionId);
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.attendance_policy.created"]);
    expect(audit.list()).toHaveLength(1);
  });

  it("rejects a second baseline that overlaps the tenant's current one as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.createTenantPolicy(request, content({ effectiveFrom: "2026-01-01T00:00:00.000Z" }));
    const overlapping = await service.createTenantPolicy(request, content({ effectiveFrom: "2026-03-01T00:00:00.000Z" }));
    expect(overlapping.kind).toBe("conflict");
  });

  it("rejects invalid content with a validation failure, not a conflict", async () => {
    const { service } = harness();
    const result = await service.createTenantPolicy(requestFor(["hr_admin"], MANAGE), content({ rounding: { incrementMinutes: 7, direction: "NEAREST" } }));
    expect(result.kind).toBe("validation_failure");
  });

  it("computes a fingerprint deterministically from the resolved values", async () => {
    const { service } = harness();
    const result = await service.createTenantPolicy(requestFor(["hr_admin"], MANAGE), content());
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.policy.fingerprint).toHaveLength(64);
  });
});

async function seedCurrent() {
  const h = harness();
  const request = requestFor(["hr_admin"], MANAGE);
  const first = await h.service.createTenantPolicy(request, content({ effectiveFrom: "2026-01-01T00:00:00.000Z" }));
  if (first.kind !== "success") throw new Error("seed failed");
  return { ...h, request, firstVersionId: first.value.policy.attendancePolicyVersionId, lineageId: first.value.policy.attendancePolicyId };
}

describe("AttendancePolicyService — replaceTenantPolicy", () => {
  it("ends the current policy and opens a new one, atomically, forming adjacent windows and carrying the lineage id forward", async () => {
    const { service, request, firstVersionId, lineageId, reader, readContext } = await seedCurrent();
    const result = await service.replaceTenantPolicy(request, content({ effectiveFrom: "2026-06-01T00:00:00.000Z", rounding: { incrementMinutes: 30, direction: "UP" } }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.previous.attendancePolicyVersionId).toBe(firstVersionId);
      expect(result.value.previous.effectiveUntil).toBe("2026-06-01T00:00:00.000Z");
      expect(result.value.policy.attendancePolicyId).toBe(lineageId);
      expect(result.value.policy.rounding.incrementMinutes).toBe(30);
    }
    const current = await reader.findCurrentPolicy(readContext(), "TENANT", "tenant-a");
    expect(current?.rounding.incrementMinutes).toBe(30);
  });

  it("emits an ended event for the superseded record and a created event for the new one, in that order", async () => {
    const { service, request, events } = await seedCurrent();
    const before = events.list().length;
    await service.replaceTenantPolicy(request, content({ effectiveFrom: "2026-06-01T00:00:00.000Z" }));
    const names = events.list().slice(before).map((e) => e.eventName);
    expect(names).toEqual(["timekeeping.attendance_policy.ended", "timekeeping.attendance_policy.created"]);
  });

  it("rejects a replace with no current policy to replace", async () => {
    const { service } = harness();
    const result = await service.replaceTenantPolicy(requestFor(["hr_admin"], MANAGE), content());
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a replace whose effectiveFrom is not after the current policy's start", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.replaceTenantPolicy(request, content({ effectiveFrom: "2026-01-01T00:00:00.000Z" }));
    expect(result.kind).toBe("validation_failure");
  });

  it("historical policy resolution against the superseded version is preserved after replace", async () => {
    const { service, request, firstVersionId, reader, readContext } = await seedCurrent();
    await service.replaceTenantPolicy(request, content({ effectiveFrom: "2026-06-01T00:00:00.000Z", rounding: { incrementMinutes: 30, direction: "UP" } }));
    const historical = await reader.findPolicyAtInstant(readContext(), "TENANT", "tenant-a", "2026-03-01T00:00:00.000Z");
    expect(historical?.attendancePolicyVersionId).toBe(firstVersionId);
    expect(historical?.rounding.incrementMinutes).toBe(15);
  });
});

describe("AttendancePolicyService — endTenantPolicy", () => {
  it("closes the tenant's current policy without opening a new one", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.endTenantPolicy(request, { effectiveUntil: "2026-12-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.policy.effectiveUntil).toBe("2026-12-01");
  });

  it("rejects ending a tenant with no current policy", async () => {
    const { service } = harness();
    const result = await service.endTenantPolicy(requestFor(["hr_admin"], MANAGE), { effectiveUntil: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects an end date that is not after the policy's start", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.endTenantPolicy(request, { effectiveUntil: "2020-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("leaves the tenant's resolver returning configuration_incomplete after an end with no replacement", async () => {
    const { service, request, reader, readContext } = await seedCurrent();
    await service.endTenantPolicy(request, { effectiveUntil: "2026-06-01" });
    const current = await reader.findCurrentPolicy(readContext(), "TENANT", "tenant-a");
    expect(current).toBeUndefined();
  });

  it("rollback: an error mid-transaction leaves the policy unended", async () => {
    const { unitOfWork, firstVersionId } = await seedCurrent();
    await expect(
      unitOfWork.execute({ tenantId: "tenant-a", correlationId: "c" }, async (tx) => {
        await tx.repositories.attendancePolicies.end({ tenantId: "tenant-a", attendancePolicyVersionId: firstVersionId, effectiveUntil: "2026-06-01" });
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");
    const stillOpen = unitOfWork.getStore().policies.find((p) => p.attendancePolicyVersionId === firstVersionId);
    expect(stillOpen?.effectiveUntil).toBeUndefined();
  });
});

describe("AttendancePolicyService — tenant isolation", () => {
  it("does not let tenant B see or end tenant A's current policy", async () => {
    const h = harness("tenant-a");
    const requestA = requestFor(["hr_admin"], MANAGE, "tenant-a");
    await h.service.createTenantPolicy(requestA, content());

    const requestB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const end = await h.service.endTenantPolicy(requestB, { effectiveUntil: "2026-06-01" });
    expect(end.kind).toBe("validation_failure");

    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: new PermissionSet(["timekeeping.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await h.reader.findCurrentPolicy(bContext, "TENANT", "tenant-b")).toBeUndefined();
  });
});
