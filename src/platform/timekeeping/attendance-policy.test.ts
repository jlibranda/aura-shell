import { describe, expect, it } from "vitest";
import {
  computeAttendancePolicyFingerprint,
  isEffectiveAsOf,
  validateAttendancePolicyContentDraft,
  validateEndAttendancePolicyInput,
  windowsOverlap,
  type AttendancePolicyContentDraft,
  type AttendancePolicyRecord,
} from "@/platform/timekeeping/attendance-policy";

function draft(overrides: Partial<AttendancePolicyContentDraft> = {}): AttendancePolicyContentDraft {
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

function record(overrides: Partial<AttendancePolicyRecord> = {}): AttendancePolicyRecord {
  return Object.freeze({
    attendancePolicyId: "lineage-1",
    attendancePolicyVersionId: "version-1",
    tenantId: "tenant-a",
    scope: "TENANT" as const,
    scopeId: "tenant-a",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    rounding: { incrementMinutes: 15, direction: "NEAREST" as const },
    gracePeriod: { lateArrivalGraceMinutes: 5, earlyDepartureGraceMinutes: 5 },
    breakRules: { unpaidBreakMinutes: 60, paidBreakMinutes: 15 },
    overtime: { dailyThresholdMinutes: 480, weeklyThresholdMinutes: 2400 },
    overtimeThresholdsAreStatutoryFloor: false,
    tolerance: { missedPunchToleranceMinutes: 10 },
    calculationAlgorithmVersion: 1,
    fingerprint: "hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "actor",
    ...overrides,
  });
}

describe("validateAttendancePolicyContentDraft", () => {
  it("accepts a fully valid draft", () => {
    const result = validateAttendancePolicyContentDraft(draft());
    expect(result.success).toBe(true);
  });

  it("accepts an optional changeReason", () => {
    const result = validateAttendancePolicyContentDraft(draft({ changeReason: "Initial baseline" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.changeReason).toBe("Initial baseline");
  });

  it("rejects an invalid effectiveFrom", () => {
    const result = validateAttendancePolicyContentDraft(draft({ effectiveFrom: "not-a-date" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized rounding direction", () => {
    const result = validateAttendancePolicyContentDraft(draft({ rounding: { incrementMinutes: 15, direction: "SIDEWAYS" } }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative rounding increment", () => {
    const result = validateAttendancePolicyContentDraft(draft({ rounding: { incrementMinutes: -5, direction: "NEAREST" } }));
    expect(result.success).toBe(false);
  });

  it("rejects a rounding increment that does not evenly divide 60", () => {
    const result = validateAttendancePolicyContentDraft(draft({ rounding: { incrementMinutes: 7, direction: "NEAREST" } }));
    expect(result.success).toBe(false);
  });

  it("accepts a zero rounding increment (no rounding)", () => {
    const result = validateAttendancePolicyContentDraft(draft({ rounding: { incrementMinutes: 0, direction: "NEAREST" } }));
    expect(result.success).toBe(true);
  });

  it("rejects a negative grace period", () => {
    const result = validateAttendancePolicyContentDraft(draft({ gracePeriod: { lateArrivalGraceMinutes: -1, earlyDepartureGraceMinutes: 0 } }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer break minutes value", () => {
    const result = validateAttendancePolicyContentDraft(draft({ breakRules: { unpaidBreakMinutes: 1.5, paidBreakMinutes: 0 } }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative overtime threshold", () => {
    const result = validateAttendancePolicyContentDraft(draft({ overtime: { dailyThresholdMinutes: -1, weeklyThresholdMinutes: 2400 } }));
    expect(result.success).toBe(false);
  });

  it("requires overtimeThresholdsAreStatutoryFloor to be an explicit boolean", () => {
    const result = validateAttendancePolicyContentDraft({ ...draft(), overtimeThresholdsAreStatutoryFloor: undefined as unknown as boolean });
    expect(result.success).toBe(false);
  });

  it("rejects a negative tolerance value", () => {
    const result = validateAttendancePolicyContentDraft(draft({ tolerance: { missedPunchToleranceMinutes: -1 } }));
    expect(result.success).toBe(false);
  });

  it("rejects a changeReason over the length limit", () => {
    const result = validateAttendancePolicyContentDraft(draft({ changeReason: "x".repeat(501) }));
    expect(result.success).toBe(false);
  });

  it("never exposes workdayBoundaryMinutes anywhere on the validated result", () => {
    const result = validateAttendancePolicyContentDraft(draft());
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/workdayBoundaryMinutes/i);
  });
});

describe("validateEndAttendancePolicyInput", () => {
  it("accepts a valid end date", () => {
    expect(validateEndAttendancePolicyInput({ effectiveUntil: "2026-06-01" }).success).toBe(true);
  });

  it("rejects an invalid end date", () => {
    expect(validateEndAttendancePolicyInput({ effectiveUntil: "not-a-date" }).success).toBe(false);
  });
});

describe("computeAttendancePolicyFingerprint", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record());
    expect(a).toBe(b);
  });

  it("changes when a resolved value changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ rounding: { incrementMinutes: 30, direction: "NEAREST" } }));
    expect(a).not.toBe(b);
  });

  it("changes when overtimeThresholdsAreStatutoryFloor changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ overtimeThresholdsAreStatutoryFloor: true }));
    expect(a).not.toBe(b);
  });

  it("changes when calculationAlgorithmVersion changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ calculationAlgorithmVersion: 2 }));
    expect(a).not.toBe(b);
  });

  it("is independent of identity, effective period, and provenance fields", () => {
    const a = computeAttendancePolicyFingerprint(record({ attendancePolicyVersionId: "version-1", effectiveFrom: "2026-01-01T00:00:00.000Z" }));
    const b = computeAttendancePolicyFingerprint(record({ attendancePolicyVersionId: "version-2", effectiveFrom: "2027-01-01T00:00:00.000Z" }));
    expect(a).toBe(b);
  });
});

describe("isEffectiveAsOf", () => {
  it("is true within an open window", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-01-01T00:00:00.000Z" }), new Date("2026-06-01"))).toBe(true);
  });

  it("is false before effectiveFrom", () => {
    expect(isEffectiveAsOf(record({ effectiveFrom: "2026-06-01T00:00:00.000Z" }), new Date("2026-01-01"))).toBe(false);
  });

  it("is false at or after effectiveUntil (exclusive upper bound)", () => {
    const policy = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    expect(isEffectiveAsOf(policy, new Date("2026-06-01T00:00:00.000Z"))).toBe(false);
    expect(isEffectiveAsOf(policy, new Date("2026-05-31T23:59:59.999Z"))).toBe(true);
  });
});

describe("windowsOverlap", () => {
  it("detects an overlap", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-03-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("treats adjacent windows as non-overlapping", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-06-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("treats two open-ended, non-overlapping-in-time windows as overlapping (both unbounded)", () => {
    const a = record({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    const b = record({ effectiveFrom: "2026-06-01T00:00:00.000Z" });
    expect(windowsOverlap(a, b)).toBe(true);
  });
});
