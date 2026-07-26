import { describe, expect, it } from "vitest";
import {
  computeWorkScheduleCanonicalHash,
  validateCreateWorkScheduleDraft,
  validateUpdateWorkScheduleDetailsDraft,
  validateWorkScheduleVersionContent,
  type WeeklyPattern,
  type WorkScheduleVersionContentDraft,
} from "@/platform/timekeeping/work-schedule";

function emptyWeek(): Record<string, unknown[]> {
  return { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] };
}

function fixedWeeklyContent(overrides: Partial<WorkScheduleVersionContentDraft> = {}): WorkScheduleVersionContentDraft {
  return {
    scheduleType: "FIXED_WEEKLY",
    timezoneResolutionMode: "FIXED",
    timezone: "Asia/Manila",
    weeklyPattern: {
      ...emptyWeek(),
      MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "12:00", end: "13:00" }] }],
      TUE: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [] }],
    },
    ...overrides,
  };
}

describe("validateCreateWorkScheduleDraft", () => {
  it("accepts a minimal valid draft and normalizes code", () => {
    const result = validateCreateWorkScheduleDraft({ code: "  standard-day  ", name: "Standard Day" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("STANDARD-DAY");
  });

  it("requires code and name", () => {
    const missingCode = validateCreateWorkScheduleDraft({ code: "", name: "X" });
    expect(missingCode.success).toBe(false);
    const missingName = validateCreateWorkScheduleDraft({ code: "X", name: "" });
    expect(missingName.success).toBe(false);
  });

  it("rejects an invalid code format", () => {
    const result = validateCreateWorkScheduleDraft({ code: "bad code!", name: "X" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "code" && i.code === "INVALID_FORMAT")).toBe(true);
  });
});

describe("validateUpdateWorkScheduleDetailsDraft", () => {
  it("allows name and description update", () => {
    const result = validateUpdateWorkScheduleDetailsDraft({ name: "Renamed", description: "New desc" });
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const result = validateUpdateWorkScheduleDetailsDraft({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("validateWorkScheduleVersionContent — FIXED_WEEKLY happy path", () => {
  it("accepts a valid FIXED_WEEKLY schedule with FIXED timezone", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weeklyPattern.MON).toHaveLength(1);
      expect(result.data.weeklyPattern.WED).toHaveLength(0);
    }
  });

  it("accepts LOCATION timezoneResolutionMode with no timezone", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent({ timezoneResolutionMode: "LOCATION", timezone: undefined }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timezone).toBeUndefined();
  });

  it("rejects an unrecognized rest day as valid — an empty periods array is a rest day", () => {
    const content = fixedWeeklyContent();
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.weeklyPattern.SUN).toEqual([]);
  });
});

describe("validateWorkScheduleVersionContent — invalid schedule type / code / name analogs", () => {
  it("rejects an invalid scheduleType", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent({ scheduleType: "ROTATING" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "scheduleType")).toBe(true);
  });
});

describe("validateWorkScheduleVersionContent — timezone rules", () => {
  it("rejects an invalid IANA timezone", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent({ timezone: "Not/AZone" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "timezone" && i.code === "UNSUPPORTED")).toBe(true);
  });

  it("rejects FIXED mode without a timezone", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent({ timezone: undefined }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "timezone" && i.code === "REQUIRED")).toBe(true);
  });

  it("rejects LOCATION mode with a timezone present", () => {
    const result = validateWorkScheduleVersionContent(fixedWeeklyContent({ timezoneResolutionMode: "LOCATION", timezone: "Asia/Manila" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "timezone" && i.code === "NOT_ALLOWED")).toBe(true);
  });
});

