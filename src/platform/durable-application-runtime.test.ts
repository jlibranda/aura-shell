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
  employment: { legalEntityId: "le-1", orgUnitId: "dep-1", locationId: "loc-1", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01" },
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
  const assignments: Record<string, unknown>[] = [];
  // Seeded so the default command()'s legalEntityId/orgUnitId/locationId resolve to a real, ACTIVE record — this test is about the durable transaction wiring, not placement validation (see create-employee-durable-handler.test.ts for that).
  const legalEntities: Record<string, unknown>[] = [{ id: "le-1", tenantId: "durable-tenant", code: "LE1", legalName: "Durable Test Entity", countryCode: "PH", status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: "seed", updatedAt: new Date("2026-01-01T00:00:00.000Z"), archivedAt: null }];
  const orgUnits: Record<string, unknown>[] = [{ id: "dep-1", tenantId: "durable-tenant", legalEntityId: "le-1", code: "DEP1", name: "Dept 1", kind: "DEPARTMENT", parentId: null, status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: "seed", updatedAt: new Date("2026-01-01T00:00:00.000Z") }];
  const locations: Record<string, unknown>[] = [{ id: "loc-1", tenantId: "durable-tenant", code: "LOC1", name: "Location 1", addressLine1: "1 Main St", addressLine2: null, city: "Manila", region: null, postalCode: null, countryCode: "PH", timezone: "Asia/Manila", status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00.000Z"), createdBy: "seed", updatedAt: new Date("2026-01-01T00:00:00.000Z"), archivedAt: null }];
  const client = {
    tenant: { upsert: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })) },
    employee: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; workEmail?: string; employeeId?: string } }) =>
        employees.find((employee) => employee.tenantId === where.tenantId && (where.workEmail ? employee.workEmail === where.workEmail : employee.employeeId === where.employeeId)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (employees.some((employee) => employee.tenantId === data.tenantId && employee.workEmail === data.workEmail)) throw { code: "P2002" };
        const timestamp = new Date("2026-07-23T00:00:00.000Z");
        const employee = { ...data, employeeId: data.employeeId, createdAt: timestamp, updatedAt: timestamp };
        employees.push(employee); return employee;
      }),
      findMany: vi.fn(async () => employees),
    },
    orgUnit: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string; id: string } }) => orgUnits.find((unit) => unit.tenantId === where.tenantId && unit.id === where.id) ?? null) },
    location: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string; id: string } }) => locations.find((location) => location.tenantId === where.tenantId && location.id === where.id) ?? null) },
    legalEntity: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string; id: string } }) => legalEntities.find((entity) => entity.tenantId === where.tenantId && entity.id === where.id) ?? null) },
    assignment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = new Date("2026-07-23T00:00:00.000Z");
        const assignment = { id: `assignment-${assignments.length + 1}`, isPrimary: true, managerId: null, locationId: null, effectiveUntil: null, ...data, createdAt: timestamp, updatedAt: timestamp };
        assignments.push(assignment); return assignment;
      }),
    },
    auditRecord: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) },
    outboxMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { outbox.push(data); return data; }) },
  };
  const prisma: PrismaTransactionRunner = {
    $transaction: async <T>(operation: (transaction: never) => Promise<T>) => {
      const employeesBefore = [...employees]; const auditsBefore = [...audits]; const assignmentsBefore = [...assignments];
      try { return await operation(client as never); }
      catch (error) {
        employees.splice(0, employees.length, ...employeesBefore);
        audits.splice(0, audits.length, ...auditsBefore);
        assignments.splice(0, assignments.length, ...assignmentsBefore);
        throw error;
      }
    },
  };
  return { prisma, employees, audits, outbox, assignments, calls: client };
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

    expect(result).toMatchObject({ kind: "success", value: { state: "created_durably", employee: { id: "durable-employee-0001", tenantId: "durable-tenant" }, assignment: { personId: "durable-employee-0001", orgUnitId: "dep-1", locationId: "loc-1" }, correlationId: "durable-request-0001" } });
    expect(database.employees).toHaveLength(1);
    expect(database.assignments).toHaveLength(1);
    expect(database.audits).toHaveLength(2);
    expect(database.outbox).toHaveLength(2);
    expect(events.list()).toMatchObject([{ tenantId: "durable-tenant", correlationId: "durable-request-0001" }, { tenantId: "durable-tenant", correlationId: "durable-request-0001" }]);
    expect(auditCollector.list()).toMatchObject([{ tenantId: "durable-tenant", actorUserId: "durable-user", transactionId: "durable-transaction-0001" }, { tenantId: "durable-tenant", actorUserId: "durable-user", transactionId: "durable-transaction-0001" }]);
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
    expect(events.list()).toHaveLength(2); expect(audits.list()).toHaveLength(2);
  });

  it("keeps the durable runtime out of browser routes and the Runtime Hire action", async () => {
    const { readFile } = await import("node:fs/promises");
    const sources = await Promise.all(["src/app/(app)/people/hire/actions.ts", "src/app/(app)/people/hire/page.tsx", "src/app/(app)/people/page.tsx"].map((file) => readFile(file, "utf8")));
    for (const source of sources) expect(source).not.toMatch(/durable-application-runtime|executeDurableCreateEmployee|PrismaEmployee/);
  });
});
