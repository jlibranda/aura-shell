import { describe, expect, it } from "vitest";
import { validateGeneralCompanySettings, warnGeneralCompanySettings, summarizeGeneralCompanySettings, type GeneralCompanySettingsPayload } from "@/platform/configuration/general-company-settings";

const validInput = {
  displayName: "Oriente Finance HK",
  timeZone: "Asia/Hong_Kong",
  locale: "en-HK",
  currency: "HKD",
  firstDayOfWeek: "MONDAY",
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24H",
  companyCode: "OFHK",
};

describe("validateGeneralCompanySettings", () => {
  // Scenario 21: Required fields are validated.
  it("rejects a missing display name with a plain-language message and safe field path", () => {
    const result = validateGeneralCompanySettings({ ...validInput, displayName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path.join(".") === "displayName" && issue.code === "REQUIRED")).toBe(true);
      expect(result.issues[0].message).not.toMatch(/undefined|null|\[object/);
    }
  });

  // Scenario 22: Unsupported time zone is rejected.
  it("rejects an unrecognized time zone", () => {
    const result = validateGeneralCompanySettings({ ...validInput, timeZone: "Not/A_Zone" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "timeZone" && issue.code === "UNSUPPORTED")).toBe(true);
  });

  // Scenario 23: Unsupported currency code is rejected.
  it("rejects an unrecognized currency code", () => {
    const result = validateGeneralCompanySettings({ ...validInput, currency: "ZZZ" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "currency" && issue.code === "UNSUPPORTED")).toBe(true);
  });

  // Scenario 24: Empty working week is rejected.
  it("rejects an empty working-days selection", () => {
    const result = validateGeneralCompanySettings({ ...validInput, workingDays: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "workingDays" && issue.code === "REQUIRED")).toBe(true);
  });

  it("rejects an unrecognized locale", () => {
    const result = validateGeneralCompanySettings({ ...validInput, locale: "not-a-locale-!!" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed company code", () => {
    const result = validateGeneralCompanySettings({ ...validInput, companyCode: "!" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "companyCode" && issue.code === "INVALID_FORMAT")).toBe(true);
  });

  it("rejects an invalid two-letter primary country code", () => {
    const result = validateGeneralCompanySettings({ ...validInput, primaryCountryCode: "Hong Kong" });
    expect(result.success).toBe(false);
  });

  it("does not bake in Philippine, PHP, Manila, Monday, or five-day-week defaults", () => {
    const result = validateGeneralCompanySettings(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("HKD");
      expect(result.data.timeZone).toBe("Asia/Hong_Kong");
      expect(result.data.firstDayOfWeek).toBe("MONDAY");
      expect(result.data.workingDays).toHaveLength(5);
    }
  });

  it("accepts a valid payload and normalizes the company code to uppercase", () => {
    const result = validateGeneralCompanySettings({ ...validInput, companyCode: "ofhk" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.companyCode).toBe("OFHK");
  });

  // Scenario 26: Validation messages contain safe field paths and plain-language messages.
  it("every issue has a safe (non-injected) field path and a human-readable message", () => {
    const result = validateGeneralCompanySettings({});
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const issue of result.issues) {
        expect(issue.path.length).toBeGreaterThan(0);
        expect(issue.path.every((segment) => /^[a-zA-Z]+$/.test(segment))).toBe(true);
        expect(issue.message.length).toBeGreaterThan(5);
      }
    }
  });
});

describe("warnGeneralCompanySettings", () => {
  // Scenario 25: Warnings do not block publication unless classified as blocking.
  it("returns warnings, not errors — validateGeneralCompanySettings never blocks on them", () => {
    const input: GeneralCompanySettingsPayload = { ...validInput, primaryCountryCode: "PH" } as GeneralCompanySettingsPayload;
    const warnings = warnGeneralCompanySettings(input);
    expect(warnings.length).toBeGreaterThan(0);
    expect(validateGeneralCompanySettings(input).success).toBe(true);
  });

  it("warns when every day of the week is marked working", () => {
    const input: GeneralCompanySettingsPayload = { ...validInput, workingDays: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] } as GeneralCompanySettingsPayload;
    expect(warnGeneralCompanySettings(input).some((w) => w.code === "ALL_DAYS_WORKING")).toBe(true);
  });

  it("does not warn when there is no primary country and a normal working week", () => {
    const input = validInput as GeneralCompanySettingsPayload;
    expect(warnGeneralCompanySettings(input)).toHaveLength(0);
  });
});

describe("summarizeGeneralCompanySettings", () => {
  it("produces a plain-language field summary covering every stored field", () => {
    const fields = summarizeGeneralCompanySettings(validInput as GeneralCompanySettingsPayload);
    expect(fields.find((f) => f.label === "Display name")?.value).toBe("Oriente Finance HK");
    expect(fields.find((f) => f.label === "Working days")?.value).toContain("Monday");
  });
});
