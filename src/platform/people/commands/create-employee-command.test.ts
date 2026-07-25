import { describe, expect, it } from "vitest";
import { createCreateEmployeeCommand, validateCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";

function baseInput(overrides: { legalEntityId?: string; orgUnitId?: string; locationId?: string } = {}) {
  return {
    personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
    contact: { personalEmail: "", workEmail: "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" },
    employment: { legalEntityId: overrides.legalEntityId ?? "le1", orgUnitId: overrides.orgUnitId ?? "ou1", locationId: overrides.locationId ?? "loc1", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2026-07-25" },
    emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
  };
}

describe("validateCreateEmployeeCommand — placement fields", () => {
  it("accepts a command with a legal entity, an organization unit, and a location", () => {
    const result = validateCreateEmployeeCommand(createCreateEmployeeCommand(baseInput()));
    expect(result.success).toBe(true);
  });

  it("rejects hire with no legal entity", () => {
    const result = validateCreateEmployeeCommand(createCreateEmployeeCommand(baseInput({ legalEntityId: "" })));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "employment.legalEntityId" && issue.code === "required")).toBe(true);
  });

  it("rejects hire with no organization unit", () => {
    const result = validateCreateEmployeeCommand(createCreateEmployeeCommand(baseInput({ orgUnitId: "" })));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "employment.orgUnitId" && issue.code === "required")).toBe(true);
  });

  it("rejects hire with no location", () => {
    const result = validateCreateEmployeeCommand(createCreateEmployeeCommand(baseInput({ locationId: "" })));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.join(".") === "employment.locationId" && issue.code === "required")).toBe(true);
  });

  it("rejects hire missing legal entity, organization unit, and location at once", () => {
    const result = validateCreateEmployeeCommand(createCreateEmployeeCommand(baseInput({ legalEntityId: "", orgUnitId: "", locationId: "" })));
    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.issues.map((issue) => issue.path.join("."));
      expect(codes).toContain("employment.legalEntityId");
      expect(codes).toContain("employment.orgUnitId");
      expect(codes).toContain("employment.locationId");
    }
  });

  it("never references Employee.workLocation or legacy department/team fields in the command contract", () => {
    const command = createCreateEmployeeCommand(baseInput());
    expect(command.employment).not.toHaveProperty("workLocation");
    expect(command.employment).not.toHaveProperty("departmentId");
    expect(command.employment).not.toHaveProperty("teamId");
    expect(command.employment).toHaveProperty("legalEntityId");
    expect(command.employment).toHaveProperty("orgUnitId");
    expect(command.employment).toHaveProperty("locationId");
  });
});
