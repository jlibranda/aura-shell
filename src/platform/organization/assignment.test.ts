import { describe, expect, it } from "vitest";
import {
  isEffectiveAsOf,
  primaryAsOf,
  validateAssignPrimary,
  validateEndAssignment,
  validateTransfer,
  windowsOverlap,
  type AssignmentRecord,
} from "@/platform/organization/assignment";

function assignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return Object.freeze({
    id: "a1", tenantId: "t1", personId: "p1", legalEntityId: "le1", orgUnitId: "ou1", isPrimary: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("validateAssignPrimary", () => {
  it("accepts a valid draft", () => {
    const result = validateAssignPrimary({ personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing person and org unit", () => {
    const result = validateAssignPrimary({ personId: "", orgUnitId: "", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path.join(".") === "personId" && i.code === "REQUIRED")).toBe(true);
      expect(result.issues.some((i) => i.path.join(".") === "orgUnitId" && i.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects an invalid effectiveFrom date", () => {
    const result = validateAssignPrimary({ personId: "p1", orgUnitId: "ou1", effectiveFrom: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "INVALID_DATE")).toBe(true);
  });

  it("rejects a person who is their own manager", () => {
    const result = validateAssignPrimary({ personId: "p1", orgUnitId: "ou1", managerId: "p1", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "SELF_MANAGER")).toBe(true);
  });

  it("accepts a manager different from the person", () => {
    const result = validateAssignPrimary({ personId: "p1", orgUnitId: "ou1", managerId: "p2", effectiveFrom: "2026-01-01" });
    expect(result.success).toBe(true);
  });
});

describe("validateTransfer", () => {
  it("shares the same validation as validateAssignPrimary", () => {
    expect(validateTransfer({ personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" }).success).toBe(true);
    expect(validateTransfer({ personId: "", orgUnitId: "ou1", effectiveFrom: "2026-01-01" }).success).toBe(false);
  });
});

describe("validateEndAssignment", () => {
  it("accepts a valid end", () => {
    expect(validateEndAssignment({ personId: "p1", effectiveUntil: "2026-06-01" }).success).toBe(true);
  });

  it("rejects a missing person or invalid date", () => {
    expect(validateEndAssignment({ personId: "", effectiveUntil: "2026-06-01" }).success).toBe(false);
    expect(validateEndAssignment({ personId: "p1", effectiveUntil: "nope" }).success).toBe(false);
  });
});

describe("isEffectiveAsOf", () => {
  it("is effective on and after effectiveFrom", () => {
    const a = assignment({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(isEffectiveAsOf(a, new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
    expect(isEffectiveAsOf(a, new Date("2025-12-31T23:59:59.999Z"))).toBe(false);
  });

  it("is not effective at or after effectiveUntil (half-open window)", () => {
    const a = assignment({ effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" });
    expect(isEffectiveAsOf(a, new Date("2026-05-31T23:59:59.999Z"))).toBe(true);
    expect(isEffectiveAsOf(a, new Date("2026-06-01T00:00:00.000Z"))).toBe(false);
    expect(isEffectiveAsOf(a, new Date("2026-06-02T00:00:00.000Z"))).toBe(false);
  });

  it("with no effectiveUntil, remains effective indefinitely", () => {
    const a = assignment({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(isEffectiveAsOf(a, new Date("2099-01-01T00:00:00.000Z"))).toBe(true);
  });
});

describe("windowsOverlap", () => {
  it("detects overlapping windows", () => {
    const a = { effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" };
    const b = { effectiveFrom: "2026-03-01T00:00:00.000Z", effectiveUntil: "2026-09-01T00:00:00.000Z" };
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("treats adjacent windows (a.until === b.from) as non-overlapping", () => {
    const a = { effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" };
    const b = { effectiveFrom: "2026-06-01T00:00:00.000Z", effectiveUntil: undefined };
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("treats fully separate windows as non-overlapping", () => {
    const a = { effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-02-01T00:00:00.000Z" };
    const b = { effectiveFrom: "2026-06-01T00:00:00.000Z", effectiveUntil: undefined };
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("treats two open-ended windows as overlapping", () => {
    const a = { effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: undefined };
    const b = { effectiveFrom: "2026-06-01T00:00:00.000Z", effectiveUntil: undefined };
    expect(windowsOverlap(a, b)).toBe(true);
  });
});

describe("primaryAsOf", () => {
  it("finds the primary assignment in force at a given instant", () => {
    const list = [
      assignment({ id: "a1", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
      assignment({ id: "a2", effectiveFrom: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(primaryAsOf(list, new Date("2026-03-01T00:00:00.000Z"))?.id).toBe("a1");
    expect(primaryAsOf(list, new Date("2026-07-01T00:00:00.000Z"))?.id).toBe("a2");
  });

  it("returns undefined when nothing is effective yet or is non-primary", () => {
    const list = [assignment({ isPrimary: false }), assignment({ effectiveFrom: "2099-01-01T00:00:00.000Z" })];
    expect(primaryAsOf(list, new Date("2026-01-01T00:00:00.000Z"))).toBeUndefined();
  });
});
