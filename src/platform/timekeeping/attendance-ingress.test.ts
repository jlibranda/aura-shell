import { describe, expect, it } from "vitest";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { InMemoryAttendanceEventUnitOfWork } from "@/platform/timekeeping/in-memory-attendance-event-unit-of-work";
import { AttendanceIngestionService } from "@/platform/timekeeping/attendance-ingestion-service";
import { FixedCurrentPersonResolver } from "@/platform/timekeeping/test-doubles/current-person-resolver";
import { GenericAttendanceIngress } from "@/platform/timekeeping/test-doubles/attendance-ingress";

function request(roles: readonly ("hr_admin" | "employee")[] = ["employee"]) {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions: [],
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

describe("AttendanceIngress -> AttendanceIngestionService wiring", () => {
  it("normalizes a self-submission payload (no personId) and reaches the self-clock path", async () => {
    const unitOfWork = new InMemoryAttendanceEventUnitOfWork();
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver("emp-1"));
    const ingress = new GenericAttendanceIngress(service);

    const result = await ingress.submit(request(["employee"]), {
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "WEB_CLOCK",
      idempotencyKey: "ingress-key-1",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.event.personId).toBe("emp-1");
  });

  it("normalizes an on-behalf-of payload (explicit personId) and reaches the for-person path", async () => {
    const unitOfWork = new InMemoryAttendanceEventUnitOfWork();
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver());
    const ingress = new GenericAttendanceIngress(service);

    const result = await ingress.submit(request(["hr_admin"]), {
      personId: "emp-99",
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "BIOMETRIC_DEVICE",
      idempotencyKey: "ingress-key-2",
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.event.personId).toBe("emp-99");
  });

  it("propagates an authorization failure from the service unchanged", async () => {
    const unitOfWork = new InMemoryAttendanceEventUnitOfWork();
    const service = new AttendanceIngestionService(unitOfWork, new FixedCurrentPersonResolver("emp-1"));
    const ingress = new GenericAttendanceIngress(service);

    const result = await ingress.submit(request(["employee"]), {
      personId: "emp-99",
      occurredAtUtc: "2026-07-26T08:00:00.000Z",
      receivedAtUtc: "2026-07-26T08:00:01.000Z",
      source: "BIOMETRIC_DEVICE",
      idempotencyKey: "ingress-key-3",
    });

    expect(result.kind).toBe("authorization_failure");
  });
});
