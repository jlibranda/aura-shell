import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import type { EmployeeAggregateRepository, TransactionalEmployeeAggregateRepository } from "@/platform/people/persistence/employee-aggregate-repository";

export type EmployeeTransactionRepositories = Readonly<{
  employees: EmployeeAggregateRepository;
}>;

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryEmployeeUnitOfWork implements UnitOfWork<EmployeeTransactionRepositories> {
  constructor(
    private readonly employeeAggregates: TransactionalEmployeeAggregateRepository,
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<EmployeeTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const employees = this.employeeAggregates.beginTransaction(transactionContext);
    const transaction = Object.freeze({
      context: transactionContext,
      repositories: Object.freeze({ employees }),
    });

    try {
      const result = await operation(transaction);
      await employees.commit();
      const events = employees.pullEvents();
      this.eventCollector.collect(events);
      const actorUserId = transactionContext.actorUserId;
      const requestId = transactionContext.requestId;
      const commandName = transactionContext.commandName;
      if (actorUserId && requestId && commandName) {
        this.auditCollector.collect(events.map((event) => this.auditRecords.employeeCreated({
          tenantId: transactionContext.tenantId,
          actorUserId,
          requestId,
          correlationId: transactionContext.correlationId,
          transactionId: transactionContext.transactionId,
          commandName,
        }, event)));
      }
      return result;
    } catch (error) {
      await employees.rollback();
      employees.clearEvents();
      throw error;
    }
  }
}
import { randomUUID } from "node:crypto";
