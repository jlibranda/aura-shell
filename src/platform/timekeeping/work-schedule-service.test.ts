import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryWorkScheduleUnitOfWork } from "@/platform/timekeeping/in-memory-work-schedule-unit-of-work";
import { WorkScheduleService } from "@/platform/timekeeping/work-schedule-service";

function requestFor(roles: readonly PlatformRole[], tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions: [],
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryWorkScheduleUnitOfWork(undefined, events, audit);
  const service = new WorkScheduleService(unitOfWork);
  return { service, audit, events, unitOfWork };
}

function fixedWeeklyVersionInput(overrides: Record<string, unknown> = {}) {
  return {
    workScheduleId: "",
    scheduleType: "FIXED_WEEKLY",
    timezoneResolutionMode: "FIXED",
    timezone: "Asia/Manila",
    weeklyPattern: {
      MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "12:00", end: "13:00" }] }],
      TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [],
    },
    ...overrides,
  };
}

const MANAGE = ["hr_admin"] as const;
const VIEW_ONLY = ["auditor"] as const;

describe("WorkScheduleService — authorization", () => {
  it("denies createWorkSchedule without timekeeping.manage", async () => {
    const { service } = harness();
    const result = await service.createWorkSchedule(requestFor(VIEW_ONLY), { code: "STD", name: "Standard" });
    expect(result.kind).toBe("authorization_failure");
  });

  it("takes no persistence or audit effect when denied", async () => {
    const { service, unitOfWork, audit, events } = harness();
    await service.createWorkSchedule(requestFor(VIEW_ONLY), { code: "STD", name: "Standard" });
    expect(unitOfWork.getStore().workSchedules).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
    expect(events.list()).toHaveLength(0);
  });
});

