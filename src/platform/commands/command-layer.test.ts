import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { CreateEmployeeCommandHandler } from "@/platform/people/commands/create-employee-command-handler";
import { createCreateEmployeeCommand, validateCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { createTrustedRequestContext } from "@/platform/runtime-context";

const request = () => createTrustedRequestContext({
  principal: { subjectId: "subject-a", userId: "user-a", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
  roles: ["hr_admin"],
  permissions: ["people.employee.hire"],
  actorProvenance: "server_verified",
  correlationId: "request-command-test",
});

const command = () => createCreateEmployeeCommand({
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail: "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

describe("application command layer", () => {
  it("creates an immutable, entity-free CreateEmployeeCommand", () => {
    const value = command();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.personal)).toBe(true);
    expect(JSON.stringify(value)).not.toMatch(/governmentIds|tenant|session|permission|employeeNumber/i);
  });

  it("returns validation results rather than throwing for invalid business intent", () => {
    const invalidCommand = createCreateEmployeeCommand({ ...command(), employment: { ...command().employment, employmentType: "unknown", hireDate: "1990-01-01" } });
    const validation = validateCreateEmployeeCommand(invalidCommand);
    expect(validation.success).toBe(false);
    if (!validation.success) expect(validation.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["invalid_enum", "inconsistent_dates"]));
  });

  it("propagates only trusted request context and produces a prepared result", () => {
    const result = new CreateEmployeeCommandHandler().execute(request(), command());
    expect(result).toMatchObject({ kind: "success", value: { state: "prepared", correlationId: "request-command-test" } });
  });

  it("executes command preparation through the ApplicationRuntime", async () => {
    const result = await createApplicationRuntime(request()).commands.executeCreateEmployee(command());
    expect(result).toMatchObject({ kind: "success", value: { state: "prepared", command: { type: "people.employee.create" } } });
  });

  it("keeps command contracts and handlers free of repositories and persistence", () => {
    const sources = ["src/platform/commands/application-command.ts", "src/platform/commands/command-execution-pipeline.ts", "src/platform/people/commands/create-employee-command.ts", "src/platform/people/commands/create-employee-command-handler.ts"].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
    for (const source of sources) for (const forbidden of ["employee-repository", "employee_repository", "prisma", "localstorage", "cookies", "headers"]) expect(source.toLowerCase()).not.toContain(forbidden);
  });

  it("does not expose direct mutation methods through the People application service", () => {
    const source = readFileSync(resolve(process.cwd(), "src/platform/people/application/people-service.ts"), "utf8");
    for (const forbidden of ["async updateProfile", "async updateContact", "async updateGovernmentIds"]) expect(source).not.toContain(forbidden);
  });
});
