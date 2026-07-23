import { describe, expect, it, vi } from "vitest";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { submitCreateEmployee } from "@/platform/submissions/create-employee-submission-gateway";
import type { SubmissionIdempotencyRepository } from "@/platform/submissions/submission-idempotency-repository";

const command = createCreateEmployeeCommand({
  personal: { firstName: "Gateway", middleName: "", lastName: "Employee", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail: "gateway.employee@example.test", mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-fin", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});
const authenticated = () => createTrustedRequestContext({ principal: { subjectId: "gateway-subject", userId: "gateway-user", tenantId: "nw-ph", authenticationMethod: "server-test", authenticatedAt: "2026-07-23T00:00:00.000Z" }, roles: ["hr_admin"], permissions: ["people.employee.hire"], actorProvenance: "server_verified", correlationId: "gateway-correlation" });

function idempotency(): SubmissionIdempotencyRepository & { completed: unknown[] } {
  const completed: unknown[] = [];
  return {
    completed,
    claim: vi.fn().mockResolvedValue({ kind: "claimed" }),
    complete: vi.fn(async ({ result }) => { completed.push(result); }),
  };
}

function runtime() {
  return { commands: { executeDurableCreateEmployee: vi.fn().mockResolvedValue({ kind: "success", value: { state: "created_durably", employee: { id: "employee-1", employeeNumber: "EMP-0001" }, correlationId: "gateway-correlation" } }) } } as any;
}

describe("trusted Create Employee submission gateway", () => {
  it("uses only server authentication, validates input, claims durable idempotency, and returns a sanitized result", async () => {
    const store = idempotency(); const durable = runtime();
    const result = await submitCreateEmployee({ idempotencyKey: "gateway-key-1", command }, { authenticate: authenticated, idempotency: store, createRuntime: () => durable });
    expect(result).toEqual({ kind: "success", value: { kind: "created", employeeId: "employee-1", employeeNumber: "EMP-0001", correlationId: "gateway-correlation" }, replayed: false });
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "nw-ph", key: "gateway-key-1", commandType: "people.employee.create", requestHash: expect.any(String) }));
    expect(store.completed).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("gateway.employee@example.test");
  });

  it("replays a completed idempotent result without invoking durable creation", async () => {
    const store = idempotency(); (store.claim as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: "completed", result: { kind: "created", employeeId: "employee-1", employeeNumber: "EMP-0001", correlationId: "previous" } });
    const durable = runtime();
    await expect(submitCreateEmployee({ idempotencyKey: "gateway-key-1", command }, { authenticate: authenticated, idempotency: store, createRuntime: () => durable })).resolves.toMatchObject({ kind: "success", replayed: true });
    expect(durable.commands.executeDurableCreateEmployee).not.toHaveBeenCalled();
  });

  it("does not claim or execute when trusted authentication or authorization fails", async () => {
    const store = idempotency(); const durable = runtime();
    await expect(submitCreateEmployee({ idempotencyKey: "gateway-key-1", command }, { authenticate: () => { throw new Error("no session"); }, idempotency: store, createRuntime: () => durable })).resolves.toMatchObject({ kind: "authorization_failure" });
    expect(store.claim).not.toHaveBeenCalled(); expect(durable.commands.executeDurableCreateEmployee).not.toHaveBeenCalled();
  });

  it("permits only the Hire server action to reach the submission runtime", async () => {
    const { readFile } = await import("node:fs/promises");
    const action = await readFile("src/app/(app)/people/hire/actions.ts", "utf8");
    const browserSources = await Promise.all(["src/components/people/hire/runtime-hire-page.tsx", "src/app/(app)/people/hire/page.tsx", "src/app/(app)/people/page.tsx"].map((file) => readFile(file, "utf8")));
    expect(action).toContain("createTrustedCreateEmployeeSubmissionRuntime");
    expect(action).not.toMatch(/getPrismaClient|createDurableApplicationRuntime|PrismaEmployee/);
    for (const source of browserSources) expect(source).not.toMatch(/getPrismaClient|createDurableApplicationRuntime|PrismaEmployee|tenantId|actorProvenance/);
  });
});