describe("WorkScheduleService — createWorkSchedule", () => {
  it("creates a work schedule and audits + emits an event", async () => {
    const { service, audit, events } = harness();
    const result = await service.createWorkSchedule(requestFor(MANAGE), { code: "std-day", name: "Standard Day" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.schedule.code).toBe("STD-DAY");
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.work_schedule.created"]);
    expect(audit.list()).toHaveLength(1);
  });

  it("rejects a duplicate code as a conflict", async () => {
    const { service } = harness();
    await service.createWorkSchedule(requestFor(MANAGE), { code: "STD", name: "Standard" });
    const again = await service.createWorkSchedule(requestFor(MANAGE), { code: "std", name: "Another" });
    expect(again.kind).toBe("conflict");
  });

  it("keeps schedules tenant-isolated", async () => {
    const { service, unitOfWork } = harness();
    await service.createWorkSchedule(requestFor(MANAGE, "tenant-a"), { code: "STD", name: "Standard" });
    await service.createWorkSchedule(requestFor(MANAGE, "tenant-b"), { code: "STD", name: "Standard (tenant-b)" });
    expect(unitOfWork.getStore().workSchedules).toHaveLength(2);
    expect(new Set(unitOfWork.getStore().workSchedules.map((s) => s.tenantId))).toEqual(new Set(["tenant-a", "tenant-b"]));
  });
});

describe("WorkScheduleService — updateWorkScheduleDetails", () => {
  it("updates name and description without touching code", async () => {
    const { service } = harness();
    const created = await service.createWorkSchedule(requestFor(MANAGE), { code: "STD", name: "Standard" });
    if (created.kind !== "success") throw new Error("seed failed");
    const updated = await service.updateWorkScheduleDetails(requestFor(MANAGE), { id: created.value.schedule.id, name: "Renamed", description: "New" });
    expect(updated.kind).toBe("success");
    if (updated.kind === "success") {
      expect(updated.value.schedule.name).toBe("Renamed");
      expect(updated.value.schedule.code).toBe("STD");
    }
  });
});

describe("WorkScheduleService — createWorkScheduleVersion", () => {
  async function seedSchedule(service: WorkScheduleService) {
    const created = await service.createWorkSchedule(requestFor(MANAGE), { code: "STD", name: "Standard" });
    if (created.kind !== "success") throw new Error("seed failed");
    return created.value.schedule.id;
  }

  it("creates the first version, beginning DRAFT, as version number 1", async () => {
    const { service } = harness();
    const workScheduleId = await seedSchedule(service);
    const result = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.version.status).toBe("DRAFT");
      expect(result.value.version.versionNumber).toBe(1);
      expect(result.value.version.canonicalHash).toBeTruthy();
    }
  });

  it("increases version numbers deterministically", async () => {
    const { service } = harness();
    const workScheduleId = await seedSchedule(service);
    const v1 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    const v2 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({
      workScheduleId,
      weeklyPattern: { MON: [], TUE: [{ start: "08:00", end: "16:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    }));
    expect(v1.kind).toBe("success");
    expect(v2.kind).toBe("success");
    if (v1.kind === "success" && v2.kind === "success") {
      expect(v1.value.version.versionNumber).toBe(1);
      expect(v2.value.version.versionNumber).toBe(2);
    }
  });

  it("rejects a schedule that does not exist", async () => {
    const { service } = harness();
    const result = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId: "nonexistent" }));
    expect(result.kind).toBe("validation_failure");
  });

  it("enforces the duplicate-content rule against the active version", async () => {
    const { service } = harness();
    const workScheduleId = await seedSchedule(service);
    const v1 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    if (v1.kind !== "success") throw new Error("seed failed");
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: v1.value.version.id });

    const duplicate = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    expect(duplicate.kind).toBe("conflict");
  });

  it("enforces the duplicate-content rule against another existing draft", async () => {
    const { service } = harness();
    const workScheduleId = await seedSchedule(service);
    await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    const duplicateDraft = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    expect(duplicateDraft.kind).toBe("conflict");
  });

  it("allows intentionally restoring superseded content (Version 1 -> A, Version 2 -> B, Version 3 restores A)", async () => {
    const { service } = harness();
    const workScheduleId = await seedSchedule(service);
    const contentA = fixedWeeklyVersionInput({ workScheduleId });
    const contentB = fixedWeeklyVersionInput({
      workScheduleId,
      weeklyPattern: { MON: [], TUE: [{ start: "10:00", end: "18:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    });

    const v1 = await service.createWorkScheduleVersion(requestFor(MANAGE), contentA);
    if (v1.kind !== "success") throw new Error("seed failed");
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: v1.value.version.id });

    const v2 = await service.createWorkScheduleVersion(requestFor(MANAGE), contentB);
    if (v2.kind !== "success") throw new Error("seed failed");
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: v2.value.version.id });

    // v1 (content A) is now RETIRED — restoring its exact content must be allowed.
    const v3 = await service.createWorkScheduleVersion(requestFor(MANAGE), contentA);
    expect(v3.kind).toBe("success");
    if (v3.kind === "success") expect(v3.value.version.versionNumber).toBe(3);
  });
});