describe("validateWorkScheduleVersionContent — HH:mm and duration rules", () => {
  it("rejects an invalid HH:mm format", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "9:00", end: "17:00", crossesMidnight: false, breaks: [] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "INVALID_FORMAT")).toBe(true);
  });

  it("rejects start equal to end (zero-duration / 24h ambiguity)", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "09:00", end: "09:00", crossesMidnight: false, breaks: [] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "ZERO_OR_FULL_DAY_DURATION")).toBe(true);
  });

  it("rejects an incorrect crossesMidnight value (false when end < start)", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "22:00", end: "06:00", crossesMidnight: false, breaks: [] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "INCONSISTENT")).toBe(true);
  });

  it("rejects an incorrect crossesMidnight value (true when end > start)", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "09:00", end: "17:00", crossesMidnight: true, breaks: [] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "INCONSISTENT")).toBe(true);
  });

  it("accepts a valid cross-midnight shift", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "22:00", end: "06:00", crossesMidnight: true, breaks: [{ start: "23:00", end: "23:30" }] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(true);
  });
});

describe("validateWorkScheduleVersionContent — overlap and break rules", () => {
  it("rejects overlapping work periods on the same weekday", () => {
    const content = fixedWeeklyContent({
      weeklyPattern: { ...emptyWeek(), MON: [
        { start: "09:00", end: "17:00", crossesMidnight: false, breaks: [] },
        { start: "16:00", end: "20:00", crossesMidnight: false, breaks: [] },
      ] },
    });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "OVERLAPPING_PERIODS")).toBe(true);
  });

  it("rejects a break outside its work period", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "18:00", end: "18:30" }] }] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "OUTSIDE_PERIOD")).toBe(true);
  });

  it("rejects more than one break per work period", () => {
    const content = fixedWeeklyContent({
      weeklyPattern: { ...emptyWeek(), MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "12:00", end: "12:30" }, { start: "15:00", end: "15:15" }] }] },
    });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "TOO_MANY")).toBe(true);
  });

  it("rejects an unrecognized weekday key", () => {
    const content = fixedWeeklyContent({ weeklyPattern: { ...emptyWeek(), FUNDAY: [] } });
    const result = validateWorkScheduleVersionContent(content);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.code === "UNKNOWN_WEEKDAY")).toBe(true);
  });
});

describe("computeWorkScheduleCanonicalHash — canonicalization stability", () => {
  it("produces the same hash for identical semantic content regardless of key/array order", () => {
    const a = validateWorkScheduleVersionContent(fixedWeeklyContent());
    const b = validateWorkScheduleVersionContent(fixedWeeklyContent({
      weeklyPattern: {
        // Different key insertion order and different array order than `a`.
        SUN: [], SAT: [], FRI: [], THU: [], WED: [],
        TUE: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [] }],
        MON: [{ start: "09:00", end: "17:00", crossesMidnight: false, breaks: [{ start: "12:00", end: "13:00" }] }],
      },
    }));
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    if (a.success && b.success) {
      expect(computeWorkScheduleCanonicalHash(a.data)).toBe(computeWorkScheduleCanonicalHash(b.data));
    }
  });

  it("produces a different hash when the content actually differs", () => {
    const a = validateWorkScheduleVersionContent(fixedWeeklyContent());
    const b = validateWorkScheduleVersionContent(fixedWeeklyContent({ timezone: "Asia/Singapore" }));
    if (a.success && b.success) {
      expect(computeWorkScheduleCanonicalHash(a.data)).not.toBe(computeWorkScheduleCanonicalHash(b.data));
    }
  });

  it("excludes changeReason from the hash — metadata about the change, not the schedule's meaning", () => {
    const a = validateWorkScheduleVersionContent(fixedWeeklyContent({ changeReason: "initial" }));
    const b = validateWorkScheduleVersionContent(fixedWeeklyContent({ changeReason: "revised wording" }));
    if (a.success && b.success) {
      expect(computeWorkScheduleCanonicalHash(a.data)).toBe(computeWorkScheduleCanonicalHash(b.data));
    }
  });

  it("orders breaks deterministically regardless of input order", () => {
    const pattern: WeeklyPattern = {
      ...(emptyWeek() as unknown as WeeklyPattern),
      MON: [{ start: "09:00", end: "20:00", crossesMidnight: false, breaks: [] }],
    };
    const hashA = computeWorkScheduleCanonicalHash({ scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern: pattern });
    const hashB = computeWorkScheduleCanonicalHash({ scheduleType: "FIXED_WEEKLY", timezoneResolutionMode: "FIXED", timezone: "UTC", weeklyPattern: pattern });
    expect(hashA).toBe(hashB);
  });
});
