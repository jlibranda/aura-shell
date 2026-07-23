import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { SequentialAuditIdGenerator } from "@/platform/auditing/audit-record";
import { createPlatformContainer } from "@/platform/composition-root";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { SequentialEventIdGenerator } from "@/platform/events/domain-event";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import { InMemoryEmployeeUnitOfWork } from "@/platform/people/persistence/in-memory-employee-unit-of-work";
import type { EmployeeAggregateDraft, EmployeeAggregateRepositoryTransaction, EmployeeAggregateWriteContext, EmployeeAggregateWriteResult, TransactionalEmployeeAggregateRepository } from "@/platform/people/persistence/employee-aggregate-repository";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { AUDIT_COLLECTOR, AUDIT_RECORD_FACTORY, DOMAIN_EVENT_COLLECTOR, EMPLOYEE_AGGREGATE_REPOSITORY, EMPLOYEE_UNIT_OF_WORK } from "@/platform/tokens";

const baseContext = Object.freeze({ tenantId: "tenant-a", correlationId: "request-0001", requestId: "request-0001", actorUserId: "user-a", commandName: "CreateEmployee" });
const draft = (workEmail = "ana@work.example"): EmployeeAggregateDraft => ({
  displayName: "Ana Domingo",
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});
const command = () => createCreateEmployeeCommand({ ...draft(), personal: draft().personal, employment: draft().employment });
const request = () => createTrustedRequestContext({
  principal: { subjectId: "subject-a", userId: "user-a", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
  roles: ["hr_admin"], permissions: ["people.employee.hire"], actorProvenance: "server_verified", correlationId: baseContext.correlationId,
});
const clock = { now: () => "2026-07-23T00:00:00.000Z" };

class CommitFailingRepository implements TransactionalEmployeeAggregateRepository {
  constructor(private readonly inner: InMemoryEmployeeAggregateRepository) {}
  create(context: EmployeeAggregateWriteContext, value: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> { return this.inner.create(context, value); }
  list(context: EmployeeAggregateWriteContext) { return this.inner.list(context); }
  beginTransaction(context: typeof baseContext): EmployeeAggregateRepositoryTransaction {
    const transaction = this.inner.beginTransaction(context);
    return { create: (writeContext, value) => transaction.create(writeContext, value), list: (writeContext) => transaction.list(writeContext), commit: async () => { throw new Error("commit failed"); }, rollback: () => transaction.rollback(), pullEvents: () => transaction.pullEvents(), clearEvents: () => transaction.clearEvents() };
  }
}

const createUnitOfWork = (repository: InMemoryEmployeeAggregateRepository, audits: InMemoryAuditCollector, transactions = { next: () => "transaction-0001" }) =>
  new InMemoryEmployeeUnitOfWork(repository, new InMemoryDomainEventCollector(), audits, new AuditRecordFactory(new SequentialAuditIdGenerator(), clock), transactions);

describe("immutable audit pipeline", () => {
  it("creates immutable post-commit EmployeeCreated audit from a trusted authoritative command", async () => {
    const repository = new InMemoryEmployeeAggregateRepository(clock, new SequentialEventIdGenerator());
    const events = new InMemoryDomainEventCollector();
    const audits = new InMemoryAuditCollector();
    const factory = new AuditRecordFactory(new SequentialAuditIdGenerator(), clock);
    const root = createPlatformContainer();
    root.override(EMPLOYEE_AGGREGATE_REPOSITORY, repository);
    root.override(DOMAIN_EVENT_COLLECTOR, events);
    root.override(AUDIT_COLLECTOR, audits);
    root.override(AUDIT_RECORD_FACTORY, factory);
    root.override(EMPLOYEE_UNIT_OF_WORK, new InMemoryEmployeeUnitOfWork(repository, events, audits, factory, { next: () => "transaction-0001" }));

    await expect(createApplicationRuntime(request(), root).commands.executeInMemoryEmployeeCreate(command())).resolves.toMatchObject({ kind: "success" });
    const [audit] = audits.list();
    expect(audit).toMatchObject({ auditId: "audit-0001", occurredAt: "2026-07-23T00:00:00.000Z", tenantId: "tenant-a", actorUserId: "user-a", requestId: "request-0001", correlationId: "request-0001", transactionId: "transaction-0001", commandName: "CreateEmployee", eventName: "people.employee.created", aggregateType: "employee", result: "SUCCESS", metadata: { workEmail: "ana@work.example", departmentId: "dep-1", position: "Analyst", hireDate: "2024-02-01" } });
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.metadata)).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/governmentIds|tin|sss|philhealth|pagibig|permission|authentication|session/i);
  });

  it("releases ordered audit records only after successful commits", async () => {
    const repository = new InMemoryEmployeeAggregateRepository(clock, new SequentialEventIdGenerator());
    const audits = new InMemoryAuditCollector();
    let sequence = 0;
    const unitOfWork = createUnitOfWork(repository, audits, { next: () => `transaction-${String(++sequence).padStart(4, "0")}` });

    await unitOfWork.execute(baseContext, async (transaction) => transaction.repositories.employees.create({ tenantId: baseContext.tenantId }, draft()));
    await unitOfWork.execute({ ...baseContext, correlationId: "request-0002", requestId: "request-0002" }, async (transaction) => transaction.repositories.employees.create({ tenantId: baseContext.tenantId }, draft("bea@work.example")));

    expect(audits.list().map((audit) => [audit.auditId, audit.transactionId, audit.requestId])).toEqual([["audit-0001", "transaction-0001", "request-0001"], ["audit-0002", "transaction-0002", "request-0002"]]);
  });

  it("creates no audit on rollback", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const audits = new InMemoryAuditCollector();
    const unitOfWork = createUnitOfWork(repository, audits);
    await expect(unitOfWork.execute(baseContext, async (transaction) => { await transaction.repositories.employees.create({ tenantId: baseContext.tenantId }, draft()); throw new Error("abort"); })).rejects.toThrow("abort");
    expect(audits.list()).toEqual([]);
  });

  it("creates no audit when commit fails", async () => {
    const baseRepository = new InMemoryEmployeeAggregateRepository();
    const audits = new InMemoryAuditCollector();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(new CommitFailingRepository(baseRepository), new InMemoryDomainEventCollector(), audits, new AuditRecordFactory(new SequentialAuditIdGenerator(), clock), { next: () => "transaction-0001" });
    await expect(unitOfWork.execute(baseContext, async (transaction) => transaction.repositories.employees.create({ tenantId: baseContext.tenantId }, draft()))).rejects.toThrow("commit failed");
    expect(audits.list()).toEqual([]);
  });

  it("keeps Runtime Hire free of audit, event, and transaction infrastructure", () => {
    const action = readFileSync(resolve(process.cwd(), "src/app/(app)/people/hire/actions.ts"), "utf8");
    expect(action).not.toMatch(/audit|event|unit.of.work|executeInMemoryEmployeeCreate/i);
    expect(action).toContain("executeCreateEmployee");
  });
});
