import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAttendanceEventUnitOfWork } from "@/platform/timekeeping/in-memory-attendance-event-unit-of-work";
import { AttendanceIngestionService, type RecordAttendanceEventInput, type RecordOwnAttendanceEventInput } from "@/platform/timekeeping/attendance-ingestion-service";
import { FixedCurrentPersonResolver } from "@/platform/timekeeping/test-doubles/current-person-resolver";

function requestFor(roles: readonly PlatformRole[], tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions: [],
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

function ownInput(overrides: Partial<RecordOwnAttendanceEventInput> = {}): RecordOwnAttendanceEventInput {
  return {
    occurredAtUtc: "2026-07-26T08:00:00.000Z",
    receivedAtUtc: "2026-07-26T08:00:01.000Z",
    source: "WEB_CLOCK",
    idempotencyKey: `idem-${Math.random()}`,
    ...overrides,
  };
}

function forPersonInput(overrides: Partial<RecordAttendanceEventInput> = {}): RecordAttendanceEventInput {
  return {
    personId: "emp-9",
    occurredAtUtc: "2026-07-26T08:00:00.000Z",
    receivedAtUtc: "2026-07-26T08:00:01.000Z",
    source: "BIOMETRIC_DEVICE",
    idempotencyKey: `idem-${Math.random()}`,
    ...overrides,
  };
}

function harness(resolvedPersonId: string = "emp-1") {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAttendanceEventUnitOfWork(undefined, events, audit);
  const resolver = new FixedCurrentPersonResolver(resolvedPersonId);
  const service = new AttendanceIngestionService(unitOfWork, resolver);
  return { service, audit, events, unitOfWork };
}

function harnessWithUnresolvedIdentity() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAttendanceEventUnitOfWork(undefined, events, audit);
  const resolver = new FixedCurrentPersonResolver();
  const service = new AttendanceIngestionService(unitOfWork, resolver);
  return { service, audit, events, unitOfWork };
}

describe("AttendanceIngestionService — recordOwnAttendanceEvent (timekeeping.clock)", () => {
  it("denies a caller without timekeeping.clock", async () => {
    const { service } = harness();
    const result = await service.recordOwnAttendanceEvent(requestFor(["auditor"]), ownInput());
    expect(result.kind).toBe("authorization_failure");
  });

  it("records the resolved person's own event and audits it", async () => {
    const { service, audit, events } = harness("emp-1");
    const result = await service.recordOwnAttendanceEvent(requestFor(["employee"]), ownInput());
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.event.personId).toBe("emp-1");
      expect(result.value.replayed).toBe(false);
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["timekeeping.attendance_event.recorded"]);
    expect(audit.list()).toHaveLength(1);
  });

  it("never accepts a caller-supplied personId — the input type has no such field", () => {
    const input = ownInput();
    expect(Object.keys(input)).not.toContain("personId");
  });

  it("fails as an infrastructure failure, not authorization, when the caller's identity cannot be resolved", async () => {
    const { service } = harnessWithUnresolvedIdentity();
    const result = await service.recordOwnAttendanceEvent(requestFor(["employee"]), ownInput());
    expect(result.kind).toBe("infrastructure_failure");
  });

  it("allows manager and hr_admin to self-clock as well", async () => {
    const { service: managerService } = harness("emp-2");
    expect((await managerService.recordOwnAttendanceEvent(requestFor(["manager"]), ownInput())).kind).toBe("success");
    const { service: adminService } = harness("emp-3");
    expect((await adminService.recordOwnAttendanceEvent(requestFor(["hr_admin"]), ownInput())).kind).toBe("success");
  });

  it("rejects an invalid draft (e.g. malformed instant) before ever touching the resolver or repository", async () => {
    const { service, unitOfWork } = harness("emp-1");
    const result = await service.recordOwnAttendanceEvent(requestFor(["employee"]), ownInput({ occurredAtUtc: "not-a-date" }));
    expect(result.kind).toBe("validation_failure");
    expect(unitOfWork.getStore().attendanceEvents).toHaveLength(0);
  });
});

describe("AttendanceIngestionService — recordAttendanceEventForPerson (timekeeping.manage)", () => {
  it("denies a caller without timekeeping.manage — including one with only timekeeping.clock", async () => {
    const { service } = harness();
    const asEmployee = await service.recordAttendanceEventForPerson(requestFor(["employee"]), forPersonInput());
    expect(asEmployee.kind).toBe("authorization_failure");
    const asAuditor = await service.recordAttendanceEventForPerson(requestFor(["auditor"]), forPersonInput());
    expect(asAuditor.kind).toBe("authorization_failure");
  });

  it("records an event for an explicitly supplied personId when authorized", async () => {
    const { service, audit, events } = harness();
    const result = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), forPersonInput({ personId: "emp-42" }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.event.personId).toBe("emp-42");
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(1);
  });

  it("does not consult CurrentPersonResolver at all for the on-behalf-of path", async () => {
    const { service } = harnessWithUnresolvedIdentity();
    const result = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), forPersonInput({ personId: "emp-42" }));
    expect(result.kind).toBe("success");
  });
});

describe("AttendanceIngestionService — idempotency (delegated to Slice 1, proven again at the service boundary)", () => {
  it("replays a same-key/same-fact resubmission with no second event or audit record", async () => {
    const { service, events, audit } = harness();
    const input = forPersonInput({ personId: "emp-7", idempotencyKey: "fixed-key-1" });
    const first = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), input);
    const second = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), input);
    expect(first.kind).toBe("success");
    expect(second.kind).toBe("success");
    if (second.kind === "success") expect(second.value.replayed).toBe(true);
    expect(events.list()).toHaveLength(1);
    expect(audit.list()).toHaveLength(1);
  });

  it("returns a conflict for a same-key/different-fact resubmission, without mutating the original", async () => {
    const { service } = harness();
    const key = "fixed-key-2";
    const first = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), forPersonInput({ personId: "emp-8", idempotencyKey: key }));
    expect(first.kind).toBe("success");
    const conflict = await service.recordAttendanceEventForPerson(requestFor(["hr_admin"]), forPersonInput({ personId: "emp-8", idempotencyKey: key, occurredAtUtc: "2026-07-26T09:00:00.000Z" }));
    expect(conflict.kind).toBe("conflict");
  });
});

describe("AttendanceIngestionService — tenant isolation", () => {
  it("scopes the created event to the caller's own tenant, never a caller-influenced one", async () => {
    const { service } = harness("emp-1");
    const result = await service.recordOwnAttendanceEvent(requestFor(["employee"], "tenant-b"), ownInput());
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.event.tenantId).toBe("tenant-b");
  });
});
