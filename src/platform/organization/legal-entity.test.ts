import { describe, expect, it } from "vitest";
import { validateCreateLegalEntityDraft, validateUpdateLegalEntityDetails } from "@/platform/organization/legal-entity";

describe("validateCreateLegalEntityDraft", () => {
  it("accepts a valid draft and normalizes code (trim + uppercase) and country (uppercase)", () => {
    const result = validateCreateLegalEntityDraft({ code: " cashalo-ph ", legalName: " Cashalo Financial Services Corp. ", countryCode: "ph" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("CASHALO-PH");
      expect(result.data.legalName).toBe("Cashalo Financial Services Corp.");
      expect(result.data.countryCode).toBe("PH");
    }
  });

  it("rejects a missing/blank legal name and code", () => {
    const result = validateCreateLegalEntityDraft({ code: "", legalName: "", countryCode: "PH" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path.join(".") === "code" && i.code === "REQUIRED")).toBe(true);
      expect(result.issues.some((i) => i.path.join(".") === "legalName" && i.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects a malformed code", () => {
    expect(validateCreateLegalEntityDraft({ code: "has space", legalName: "X", countryCode: "PH" }).success).toBe(false);
    expect(validateCreateLegalEntityDraft({ code: "-bad", legalName: "X", countryCode: "PH" }).success).toBe(false);
  });

  it("rejects a missing or invalid country code", () => {
    const missing = validateCreateLegalEntityDraft({ code: "X1", legalName: "X", countryCode: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.issues.some((i) => i.path.join(".") === "countryCode" && i.code === "REQUIRED")).toBe(true);

    const invalid = validateCreateLegalEntityDraft({ code: "X1", legalName: "X", countryCode: "PHL" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.issues.some((i) => i.path.join(".") === "countryCode" && i.code === "INVALID_FORMAT")).toBe(true);
  });
});

describe("validateUpdateLegalEntityDetails", () => {
  it("accepts a valid update and normalizes country code", () => {
    const result = validateUpdateLegalEntityDetails({ legalName: " Cashalo Financial Services Corp. ", countryCode: "ph" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legalName).toBe("Cashalo Financial Services Corp.");
      expect(result.data.countryCode).toBe("PH");
    }
  });

  it("rejects a missing legal name", () => {
    const result = validateUpdateLegalEntityDetails({ legalName: "", countryCode: "PH" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "legalName" && i.code === "REQUIRED")).toBe(true);
  });

  it("never accepts a code or id field — identity is immutable", () => {
    const result = validateUpdateLegalEntityDetails({ legalName: "X", countryCode: "PH" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("code");
      expect(result.data).not.toHaveProperty("id");
    }
  });
});
