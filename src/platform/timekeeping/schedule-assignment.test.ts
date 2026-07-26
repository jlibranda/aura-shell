import { describe, expect, it } from "vitest";
import {
  isCancelled,
  isEffectiveAsOf,
  validateAssignScheduleInput,
  validateCancelFutureAssignmentInput,
  validateEndAssignmentInput,
  validateTransferScheduleInput,
  windowsOverlap,
  type ScheduleAssignmentRecord,
} from "@/platform/timekeeping/schedule-assignment";

function record(overrides: Partial<ScheduleAssignmentRecord> = {}): ScheduleAssignmentRecord {
  return Object.freeze({
    id: "sa1", tenantId: "tenant-a", personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1",
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor",
    ...overrides,
  });
}

describe("validateAssignScheduleInput", () => {
  it("accepts a valid open-ended assignment", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("accepts an optional changeReason", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", changeReason: "Initial schedule" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.changeReason).toBe("Initial schedule");
  });

  it("rejects a missing personId", () => {
    const result = validateAssignScheduleInput({ personId: "", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing workScheduleId", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing workScheduleVersionId", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid effectiveFrom", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects a changeReason over the length limit", () => {
    const result = validateAssignScheduleInput({ personId: "p1", workScheduleId: "ws1", workScheduleVersionId: "wsv1", effectiveFrom: "2026-01-01", changeReason: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("transferSchedule shares the identical validator as assignSchedule", () => {
    expect(validateTransferScheduleInput).toBe(validateAssignScheduleInput);
  });
});

describe("validateEndAssignmentInput", () => {
  it("accepts a valid end input", () => {
    expect(validateEndAssignmentInput({ personId: "p1", effectiveUntil: "2026-06-01" }).success).toBe(true);
  });

  it("rejects a missing personId", () => {
    expect(validateEndAssignmentInput({ personId: "", effectiveUntil: "2026-06-01" }).success).toBe(false);
  });

  it("rejects an invalid effectiveUntil", () => {
    expect(validateEndAssignmentInput({ personId: "p1", effectiveUntil: "not-a-date" }).success).toBe(false);
  });
});

describe("validateCancelFutureAssignmentInput", () => {
  it("accepts a valid cancel input with no reason", () => {
    const result = validateCancelFutureAssignmentInput({ id: "sa1" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid cancel input with a reason", () => {
    const result = validateCancelFutureAssignmentInput({ id: "sa1", cancellationReason: "Role changed before start" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cancellationReason).toBe("Role changed before start");
  });

  it("rejects a missing id", () => {
    expect(validateCancelFutureAssignmentInput({ id: "" }).success).toBe(false);
  });

  it("rejects a cancellationReason over the length limit", () => {
    expect(validateCancelFutureAssignmentInput({ id: "sa1", cancellationReason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("isCancelled", () => {
  it("is false when cancelledAt is absent", () => {
    expect(isCancelled(record())).toBe(false);
  });

  it("is true when cancelledAt is present", () => {
    expect(isCancelled(record({ cancelledAt: "2026-01-15T00:00:00.000Z" }))).toBe(true);
  });
});

describe("isEffectiveAsOf — [) boundary semantics", () => {
  it("is effective exactly at effectiveFrom (inclusive)", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z" }), new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("is not effective before effectiveFrom", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z" }), new Date("2025-12-31T23:59:59.999Z"))).toBe(false);
  });

  it("is not effective exactly at effectiveUntil (exclusive)", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }), new Date("2026-06-01T00:00:00.000Z"))).toBe(false);
  });

  it("is effective the instant before effectiveUntil", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }), new Date("2026-05-31T23:59:59.999Z"))).toBe(true);
  });

  it("is effective indefinitely when effectiveUntil is absent", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z" }), new Date("2099-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("a cancelled assignment is never effective, even within its window", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z", cancelledAt: "2025-12-01T00:00:00.000Z" }), new Date("2026-03-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("windowsOverlap — [) boundary semantics", () => {
  it("two identical open-ended windows overlap", () => {
    expect(windowsOverlap(record({ effectiveFrom: "2026-01-01" }), record({ effectiveFrom: "2026-01-01" }))).toBe(true);
  });

  it("adjacent windows (a.until === b.from) do not overlap", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-06-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("overlapping bounded windows overlap", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-03-01T00:00:00.000Z", effectiveUntil: "2026-09-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("an open-ended window overlaps any later bounded window that starts before it would end (i.e. always, since it never ends)", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-06-01T00:00:00.000Z", effectiveUntil: "2026-09-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("a cancelled assignment never overlaps anything, even an identical window", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", cancelledAt: "2025-12-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(false);
    expect(windowsOverlap(b, a)).toBe(false);
  });
});
