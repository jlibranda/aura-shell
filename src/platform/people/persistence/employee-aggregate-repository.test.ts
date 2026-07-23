import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { createPlatformContainer } from "@/platform/composition-root";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import { createTrustedRequestContext } from "@/platform/runtime-context";

const command = (workEmail = "ana@work.example") => createCreateEmployeeCommand({
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

const request = (tenantId: string) => createTrustedRequestContext({
  principal: { subjectId: `subject-${tenantId}`, userId: `user-${tenantId}`, tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
  roles: ["hr_admin"], permissions: ["people.employee.hire"], actorProvenance: "server_verified",
});

describe("in-memory employee aggregate write adapter", () => {
  it("creates server-owned deterministic aggregate identifiers and timestamps without Government IDs", async () => {
    const root = createPlatformContainer();
    const result = await createApplicationRuntime(request("tenant-a"), root).commands.executeInMemoryEmployeeCreate(command());
    expect(result).toMatchObject({ kind: "success", value: { state: "created_in_memory", employee: { id: "tenant-a-employee-0001", employeeNumber: "TENANT-A-0001", tenantId: "tenant-a", createdAt: expect.any(String), updatedAt: expect.any(String) } } });
    expect(JSON.stringify(result)).not.toMatch(/governmentIds|tin|sss|philhealth|pagibig/i);
  });

  it("uses an injected server clock for deterministic test timestamps", async () => {
    const repository = new InMemoryEmployeeAggregateRepository({ now: () => "2026-07-23T00:00:00.000Z" });
    const result = await repository.create({ tenantId: "tenant-a" }, {
      displayName: "Ana Domingo",
      personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
      contact: { personalEmail: "", workEmail: "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" },
      employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
      emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
    });
    expect(result).toMatchObject({ kind: "created", employee: { createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" } });
  });

  it("detects work-email conflicts within one tenant", async () => {
    const root = createPlatformContainer();
    const runtime = createApplicationRuntime(request("tenant-a"), root);
    await expect(runtime.commands.executeInMemoryEmployeeCreate(command())).resolves.toMatchObject({ kind: "success" });
    await expect(runtime.commands.executeInMemoryEmployeeCreate(command("ANA@WORK.EXAMPLE"))).resolves.toMatchObject({ kind: "conflict" });
  });

  it("isolates identical work emails between tenants", async () => {
    const root = createPlatformContainer();
    const first = await createApplicationRuntime(request("tenant-a"), root).commands.executeInMemoryEmployeeCreate(command());
    const second = await createApplicationRuntime(request("tenant-b"), root).commands.executeInMemoryEmployeeCreate(command());
    expect(first).toMatchObject({ kind: "success", value: { employee: { tenantId: "tenant-a" } } });
    expect(second).toMatchObject({ kind: "success", value: { employee: { tenantId: "tenant-b" } } });
  });

  it("does not expose the in-memory write path through the browser preparation action", () => {
    const action = readFileSync(resolve(process.cwd(), "src/app/(app)/people/hire/actions.ts"), "utf8");
    const adapter = readFileSync(resolve(process.cwd(), "src/platform/people/persistence/in-memory-employee-aggregate-repository.ts"), "utf8");
    expect(action).not.toContain("executeInMemoryEmployeeCreate");
    for (const forbidden of ["employee-repository", "in-memory-employee-repository", "governmentIds"]) expect(adapter).not.toContain(forbidden);
  });

  it("returns records only from their requested tenant", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const runtime = createApplicationRuntime(request("tenant-a"));
    const prepared = await runtime.commands.executeCreateEmployee(command());
    if (prepared.kind !== "success") throw new Error("Expected a prepared command.");
    await repository.create({ tenantId: "tenant-a" }, { displayName: "Ana Domingo", personal: { ...prepared.value.command.personal, dateOfBirth: prepared.value.command.personal.dateOfBirth! }, contact: prepared.value.command.contact, employment: { ...prepared.value.command.employment, hireDate: prepared.value.command.employment.hireDate! }, emergencyContact: prepared.value.command.emergencyContact });
    expect(await repository.list({ tenantId: "tenant-b" })).toEqual([]);
    expect(await repository.list({ tenantId: "tenant-a" })).toHaveLength(1);
  });
});
