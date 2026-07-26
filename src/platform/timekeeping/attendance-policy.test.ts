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
    roundingIntervalMinutes: 15,
    roundingDirection: "nearest",
    gracePeriodMinutes: 5,
    latenessToleranceMinutes: 10,
    unpaidBreakMinutes: 60,
    standardWorkWeekMinutes: 2400,
    isStandardWorkWeekStatutoryFloor: false,
    dailyOvertimeThresholdMinutes: 480,
    ...overrides,
  };
}

function record(overrides: Partial<AttendancePolicyRecord> = {}): AttendancePolicyRecord {
  return Object.freeze({
    policyId: "lineage-1",
    policyVersionId: "version-1",
    tenantId: "tenant-a",
    scope: "TENANT" as const,
    scopeId: "tenant-a",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    roundingIntervalMinutes: 15,
    roundingDirection: "nearest" as const,
    gracePeriodMinutes: 5,
    latenessToleranceMinutes: 10,
    unpaidBreakMinutes: 60,
    standardWorkWeekMinutes: 2400,
    isStandardWorkWeekStatutoryFloor: false,
    dailyOvertimeThresholdMinutes: 480,
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

  it("accepts a draft omitting the optional unpaidBreakMinutes/dailyOvertimeThresholdMinutes fields", () => {
    const result = validateAttendancePolicyContentDraft(draft({ unpaidBreakMinutes: undefined, dailyOvertimeThresholdMinutes: undefined }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unpaidBreakMinutes).toBeUndefined();
      expect(result.data.dailyOvertimeThresholdMinutes).toBeUndefined();
    }
  });

  it("accepts an optional changeReason", () => {
    const result = validateAttendancePolicyContentDraft(draft({ changeReason: "Initial baseline" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.changeReason).toBe("Initial baseline");
  });

  it("normalizes roundingDirection casing to lowercase", () => {
    const result = validateAttendancePolicyContentDraft(draft({ roundingDirection: "NEAREST" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roundingDirection).toBe("nearest");
  });

  it("rejects an invalid effectiveFrom", () => {
    const result = validateAttendancePolicyContentDraft(draft({ effectiveFrom: "not-a-date" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized rounding direction", () => {
    const result = validateAttendancePolicyContentDraft(draft({ roundingDirection: "sideways" }));
    expect(result.success).toBe(false);
  });

  it("rejects a zero roundingIntervalMinutes — the approved contract requires roundingIntervalMinutes > 0", () => {
    const result = validateAttendancePolicyContentDraft(draft({ roundingIntervalMinutes: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative roundingIntervalMinutes", () => {
    const result = validateAttendancePolicyContentDraft(draft({ roundingIntervalMinutes: -5 }));
    expect(result.success).toBe(false);
  });

  it("accepts a roundingIntervalMinutes that does NOT evenly divide 60 — no divisibility rule is authorized", () => {
    const result = validateAttendancePolicyContentDraft(draft({ roundingIntervalMinutes: 7 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roundingIntervalMinutes).toBe(7);
  });

  it("rejects a negative gracePeriodMinutes", () => {
    const result = validateAttendancePolicyContentDraft(draft({ gracePeriodMinutes: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative latenessToleranceMinutes", () => {
    const result = validateAttendancePolicyContentDraft(draft({ latenessToleranceMinutes: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer unpaidBreakMinutes when provided", () => {
    const result = validateAttendancePolicyContentDraft(draft({ unpaidBreakMinutes: 1.5 }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative standardWorkWeekMinutes", () => {
    const result = validateAttendancePolicyContentDraft(draft({ standardWorkWeekMinutes: -1 }));
    expect(result.success).toBe(false);
  });

  it("requires isStandardWorkWeekStatutoryFloor to be an explicit boolean", () => {
    const result = validateAttendancePolicyContentDraft({ ...draft(), isStandardWorkWeekStatutoryFloor: undefined as unknown as boolean });
    expect(result.success).toBe(false);
  });

  it("rejects a negative dailyOvertimeThresholdMinutes when provided", () => {
    const result = validateAttendancePolicyContentDraft(draft({ dailyOvertimeThresholdMinutes: -1 }));
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

  it("changes when roundingIntervalMinutes changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ roundingIntervalMinutes: 30 }));
    expect(a).not.toBe(b);
  });

  it("changes when roundingDirection changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ roundingDirection: "up" }));
    expect(a).not.toBe(b);
  });

  it("changes when isStandardWorkWeekStatutoryFloor changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ isStandardWorkWeekStatutoryFloor: true }));
    expect(a).not.toBe(b);
  });

  it("changes when calculationAlgorithmVersion changes", () => {
    const a = computeAttendancePolicyFingerprint(record());
    const b = computeAttendancePolicyFingerprint(record({ calculationAlgorithmVersion: 2 }));
    expect(a).not.toBe(b);
  });

  it("changes when an absent optional value becomes present (undefined normalizes to null, not to the same fingerprint as a present zero)", () => {
    const withField = computeAttendancePolicyFingerprint(record({ unpaidBreakMinutes: 0 }));
    const withoutField = computeAttendancePolicyFingerprint(record({ unpaidBreakMinutes: undefined }));
    expect(withField).not.toBe(withoutField);
  });

  it("is identical for two omissions of the same optional field regardless of other object shape", () => {
    const a = computeAttendancePolicyFingerprint(record({ unpaidBreakMinutes: undefined, dailyOvertimeThresholdMinutes: undefined }));
    const b = computeAttendancePolicyFingerprint(record({ unpaidBreakMinutes: undefined, dailyOvertimeThresholdMinutes: undefined }));
    expect(a).toBe(b);
  });

  it("is independent of identity, scope, effective period, and provenance fields", () => {
    const a = computeAttendancePolicyFingerprint(record({ policyVersionId: "version-1", scopeId: "tenant-a", effectiveFrom: "2026-01-01T00:00:00.000Z" }));
    const b = computeAttendancePolicyFingerprint(record({ policyVersionId: "version-2", scopeId: "tenant-b", effectiveFrom: "2027-01-01T00:00:00.000Z" }));
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