describe("WorkScheduleService — replaceDraftVersionContent", () => {
  async function seedDraft(service: WorkScheduleService) {
    const created = await service.createWorkSchedule(requestFor(MANAGE), { code: "STD", name: "Standard" });
    if (created.kind !== "success") throw new Error("seed failed");
    const workScheduleId = created.value.schedule.id;
    const version = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    if (version.kind !== "success") throw new Error("seed failed");
    return { workScheduleId, versionId: version.value.version.id, originalHash: version.value.version.canonicalHash };
  }

  it("replaces a DRAFT's full content and recomputes canonicalHash", async () => {
    const { service } = harness();
    const { versionId, originalHash } = await seedDraft(service);
    const result = await service.replaceDraftVersionContent(requestFor(MANAGE), {
      versionId,
      scheduleType: "FIXED_WEEKLY",
      timezoneResolutionMode: "FIXED",
      timezone: "Asia/Manila",
      weeklyPattern: { MON: [], TUE: [{ start: "07:00", end: "15:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.version.id).toBe(versionId);
      expect(result.value.version.canonicalHash).not.toBe(originalHash);
      expect(result.value.version.status).toBe("DRAFT");
    }
  });

  it("rejects replacing ACTIVE content", async () => {
    const { service } = harness();
    const { workScheduleId, versionId } = await seedDraft(service);
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId });
    const result = await service.replaceDraftVersionContent(requestFor(MANAGE), {
      versionId,
      scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "Asia/Manila",
      weeklyPattern: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    });
    expect(result.kind).toBe("conflict");
  });

  it("rejects replacing RETIRED content", async () => {
    const { service } = harness();
    const { workScheduleId, versionId } = await seedDraft(service);
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId });
    const v2 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({
      workScheduleId,
      weeklyPattern: { MON: [], TUE: [{ start: "11:00", end: "19:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    }));
    if (v2.kind !== "success") throw new Error("seed failed");
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: v2.value.version.id });

    const result = await service.replaceDraftVersionContent(requestFor(MANAGE), {
      versionId, // now RETIRED
      scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "Asia/Manila",
      weeklyPattern: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    });
    expect(result.kind).toBe("conflict");
  });
});

describe("WorkScheduleService — activation", () => {
  async function seedTwoDrafts(service: WorkScheduleService) {
    const created = await service.createWorkSchedule(requestFor(MANAGE), { code: "STD", name: "Standard" });
    if (created.kind !== "success") throw new Error("seed failed");
    const workScheduleId = created.value.schedule.id;
    const d1 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({ workScheduleId }));
    const d2 = await service.createWorkScheduleVersion(requestFor(MANAGE), fixedWeeklyVersionInput({
      workScheduleId,
      weeklyPattern: { MON: [], TUE: [{ start: "06:00", end: "14:00", crossesMidnight: false, breaks: [] }], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
    }));
    if (d1.kind !== "success" || d2.kind !== "success") throw new Error("seed failed");
    return { workScheduleId, draft1: d1.value.version.id, draft2: d2.value.version.id };
  }

  it("activates the first DRAFT with no prior active version, emitting only version_activated", async () => {
    const { service, events, audit } = harness();
    const { workScheduleId, draft1 } = await seedTwoDrafts(service);
    events.clear(); audit.clear();

    const result = await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: draft1 });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.activated.status).toBe("ACTIVE");
      expect(result.value.retired).toBeUndefined();
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.work_schedule.version_activated"]);
    expect(audit.list()).toHaveLength(1);
  });

  it("activating a new DRAFT supersedes the old ACTIVE, atomically, leaving exactly one ACTIVE version", async () => {
    const { service, unitOfWork, events } = harness();
    const { workScheduleId, draft1, draft2 } = await seedTwoDrafts(service);
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: draft1 });
    events.clear();

    const result = await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: draft2 });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.activated.id).toBe(draft2);
      expect(result.value.retired?.id).toBe(draft1);
      expect(result.value.retired?.status).toBe("RETIRED");
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.work_schedule.version_superseded", "timekeeping.work_schedule.version_activated"]);

    const allVersions = unitOfWork.getStore().versions.filter((v) => v.workScheduleId === workScheduleId);
    expect(allVersions.filter((v) => v.status === "ACTIVE")).toHaveLength(1);
    expect(allVersions.find((v) => v.id === draft1)?.status).toBe("RETIRED");
  });

  it("rejects activating an already-ACTIVE or RETIRED version", async () => {
    const { service } = harness();
    const { workScheduleId, draft1 } = await seedTwoDrafts(service);
    await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: draft1 });
    const again = await service.activateWorkScheduleVersion(requestFor(MANAGE), { workScheduleId, versionId: draft1 });
    expect(again.kind).toBe("conflict");
  });
});
