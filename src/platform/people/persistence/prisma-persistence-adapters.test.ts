import { describe, expect, it, vi } from "vitest";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { SequentialAuditIdGenerator } from "@/platform/auditing/audit-record";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import type { EmployeeAggregateDraft } from "@/platform/people/persistence/employee-aggregate-repository";
import { PrismaEmployeeAggregateRepository } from "@/platform/people/persistence/prisma-employee-aggregate-repository";
import { PrismaEmployeeUnitOfWork } from "@/platform/people/persistence/prisma-employee-unit-of-work";
import type { PrismaEmployeePersistenceClient, PrismaTransactionRunner } from "@/platform/people/persistence/prisma-persistence-types";

const draft = (workEmail = "ana@work.example"): EmployeeAggregateDraft => ({
  displayName: "Ana Domingo",
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

type StoredEmployee = Record<string, unknown>;

function createPrismaDouble() {
  const employees: StoredEmployee[] = [];
  const tenants = new Set<string>();
  const audits: Record<string, unknown>[] = [];
  const outbox: Record<string, unknown>[] = [];
  const client = {
    tenant: {
      upsert: vi.fn(async ({ where }: { where: { id: string } }) => {
        tenants.add(where.id);
        return { id: where.id };
      }),
    },
    employee: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; workEmail: string } }) =>
        employees.find((employee) => employee.tenantId === where.tenantId && employee.workEmail === where.workEmail) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (employees.some((employee) => employee.tenantId === data.tenantId && employee.workEmail === data.workEmail)) {
          throw { code: "P2002" };
        }
        const now = new Date("2026-07-23T00:00:00.000Z");
        const employee = { ...data, createdAt: now, updatedAt: now };
        employees.push(employee);
        return employee;
      }),
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        employees.filter((employee) => employee.tenantId === where.tenantId)),
    },
    auditRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      }),
    },
    outboxMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { outbox.push(data); return data; }) },
  };
  const transactionRunner: PrismaTransactionRunner = {
    $transaction: async <T>(operation: (transaction: never) => Promise<T>): Promise<T> => {
      const employeeSnapshot = [...employees];
      const tenantSnapshot = new Set(tenants);
      const auditSnapshot = [...audits];
      const outboxSnapshot = [...outbox];
      try {
        return await operation(client as never);
      } catch (error) {
        employees.splice(0, employees.length, ...employeeSnapshot);
        tenants.clear(); tenantSnapshot.forEach((tenant) => tenants.add(tenant));
        audits.splice(0, audits.length, ...auditSnapshot);
        outbox.splice(0, outbox.length, ...outboxSnapshot);
        throw error;
      }
    },
  };
  return { client: client as unknown as PrismaEmployeePersistenceClient, transactionRunner, employees, tenants, audits, outbox, calls: client };
}

const identifiers = { nextEmployeeId: () => "employee-0001", nextEmployeeNumber: () => "EMP-0001" };

describe("Prisma persistence adapters", () => {
  it("maps the existing aggregate through a tenant-scoped Prisma repository without Government IDs", async () => {
    const database = createPrismaDouble();
    const repository = new PrismaEmployeeAggregateRepository(database.client, identifiers);

    const result = await repository.create({ tenantId: "tenant-a" }, draft("ANA@WORK.EXAMPLE"));

    expect(result).toMatchObject({ kind: "created", employee: { id: "employee-0001", employeeNumber: "EMP-0001", tenantId: "tenant-a", contact: { workEmail: "ana@work.example" } } });
    expect(database.tenants.has("tenant-a")).toBe(true);
    expect(database.calls.employee.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", workEmail: "ana@work.example", teamId: null, managerId: null }) }));
    expect(JSON.stringify(result)).not.toMatch(/governmentIds|tin|sss|philhealth|pagibig/i);
  });

  it("detects work-email conflicts within a tenant and isolates lists between tenants", async () => {
    const database = createPrismaDouble();
    const repository = new PrismaEmployeeAggregateRepository(database.client, identifiers);
    await repository.create({ tenantId: "tenant-a" }, draft());

    await expect(repository.create({ tenantId: "tenant-a" }, draft("ANA@WORK.EXAMPLE"))).resolves.toMatchObject({ kind: "conflict", field: "workEmail" });
    await expect(repository.list({ tenantId: "tenant-b" })).resolves.toEqual([]);
    await expect(repository.list({ tenantId: "tenant-a" })).resolves.toHaveLength(1);
  });

  it("commits employee and immutable audit evidence together, then releases events only after commit", async () => {
    const database = createPrismaDouble();
    const events = new InMemoryDomainEventCollector();
    const audits = new InMemoryAuditCollector();
    const unitOfWork = new PrismaEmployeeUnitOfWork(
      database.transactionRunner,
      events,
      audits,
      new AuditRecordFactory(new SequentialAuditIdGenerator(), { now: () => "2026-07-23T00:00:00.000Z" }),
      { next: () => "transaction-0001" },
      identifiers,
    );

    await unitOfWork.execute({ tenantId: "tenant-a", correlationId: "correlation-0001", requestId: "request-0001", actorUserId: "user-a", commandName: "CreateEmployee" }, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: "tenant-a" }, draft());
      expect(events.list()).toEqual([]);
      expect(audits.list()).toEqual([]);
    });

    expect(database.employees).toHaveLength(1);
    expect(database.audits).toHaveLength(1);
    expect(database.outbox).toHaveLength(1);
    expect(events.list()).toHaveLength(1);
    expect(audits.list()).toMatchObject([{ transactionId: "transaction-0001", aggregateType: "employee", aggregateId: "employee-0001" }]);
  });

  it("rolls back employee and audit writes and releases nothing when operation work fails", async () => {
    const database = createPrismaDouble();
    const events = new InMemoryDomainEventCollector();
    const audits = new InMemoryAuditCollector();
    const unitOfWork = new PrismaEmployeeUnitOfWork(database.transactionRunner, events, audits, undefined, { next: () => "transaction-0001" }, identifiers);

    await expect(unitOfWork.execute({ tenantId: "tenant-a", correlationId: "correlation-0001", requestId: "request-0001", actorUserId: "user-a", commandName: "CreateEmployee" }, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: "tenant-a" }, draft());
      throw new Error("rollback");
    })).rejects.toThrow("rollback");

    expect(database.employees).toEqual([]);
    expect(database.audits).toEqual([]);
    expect(database.outbox).toEqual([]);
    expect(events.list()).toEqual([]);
    expect(audits.list()).toEqual([]);
  });

  it("does not wire the Prisma Unit of Work or repository into the browser Runtime Hire action", async () => {
    const { readFile } = await import("node:fs/promises");
    const action = await readFile("src/app/(app)/people/hire/actions.ts", "utf8");
    expect(action).not.toMatch(/PrismaEmployee|\$transaction|executeInMemoryEmployeeCreate/);
  });
});
