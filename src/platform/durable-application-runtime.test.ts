import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { SequentialAuditIdGenerator } from "@/platform/auditing/audit-record";
import { createDurableApplicationRuntime } from "@/platform/durable-application-runtime";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { PrismaTransactionRunner } from "@/platform/people/persistence/prisma-persistence-types";
import { createTrustedRequestContext } from "@/platform/runtime-context";

const command = (workEmail = "ana.durable@work.example") => createCreateEmployeeCommand({
  personal: { firstName: "Ana", middleName: "", lastName: "Durable", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

const request = (permissions: readonly "people.employee.hire"[] = ["people.employee.hire"]) => createTrustedRequestContext({
  principal: { subjectId: "durable-subject", userId: "durable-user", tenantId: "durable-tenant", authenticationMethod: "server-test", authenticatedAt: "2026-07-23T00:00:00.000Z" },
  roles: ["hr_admin"], permissions, actorProvenance: "server_verified", correlationId: "durable-request-0001",
});

function transactionDouble() {
  const employees: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const outbox: Record<string, unknown>[] = [];
  const client = {
    tenant: { upsert: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })) },
    employee: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; workEmail: string } }) => employees.find((employee) => employee.tenantId === where.tenantId && employee.workEmail === where.workEmail) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (employees.some((employee) => employee.tenantId === data.tenantId && employee.workEmail === data.workEmail)) throw { code: "P2002" };
        const timestamp = new Date("2026-07-23T00:00:00.000Z");
        const employee = { ...data, createdAt: timestamp, updatedAt: timestamp };
        employees.push(employee); return employee;
      }),
      findMany: vi.fn(async () => employees),
    },
    auditRecord: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) },
    outboxMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { outbox.push(data); return data; }) },
  };
  const prisma: PrismaTransactionRunner = {
    $transaction: async <T>(operation: (transaction: never) => Promise<T>) => {
      const employeesBefore = [...employees]; const auditsBefore = [...audits];
      try { return await operation(client as never); }
      catch (error) { employees.splice(0, employees.length, ...employeesBefore); audits.splice(0, audits.length, ...auditsBefore); throw error; }
    },
  };
  return { prisma, employees, audits, outbox, calls: client };
}

describe("durable application runtime", () => {
  it("executes the authorized Create Employee command through Prisma transaction, durable audit, then post-commit events", async () => {
    const database = transactionDouble();
    const events = new InMemoryDomainEventCollector();
    const auditCollector = new InMemoryAuditCollector();
    const runtime = createDurableApplicationRuntime(request(), {
      prisma: database.prisma, eventCollector: events, auditCollector,
      auditRecords: new AuditRecordFactory(new SequentialAuditIdGenerator(), { now: () => "2026-07-23T00:00:00.000Z" }),
      transactionIds: { next: () => "durable-transaction-0001" },
      identifiers: { nextEmployeeId: () => "durable-employee-0001", nextEmployeeNumber: () => "DURABLE-0001" },
    });

    const result = await runtime.commands.executeDurableCreateEmployee(command());

    expect(result).toMatchObject({ kind: "success", value: { state: "created_durably", employee: { id: "durable-employee-0001", tenantId: "durable-tenant" }, correlationId: "durable-request-0001" } });
    expect(database.employees).toHaveLength(1);
    expect(database.audits).toHaveLength(1);
    expect(database.outbox).toHaveLength(1);
    expect(events.list()).toMatchObject([{ tenantId: "durable-tenant", correlationId: "durable-request-0001" }]);
    expect(auditCollector.list()).toMatchObject([{ tenantId: "durable-tenant", actorUserId: "durable-user", transactionId: "durable-transaction-0001" }]);
  });

  it("denies before a durable transaction begins when trusted permission is absent", async () => {
    const database = transactionDouble();
    const result = await createDurableApplicationRuntime(request([]), { prisma: database.prisma }).commands.executeDurableCreateEmployee(command());
    expect(result).toMatchObject({ kind: "authorization_failure" });
    expect(database.employees).toEqual([]);
    expect(database.audits).toEqual([]);
  });

  it("maps a durable tenant-local work-email conflict without releasing a second audit or event", async () => {
    const database = transactionDouble();
    const events = new InMemoryDomainEventCollector(); const audits = new InMemoryAuditCollector();
    const runtime = createDurableApplicationRuntime(request(), { prisma: database.prisma, eventCollector: events, auditCollector: audits });
    await expect(runtime.commands.executeDurableCreateEmployee(command())).resolves.toMatchObject({ kind: "success" });
    await expect(runtime.commands.executeDurableCreateEmployee(command("ANA.DURABLE@WORK.EXAMPLE"))).resolves.toMatchObject({ kind: "conflict" });
    expect(events.list()).toHaveLength(1); expect(audits.list()).toHaveLength(1);
  });

  it("keeps the durable runtime out of browser routes and the Runtime Hire action", async () => {
    const { readFile } = await import("node:fs/promises");
    const sources = await Promise.all(["src/app/(app)/people/hire/actions.ts", "src/app/(app)/people/hire/page.tsx", "src/app/(app)/people/page.tsx"].map((file) => readFile(file, "utf8")));
    for (const source of sources) expect(source).not.toMatch(/durable-application-runtime|executeDurableCreateEmployee|PrismaEmployee/);
  });
});
