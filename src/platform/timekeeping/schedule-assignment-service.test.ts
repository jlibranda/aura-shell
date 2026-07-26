import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryScheduleAssignmentUnitOfWork } from "@/platform/timekeeping/in-memory-schedule-assignment-unit-of-work";
import { InMemoryScheduleAssignmentReadRepository } from "@/platform/timekeeping/in-memory-schedule-assignment-repository";
import { ScheduleAssignmentService } from "@/platform/timekeeping/schedule-assignment-service";
import type { WorkScheduleVersionRecord } from "@/platform/timekeeping/work-schedule";

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

function version(overrides: Partial<WorkScheduleVersionRecord> = {}): WorkScheduleVersionRecord {
  return Object.freeze({
    id: "wsv1", tenantId: "tenant-a", workScheduleId: "ws1", versionNumber: 1, status: "ACTIVE" as const,
    scheduleType: "FIXED_WEEKLY" as const, timezoneResolutionMode: "FIXED" as const, timezone: "UTC",
    weeklyPattern: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    canonicalHash: "hash-1", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor",
    ...overrides,
  });
}

function harness(tenantId = "tenant-a") {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryScheduleAssignmentUnitOfWork(undefined, undefined, undefined, events, audit);
  const service = new ScheduleAssignmentService(unitOfWork);
  const reader = new InMemoryScheduleAssignmentReadRepository(unitOfWork.getStore());
  const readContext = (t = tenantId) => ({ tenantId: t, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });

  // Seed an ACTIVE work schedule version and an Organization Assignment covering the whole test window, so create-side checks pass by default.
  unitOfWork.getWorkScheduleStore().versions.push(version());
  unitOfWork.getOrganizationAssignments().seed(tenantId, { personId: "p1", effectiveFrom: "2020-01-01T00:00:00.000Z" });

  return { service, audit, events, unitOfWork, reader, readContext };
}

describe("ScheduleAssignmentService — authorization", () => {
  it("denies assignSchedule, transferSchedule, endAssignment, and cancelFutureAssignment without timekeeping.manage", async () => {
    const { service } = harness();
    const request = requestFor(["hr_operations"], ["timekeeping.view"]);
    expect((await service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" })).kind).toBe("authorization_failure");
    expect((await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" })).kind).toBe("authorization_failure");
    expect((await service.endAssignment(request, { personId: "p1", effectiveUntil: "2026-06-01" })).kind).toBe("authorization_failure");
    expect((await service.cancelFutureAssignment(request, { id: "sa1" })).kind).toBe("authorization_failure");
  });

  it("has no effect on the store when authorization is denied", async () => {
    const { service, unitOfWork } = harness();
    await service.assignSchedule(requestFor(["employee"], []), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(unitOfWork.getStore().assignments).toHaveLength(0);
  });
});

describe("ScheduleAssignmentService — assignSchedule", () => {
  it("assigns a person's first schedule and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.assignment.workScheduleVersionId).toBe("wsv1");
      expect(result.value.assignment.effectiveUntil).toBeUndefined();
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.schedule_assignment.created"]);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].metadata).toHaveProperty("personId", "p1");
  });

  it("accepts a past-dated assignment", async () => {
    const { service } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2021-01-01" });
    expect(result.kind).toBe("success");
  });

  it("accepts a future-dated assignment", async () => {
    const { service } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    expect(result.kind).toBe("success");
  });

  it("rejects a person with no Organization Assignment placement at the effective date", async () => {
    const { service } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "ghost", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.code === "no_organization_assignment")).toBe(true);
  });

  it("uses the as-of Organization Assignment window for a future effectiveFrom, not whether a placement exists today", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getOrganizationAssignments().seed("tenant-a", { personId: "p2", effectiveFrom: "2030-01-01T00:00:00.000Z" });
    const tooEarly = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p2", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(tooEarly.kind).toBe("validation_failure");
    const afterPlacementStarts = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p2", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2031-01-01" });
    expect(afterPlacementStarts.kind).toBe("success");
  });

  it("rejects a workScheduleVersionId that does not exist", async () => {
    const { service } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "ghost", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.code === "not_found")).toBe(true);
  });

  it("rejects a workScheduleVersionId that belongs to a different workScheduleId", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getWorkScheduleStore().versions.push(version({ id: "wsv-other", workScheduleId: "ws-other" }));
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv-other", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.code === "schedule_mismatch")).toBe(true);
  });

  it("rejects a DRAFT version", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getWorkScheduleStore().versions[0] = version({ status: "DRAFT" });
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.code === "not_active")).toBe(true);
  });

  it("rejects a RETIRED version for a new assignment", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getWorkScheduleStore().versions[0] = version({ status: "RETIRED", retiredAt: "2026-01-01T00:00:00.000Z" });
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.code === "not_active")).toBe(true);
  });

  it("accepts an ACTIVE version", async () => {
    const { service } = harness();
    const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
  });

  it("rejects a second assignment that overlaps the person's current one as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    const overlapping = await service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-03-01" });
    expect(overlapping.kind).toBe("conflict");
  });

  it("existing assignment to a version remains resolvable after that version is later RETIRED", async () => {
    const { service, unitOfWork, reader, readContext } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const assigned = await service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(assigned.kind).toBe("success");
    unitOfWork.getWorkScheduleStore().versions[0] = version({ status: "RETIRED", retiredAt: "2026-02-01T00:00:00.000Z" });
    const found = await reader.findById(readContext(), assigned.kind === "success" ? assigned.value.assignment.id : "");
    expect(found?.workScheduleVersionId).toBe("wsv1");
  });

  it("a future assignment remains pinned to its version after that version is later RETIRED (Slice 4 Decision 4)", async () => {
    const { service, unitOfWork, reader, readContext } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const assigned = await service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    expect(assigned.kind).toBe("success");
    // Version 2 becomes ACTIVE, retiring version 1 — mirrors WorkSchedule's own activateVersion outcome.
    unitOfWork.getWorkScheduleStore().versions[0] = version({ status: "RETIRED", retiredAt: "2026-02-01T00:00:00.000Z" });
    unitOfWork.getWorkScheduleStore().versions.push(version({ id: "wsv2", versionNumber: 2, activatedAt: "2026-02-01T00:00:00.000Z" }));
    const found = await reader.findById(readContext(), assigned.kind === "success" ? assigned.value.assignment.id : "");
    expect(found?.workScheduleVersionId).toBe("wsv1");
  });

  describe("deterministic validation ordering (Slice 4 Decision 10)", () => {
    it("surfaces the Organization Assignment failure, not the version-eligibility failure, when both are invalid", async () => {
      const { service, unitOfWork } = harness();
      unitOfWork.getWorkScheduleStore().versions[0] = version({ status: "DRAFT" });
      const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "ghost", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
      expect(result.kind).toBe("validation_failure");
      if (result.kind === "validation_failure") {
        expect(result.issues.some((i) => i.code === "no_organization_assignment")).toBe(true);
        expect(result.issues.some((i) => i.code === "not_active")).toBe(false);
      }
    });

    it("surfaces the version-schedule-mismatch failure before the not-active failure when both are true", async () => {
      const { service, unitOfWork } = harness();
      unitOfWork.getWorkScheduleStore().versions[0] = version({ workScheduleId: "ws-other", status: "DRAFT" });
      const result = await service.assignSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
      expect(result.kind).toBe("validation_failure");
      if (result.kind === "validation_failure") {
        expect(result.issues.some((i) => i.code === "schedule_mismatch")).toBe(true);
        expect(result.issues.some((i) => i.code === "not_active")).toBe(false);
      }
    });
  });
});

