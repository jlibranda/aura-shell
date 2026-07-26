import { describe, expect, it } from "vitest";
import { isSameAttendanceFact, validateCreateAttendanceEventDraft } from "@/platform/timekeeping/attendance-event";

function draft(overrides: Partial<Parameters<typeof validateCreateAttendanceEventDraft>[0]> = {}) {
  return {
    personId: "emp-1",
    occurredAtUtc: "2026-07-26T08:00:00.000Z",
    receivedAtUtc: "2026-07-26T08:00:01.000Z",
    source: "WEB_CLOCK",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

describe("validateCreateAttendanceEventDraft", () => {
  it("accepts a minimal valid draft", () => {
    const result = validateCreateAttendanceEventDraft(draft());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("WEB_CLOCK");
      expect(result.data.sourceRef).toBeUndefined();
      expect(result.data.eventType).toBeUndefined();
    }
  });

  it("accepts every declared source channel, normalized to upper case", () => {
    for (const source of ["biometric_device", "WEB_CLOCK", "Mobile", "QR", "kiosk", "API", "import", "SYSTEM"]) {
      const result = validateCreateAttendanceEventDraft(draft({ source }));
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unrecognized source", () => {
    const result = validateCreateAttendanceEventDraft(draft({ source: "CARRIER_PIGEON" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "source" && i.code === "INVALID_FORMAT")).toBe(true);
  });

  it("requires personId", () => {
    const result = validateCreateAttendanceEventDraft(draft({ personId: "" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "personId" && i.code === "REQUIRED")).toBe(true);
  });

  it("requires a valid occurredAtUtc instant", () => {
    for (const bad of ["", "not-a-date", "2026-07-26", "2026-07-26T08:00:00"]) {
      const result = validateCreateAttendanceEventDraft(draft({ occurredAtUtc: bad }));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "occurredAtUtc")).toBe(true);
    }
  });

  it("requires a valid receivedAtUtc instant", () => {
    const result = validateCreateAttendanceEventDraft(draft({ receivedAtUtc: "garbage" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "receivedAtUtc")).toBe(true);
  });

  it("does NOT reject a receivedAtUtc earlier than occurredAtUtc — clock skew is a forensic concern, not a validation failure", () => {
    const result = validateCreateAttendanceEventDraft(draft({ occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T07:59:00.000Z" }));
    expect(result.success).toBe(true);
  });

  it("accepts every declared event type, and rejects an unrecognized one", () => {
    for (const eventType of ["CLOCK_IN", "clock_out", "Break_Start", "BREAK_END", "UNKNOWN"]) {
      expect(validateCreateAttendanceEventDraft(draft({ eventType })).success).toBe(true);
    }
    const result = validateCreateAttendanceEventDraft(draft({ eventType: "TELEPORT" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "eventType" && i.code === "INVALID_FORMAT")).toBe(true);
  });

  it("treats an empty-string eventType/sourceRef as absent, not invalid", () => {
    const result = validateCreateAttendanceEventDraft(draft({ eventType: "  ", sourceRef: "" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventType).toBeUndefined();
      expect(result.data.sourceRef).toBeUndefined();
    }
  });

  it("normalizes and bounds sourceRef", () => {
    const result = validateCreateAttendanceEventDraft(draft({ sourceRef: "  device-42  " }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sourceRef).toBe("device-42");

    const tooLong = validateCreateAttendanceEventDraft(draft({ sourceRef: "x".repeat(201) }));
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.issues.some((i) => i.path.join(".") === "sourceRef" && i.code === "TOO_LONG")).toBe(true);
  });

  it("requires idempotencyKey and bounds its length", () => {
    const missing = validateCreateAttendanceEventDraft(draft({ idempotencyKey: "" }));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.issues.some((i) => i.path.join(".") === "idempotencyKey" && i.code === "REQUIRED")).toBe(true);

    const tooLong = validateCreateAttendanceEventDraft(draft({ idempotencyKey: "x".repeat(201) }));
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.issues.some((i) => i.path.join(".") === "idempotencyKey" && i.code === "TOO_LONG")).toBe(true);
  });

  it("never accepts a payable/interpretation field — the type itself has no such field to accept", () => {
    const result = validateCreateAttendanceEventDraft(draft());
    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data);
      for (const forbidden of ["payableHours", "lateness", "overtime", "undertime", "scheduleResult", "policyResult", "payrollAmount"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});

describe("isSameAttendanceFact", () => {
  it("treats two drafts with identical fields as the same fact", () => {
    expect(isSameAttendanceFact(
      { personId: "emp-1", occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "WEB_CLOCK", idempotencyKey: "idem-1" },
      { personId: "emp-1", occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "WEB_CLOCK", idempotencyKey: "idem-1" },
    )).toBe(true);
  });

  it("treats an absent optional field on one side and an absent optional field on the other as equal (both normalize to undefined)", () => {
    expect(isSameAttendanceFact(
      { personId: "emp-1", occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "WEB_CLOCK", idempotencyKey: "idem-1" },
      { personId: "emp-1", occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "WEB_CLOCK", idempotencyKey: "idem-1", sourceRef: undefined, eventType: undefined },
    )).toBe(true);
  });

  it("treats a difference in any single field as a different fact", () => {
    const base = { personId: "emp-1", occurredAtUtc: "2026-07-26T08:00:00.000Z", receivedAtUtc: "2026-07-26T08:00:01.000Z", source: "WEB_CLOCK" as const, idempotencyKey: "idem-1" };
    expect(isSameAttendanceFact(base, { ...base, personId: "emp-2" })).toBe(false);
    expect(isSameAttendanceFact(base, { ...base, occurredAtUtc: "2026-07-26T09:00:00.000Z" })).toBe(false);
    expect(isSameAttendanceFact(base, { ...base, eventType: "CLOCK_IN" })).toBe(false);
    expect(isSameAttendanceFact(base, { ...base, sourceRef: "device-1" })).toBe(false);
  });
});
