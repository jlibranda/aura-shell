import { describe, expect, it } from "vitest";
import { validateCreateLocationDraft, validateUpdateLocationDetails } from "@/platform/organization/location";

const VALID_ADDRESS = { line1: "123 Ayala Ave", city: "Makati", region: "NCR", postalCode: "1226" };

describe("validateCreateLocationDraft", () => {
  it("accepts a valid draft and normalizes code (trim + uppercase) and country (uppercase)", () => {
    const result = validateCreateLocationDraft({ code: " hq ", name: " Head Office ", address: VALID_ADDRESS, countryCode: "ph", timezone: "Asia/Manila" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("HQ");
      expect(result.data.name).toBe("Head Office");
      expect(result.data.countryCode).toBe("PH");
    }
  });

  it("trims optional address fields and omits empty ones", () => {
    const result = validateCreateLocationDraft({ code: "HQ", name: "Head Office", address: { line1: " 123 Ayala Ave ", city: " Makati ", line2: "  ", region: "  " }, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address.line1).toBe("123 Ayala Ave");
      expect(result.data.address.city).toBe("Makati");
      expect(result.data.address).not.toHaveProperty("line2");
      expect(result.data.address).not.toHaveProperty("region");
    }
  });

  it("rejects a missing/blank name and code", () => {
    const result = validateCreateLocationDraft({ code: "", name: "", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path.join(".") === "code" && i.code === "REQUIRED")).toBe(true);
      expect(result.issues.some((i) => i.path.join(".") === "name" && i.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects a malformed code", () => {
    expect(validateCreateLocationDraft({ code: "has space", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateCreateLocationDraft({ code: "-bad", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" }).success).toBe(false);
  });

  it("rejects a missing address line1 or city", () => {
    const result = validateCreateLocationDraft({ code: "HQ", name: "X", address: { line1: "", city: "" }, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path.join(".") === "address.line1" && i.code === "REQUIRED")).toBe(true);
      expect(result.issues.some((i) => i.path.join(".") === "address.city" && i.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects a missing or malformed country code", () => {
    expect(validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "PHL", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "1P", timezone: "Asia/Manila" }).success).toBe(false);
  });

  it("accepts well-known IANA time zones", () => {
    for (const timezone of ["Asia/Manila", "Asia/Singapore", "America/Los_Angeles", "UTC"]) {
      const result = validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone });
      expect(result.success, `expected ${timezone} to be valid`).toBe(true);
    }
  });

  it("rejects a missing or unrecognized time zone", () => {
    expect(validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "" }).success).toBe(false);
    const result = validateCreateLocationDraft({ code: "HQ", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "Mars/Olympus_Mons" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "timezone" && i.code === "UNSUPPORTED")).toBe(true);
  });
});

describe("validateUpdateLocationDetails", () => {
  it("accepts a valid update and never exposes a way to change identity (no id/code fields on the input type)", () => {
    const result = validateUpdateLocationDetails({ name: "Head Office HQ", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toEqual(["name", "address", "countryCode", "timezone"]);
  });

  it("rejects the same invalid inputs as create (name, address, country, timezone)", () => {
    expect(validateUpdateLocationDetails({ name: "", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateUpdateLocationDetails({ name: "X", address: { line1: "", city: "" }, countryCode: "PH", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateUpdateLocationDetails({ name: "X", address: VALID_ADDRESS, countryCode: "ZZZ", timezone: "Asia/Manila" }).success).toBe(false);
    expect(validateUpdateLocationDetails({ name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "not/a/zone" }).success).toBe(false);
  });
});