async function seedCurrent() {
  const h = harness();
  const request = requestFor(["hr_admin"], MANAGE);
  const first = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
  if (first.kind !== "success") throw new Error("seed failed");
  h.unitOfWork.getWorkScheduleStore().versions.push(version({ id: "wsv2", versionNumber: 2 }));
  return { ...h, request, firstId: first.value.assignment.id };
}

describe("ScheduleAssignmentService — transferSchedule", () => {
  it("ends the current assignment and opens a new one, atomically, forming adjacent windows", async () => {
    const { service, request, firstId, reader, readContext } = await seedCurrent();
    const result = await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv2", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.previous.id).toBe(firstId);
      expect(result.value.previous.effectiveUntil).toBe("2026-06-01");
      expect(result.value.assignment.workScheduleVersionId).toBe("wsv2");
      expect(result.value.assignment.effectiveFrom).toBe("2026-06-01");
    }
    const current = await reader.findCurrentAssignment(readContext(), "p1");
    expect(current?.workScheduleVersionId).toBe("wsv2");
  });

  it("emits an ended event for the superseded record and a created event for the new one, in that order", async () => {
    const { service, request, events } = await seedCurrent();
    const before = events.list().length;
    await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv2", effectiveFrom: "2026-06-01" });
    const names = events.list().slice(before).map((e) => e.eventName);
    expect(names).toEqual(["timekeeping.schedule_assignment.ended", "timekeeping.schedule_assignment.created"]);
  });

  it("same-timestamp transfer forms adjacent, non-overlapping windows", async () => {
    const { service, request, firstId } = await seedCurrent();
    const result = await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv2", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.previous.id).toBe(firstId);
      expect(result.value.previous.effectiveUntil).toBe(result.value.assignment.effectiveFrom);
    }
  });

  it("rejects a transfer with no current assignment to transfer from", async () => {
    const { service } = harness();
    const result = await service.transferSchedule(requestFor(["hr_admin"], MANAGE), { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a transfer whose effectiveFrom is not after the current assignment's start", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv2", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects transferring to a version that does not belong to the given work schedule", async () => {
    const { service, request, unitOfWork } = await seedCurrent();
    unitOfWork.getWorkScheduleStore().versions.push(version({ id: "wsv-other", workScheduleId: "ws-other" }));
    const result = await service.transferSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv-other", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("permits a future transfer where applicable — transferring a not-yet-started current assignment", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getOrganizationAssignments().seed("tenant-a", { personId: "p3", effectiveFrom: "2020-01-01T00:00:00.000Z" });
    unitOfWork.getWorkScheduleStore().versions.push(version({ id: "wsv2", versionNumber: 2 }));
    const request = requestFor(["hr_admin"], MANAGE);
    const first = await service.assignSchedule(request, { personId: "p3", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    expect(first.kind).toBe("success");
    const result = await service.transferSchedule(request, { personId: "p3", workScheduleId: "ws1", workScheduleVersionId: "wsv2", effectiveFrom: "2099-06-01" });
    expect(result.kind).toBe("success");
  });
});

describe("ScheduleAssignmentService — endAssignment", () => {
  it("closes a started, current assignment", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2020-01-01" });
    const result = await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2026-12-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.effectiveUntil).toBe("2026-12-01");
  });

  it("rejects ending a person with no current assignment", async () => {
    const { service } = harness();
    const result = await service.endAssignment(requestFor(["hr_admin"], MANAGE), { personId: "p1", effectiveUntil: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects ending an assignment whose effectiveFrom is still in the future", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    const result = await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2099-06-01" });
    expect(result.kind).toBe("conflict");
  });

  it("rejects an end date that is not after the assignment's start", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2020-06-01" });
    const result = await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2020-01-01" });
    expect(result.kind).toBe("validation_failure");
  });
});

