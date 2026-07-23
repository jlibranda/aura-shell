import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { createPlatformContainer } from "@/platform/composition-root";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { SequentialEventIdGenerator } from "@/platform/events/domain-event";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import { InMemoryEmployeeUnitOfWork } from "@/platform/people/persistence/in-memory-employee-unit-of-work";
import type { EmployeeAggregateRepositoryTransaction, EmployeeAggregateWriteContext, EmployeeAggregateDraft, EmployeeAggregateWriteResult, TransactionalEmployeeAggregateRepository } from "@/platform/people/persistence/employee-aggregate-repository";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { DOMAIN_EVENT_COLLECTOR, EMPLOYEE_AGGREGATE_REPOSITORY, EMPLOYEE_UNIT_OF_WORK } from "@/platform/tokens";

const context = Object.freeze({ tenantId: "tenant-a", correlationId: "request-0001" });
const draft = (workEmail = "ana@work.example"): EmployeeAggregateDraft => ({
  displayName: "Ana Domingo",
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});
const command = () => createCreateEmployeeCommand({ ...draft(), personal: { ...draft().personal, dateOfBirth: "1994-02-01" }, employment: { ...draft().employment, hireDate: "2024-02-01" } });
const request = () => createTrustedRequestContext({
  principal: { subjectId: "subject-a", userId: "user-a", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
  roles: ["hr_admin"], permissions: ["people.employee.hire"], actorProvenance: "server_verified", correlationId: context.correlationId,
});

class CommitFailingRepository implements TransactionalEmployeeAggregateRepository {
  constructor(private readonly inner: InMemoryEmployeeAggregateRepository) {}
  create(context: EmployeeAggregateWriteContext, value: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> { return this.inner.create(context, value); }
  list(context: EmployeeAggregateWriteContext) { return this.inner.list(context); }
  beginTransaction(transactionContext: typeof context): EmployeeAggregateRepositoryTransaction {
    const transaction = this.inner.beginTransaction(transactionContext);
    return {
      create: (writeContext, value) => transaction.create(writeContext, value),
      list: (writeContext) => transaction.list(writeContext),
      commit: async () => { throw new Error("commit failed"); },
      rollback: () => transaction.rollback(),
      pullEvents: () => transaction.pullEvents(),
      clearEvents: () => transaction.clearEvents(),
    };
  }
}

describe("domain event boundary", () => {
  it("records an immutable EmployeeCreated event with trusted transaction provenance after commit", async () => {
    const repository = new InMemoryEmployeeAggregateRepository({ now: () => "2026-07-23T00:00:00.000Z" }, new SequentialEventIdGenerator("employee-event"));
    const collector = new InMemoryDomainEventCollector();
    const root = createPlatformContainer();
    root.override(EMPLOYEE_AGGREGATE_REPOSITORY, repository);
    root.override(DOMAIN_EVENT_COLLECTOR, collector);
    root.override(EMPLOYEE_UNIT_OF_WORK, new InMemoryEmployeeUnitOfWork(repository, collector));

    await expect(createApplicationRuntime(request(), root).commands.executeInMemoryEmployeeCreate(command())).resolves.toMatchObject({ kind: "success" });
    const [event] = collector.list();
    expect(event).toMatchObject({ eventId: "employee-event-0001", eventName: "people.employee.created", occurredAt: "2026-07-23T00:00:00.000Z", aggregateType: "employee", tenantId: "tenant-a", correlationId: "request-0001", requestId: "request-0001", version: 1, payload: { workEmail: "ana@work.example", departmentId: "dep-1", position: "Analyst", hireDate: "2024-02-01" } });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/governmentIds|tin|sss|philhealth|pagibig|permission|authentication/i);
  });

  it("keeps events invisible until commit and preserves commit order", async () => {
    const repository = new InMemoryEmployeeAggregateRepository({ now: () => "2026-07-23T00:00:00.000Z" }, new SequentialEventIdGenerator());
    const collector = new InMemoryDomainEventCollector();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(repository, collector);

    await unitOfWork.execute(context, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft());
      expect(collector.list()).toEqual([]);
    });
    await unitOfWork.execute({ ...context, correlationId: "request-0002" }, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft("bea@work.example"));
    });

    expect(collector.list().map((event) => event.eventId)).toEqual(["event-0001", "event-0002"]);
  });

  it("discards events and staged writes on rollback", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const collector = new InMemoryDomainEventCollector();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(repository, collector);

    await expect(unitOfWork.execute(context, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft());
      throw new Error("abort");
    })).rejects.toThrow("abort");

    expect(collector.list()).toEqual([]);
    await expect(repository.list({ tenantId: context.tenantId })).resolves.toEqual([]);
  });

  it("does not release events when commit fails", async () => {
    const baseRepository = new InMemoryEmployeeAggregateRepository();
    const collector = new InMemoryDomainEventCollector();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(new CommitFailingRepository(baseRepository), collector);

    await expect(unitOfWork.execute(context, async (transaction) => transaction.repositories.employees.create({ tenantId: context.tenantId }, draft()))).rejects.toThrow("commit failed");
    expect(collector.list()).toEqual([]);
    await expect(baseRepository.list({ tenantId: context.tenantId })).resolves.toEqual([]);
  });

  it("keeps Runtime Hire free of transaction and event infrastructure", () => {
    const action = readFileSync(resolve(process.cwd(), "src/app/(app)/people/hire/actions.ts"), "utf8");
    expect(action).not.toMatch(/event|unit.of.work|executeInMemoryEmployeeCreate/i);
    expect(action).toContain("executeCreateEmployee");
  });
});
