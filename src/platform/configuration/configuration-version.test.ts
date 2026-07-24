import { describe, expect, it } from "vitest";
import { isCurrentlyEffective, isScheduled } from "@/platform/configuration/configuration-version";

const now = new Date("2026-07-24T00:00:00.000Z");

describe("isScheduled", () => {
  // Scenario 38 (logic level): scheduled version is visibly identified.
  it("is true for a published version whose effectiveFrom is in the future", () => {
    expect(isScheduled({ status: "PUBLISHED", effectiveFrom: "2026-09-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("is false for a published version whose effectiveFrom has already passed", () => {
    expect(isScheduled({ status: "PUBLISHED", effectiveFrom: "2026-01-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("is false for a draft, even with a future effectiveFrom", () => {
    expect(isScheduled({ status: "DRAFT", effectiveFrom: "2026-09-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("is false when there is no effectiveFrom at all", () => {
    expect(isScheduled({ status: "PUBLISHED", effectiveFrom: undefined }, now)).toBe(false);
  });
});

describe("isCurrentlyEffective", () => {
  it("is true once effectiveFrom has passed and there is no effectiveUntil", () => {
    expect(isCurrentlyEffective({ status: "PUBLISHED", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: undefined }, now)).toBe(true);
  });

  it("is false before effectiveFrom arrives (a scheduled version is not yet effective)", () => {
    expect(isCurrentlyEffective({ status: "PUBLISHED", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveUntil: undefined }, now)).toBe(false);
  });

  // Scenario 19: Retired version is not treated as currently effective.
  it("is false for a retired version even within its effective date range", () => {
    expect(isCurrentlyEffective({ status: "RETIRED", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: undefined }, now)).toBe(false);
  });

  it("is false once effectiveUntil has passed", () => {
    expect(isCurrentlyEffective({ status: "PUBLISHED", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("is true strictly within an effectiveFrom/effectiveUntil window", () => {
    expect(isCurrentlyEffective({ status: "PUBLISHED", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-12-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("is false for a draft", () => {
    expect(isCurrentlyEffective({ status: "DRAFT", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: undefined }, now)).toBe(false);
  });
});