describe("ScheduleAssignmentService — cancelFutureAssignment", () => {
  it("cancels a future assignment using the explicit cancellation fields, leaving the window unchanged", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    const result = await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id, cancellationReason: "Role changed" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.assignment.cancelledAt).toBeDefined();
      expect(result.value.assignment.cancelledBy).toBe("user-1");
      expect(result.value.assignment.cancellationReason).toBe("Role changed");
      expect(result.value.assignment.effectiveFrom).toBe("2099-01-01");
      expect(result.value.assignment.effectiveUntil).toBeUndefined();
    }
  });

  it("rejects cancelling an already-started assignment", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2020-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    const result = await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    expect(result.kind).toBe("conflict");
  });

  it("rejects cancelling a historical (already-ended) assignment", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2020-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2020-06-01" });
    const result = await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    expect(result.kind).toBe("conflict");
  });

  it("rejects an assignment id that does not exist", async () => {
    const { service } = harness();
    const result = await service.cancelFutureAssignment(requestFor(["hr_admin"], MANAGE), { id: "ghost" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects an already-cancelled assignment", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    const result = await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    expect(result.kind).toBe("conflict");
  });

  it("emits a future_cancelled event and an audit record", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    h.events.clear(); h.audit.clear();
    await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    expect(h.events.list().map((e) => e.eventName)).toEqual(["timekeeping.schedule_assignment.future_cancelled"]);
    expect(h.audit.list()).toHaveLength(1);
  });

  it("a cancelled row no longer blocks a replacement future assignment covering the same window", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    await h.service.cancelFutureAssignment(request, { id: created.value.assignment.id });
    const replacement = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    expect(replacement.kind).toBe("success");
  });

  it("rollback: an error mid-transaction leaves the assignment uncancelled", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.assignSchedule(request, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2099-01-01" });
    if (created.kind !== "success") throw new Error("seed failed");
    await expect(
      h.unitOfWork.execute({ tenantId: "tenant-a", correlationId: "c" }, async (tx) => {
        await tx.repositories.scheduleAssignments.cancelFuture({ tenantId: "tenant-a", id: created.value.assignment.id, cancelledBy: "user-1" });
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");
    const stillActive = h.unitOfWork.getStore().assignments.find((a) => a.id === created.value.assignment.id);
    expect(stillActive?.cancelledAt).toBeUndefined();
  });
});

describe("ScheduleAssignmentService — tenant isolation", () => {
  it("does not let tenant B see or end tenant A's current assignment", async () => {
    const h = harness("tenant-a");
    const requestA = requestFor(["hr_admin"], MANAGE, "tenant-a");
    await h.service.assignSchedule(requestA, { personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2020-01-01" });

    const requestB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const end = await h.service.endAssignment(requestB, { personId: "p1", effectiveUntil: "2026-06-01" });
    expect(end.kind).toBe("validation_failure");

    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await h.reader.findCurrentAssignment(bContext, "p1")).toBeUndefined();
  });
});
