import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { AURA_COMMAND_PERMISSION_REQUIREMENTS, PermissionAuthorizationPolicy } from "@/platform/authorization/authorization-policy";
import { CommandExecutionPipeline } from "@/platform/commands/command-execution-pipeline";
import { commandSuccess } from "@/platform/commands/command-result";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { createTrustedRequestContext } from "@/platform/runtime-context";

const request = (permissions: readonly "people.employee.hire"[] = ["people.employee.hire"]) => createTrustedRequestContext({
  principal: { subjectId: "subject-a", userId: "user-a", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
  roles: ["employee"],
  permissions,
  actorProvenance: "server_verified",
});

const command = () => createCreateEmployeeCommand({
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail: "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

describe("command authorization policy boundary", () => {
  it("allows registered operations from a trusted permission snapshot", () => {
    expect(new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS).authorize(request(), command())).toEqual({ kind: "allowed" });
  });

  it("denies missing permissions without consulting roles or browser data", () => {
    expect(new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS).authorize(request([]), command())).toMatchObject({ kind: "denied", code: "MISSING_PERMISSION" });
  });

  it("denies unregistered operations by default", () => {
    expect(new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS).authorize(request(), { type: "unknown.operation" })).toMatchObject({ kind: "denied", code: "UNREGISTERED_OPERATION" });
  });

  it("stops denied commands before handler business execution", async () => {
    let executed = false;
    const handler = { commandType: "people.employee.create" as const, execute: () => { executed = true; return commandSuccess({ state: "prepared" as const }); } };
    const pipeline = new CommandExecutionPipeline(new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS), [handler]);
    const result = await pipeline.execute(request([]), command());
    expect(result).toMatchObject({ kind: "authorization_failure" });
    expect(executed).toBe(false);
  });

  it("enforces the policy through the ApplicationRuntime composition", async () => {
    const result = await createApplicationRuntime(request([])).commands.executeCreateEmployee(command());
    expect(result).toMatchObject({ kind: "authorization_failure" });
  });
});
