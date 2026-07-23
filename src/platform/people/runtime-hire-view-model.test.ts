import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_HIRE_FIELD_DISPOSITIONS, RUNTIME_HIRE_FIELD_MANIFEST } from "@/platform/people/runtime-hire-parity";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { emptyRuntimeHireDraft, emptyRuntimeHireReferences, toRuntimeHireViewModel, validateRuntimeHireStep } from "@/platform/people/runtime-hire-view-model";

function validDraft() {
  return { ...emptyRuntimeHireDraft(), personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" }, contact: { personalEmail: "", workEmail: "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" }, employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" }, emergency: { name: "", relationship: "", mobileNumber: "", email: "", address: "" } };
}

describe("runtime hire parity boundary", () => {
  it("registers all 31 legacy editable fields with controlled dispositions", () => {
    expect(RUNTIME_HIRE_FIELD_MANIFEST).toHaveLength(31);
    expect(new Set(RUNTIME_HIRE_FIELD_MANIFEST.map((field) => field.id)).size).toBe(31);
    for (const field of RUNTIME_HIRE_FIELD_MANIFEST) expect(RUNTIME_HIRE_FIELD_DISPOSITIONS).toContain(field.disposition);
  });

  it("keeps active fields in the runtime form and review contracts", () => {
    const draft = validDraft();
    const serialized = JSON.stringify({ draft, command: createCreateEmployeeCommand({ personal: draft.personal, contact: draft.contact, employment: draft.employment, emergencyContact: draft.emergency }) });
    for (const field of RUNTIME_HIRE_FIELD_MANIFEST.filter((item) => item.disposition === "ACTIVE_RUNTIME")) {
      expect(field.runtimeKey).toBeTruthy();
      expect(field.reviewKey).toBeTruthy();
      expect(serialized).toContain(field.runtimeKey! === "position" ? "position" : field.runtimeKey!);
    }
  });

  it("blocks Government IDs from the draft and command boundary", () => {
    const draft = validDraft();
    const serialized = JSON.stringify(createCreateEmployeeCommand({ personal: draft.personal, contact: draft.contact, employment: draft.employment, emergencyContact: draft.emergency }));
    for (const id of ["tin", "sss", "philhealth", "pagibig", "governmentIds"]) expect(serialized).not.toContain(`\"${id}\"`);
    expect(RUNTIME_HIRE_FIELD_MANIFEST.filter((field) => field.section === "government").every((field) => field.disposition === "BLOCKED_SECURITY")).toBe(true);
  });

  it("restores legacy non-Government validation", () => {
    expect(validateRuntimeHireStep("personal", emptyRuntimeHireDraft())).toMatchObject({ firstName: "First name is required.", dateOfBirth: "Birth date is required.", gender: "Gender is required." });
    expect(validateRuntimeHireStep("contact", { ...emptyRuntimeHireDraft(), contact: { personalEmail: "bad", workEmail: "bad", mobileNumber: "1", homeAddress: "" } })).toMatchObject({ personalEmail: "Enter a valid email address.", workEmail: "Enter a valid email address.", mobileNumber: "Enter a valid mobile number." });
    expect(validateRuntimeHireStep("emergency", { ...validDraft(), emergency: { name: "", relationship: "", mobileNumber: "", email: "", address: "x" } })).toMatchObject({ emergencyName: "Contact name is required.", emergencyRelationship: "Relationship is required.", emergencyMobile: "Mobile number is required." });
  });

  it("prepares information without persistence or runtime context leakage", () => {
    const draft = validDraft();
    const command = createCreateEmployeeCommand({ personal: draft.personal, contact: draft.contact, employment: draft.employment, emergencyContact: draft.emergency });
    expect(toRuntimeHireViewModel("review", draft, emptyRuntimeHireReferences(), {}, command)).toMatchObject({ currentStep: "review", canGoBack: true, submission: "prepared" });
    const serialized = JSON.stringify(command);
    for (const forbidden of ["tenant", "session", "permission", "CURRENT_USER", "employeeNumber", "governmentIds"]) expect(serialized).not.toContain(forbidden);
  });

  it("keeps the active runtime boundary free of legacy stores, repositories, and browser identity", () => {
    const sources = ["src/components/people/hire/runtime-hire-page.tsx", "src/platform/people/runtime-hire-view-model.ts", "src/platform/people/runtime-hire-loader.ts"].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
    for (const source of sources) for (const forbidden of ["usePeopleRepository", "usePeopleStore", "usePeopleDirectoryStore", "localStorage", "CURRENT_USER", "people-repository", "HireInput"]) expect(source).not.toContain(forbidden);
  });
});
