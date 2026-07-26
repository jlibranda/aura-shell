import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { WorkScheduleStore, InMemoryWorkScheduleWriteRepository } from "@/platform/timekeeping/in-memory-work-schedule-repository";
import { WorkScheduleWriteTransaction } from "@/platform/timekeeping/work-schedule-write-transaction";
import type { WorkScheduleTransactionRepositories } from "@/platform/timekeeping/work-schedule-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryWorkScheduleUnitOfWork implements UnitOfWork<WorkScheduleTransactionRepositories> {
  constructor(
    private readonly store: WorkScheduleStore = new WorkScheduleStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): WorkScheduleStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<WorkScheduleTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = { workSchedules: [...this.store.workSchedules], versions: [...this.store.versions] };
    const workSchedules = new WorkScheduleWriteTransaction(new InMemoryWorkScheduleWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ workSchedules }) });

    try {
      const result = await operation(transaction);
      const events = workSchedules.pullEvents();
      this.eventCollector.collect(events);
      const { actorUserId, requestId, commandName } = transactionContext;
      if (actorUserId && requestId && commandName) {
        this.auditCollector.collect(events.map((event) => this.auditRecords.timekeepingEvent({
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
      this.store.workSchedules.length = 0;
      this.store.workSchedules.push(...snapshot.workSchedules);
      this.store.versions.length = 0;
      this.store.versions.push(...snapshot.versions);
      workSchedules.clearEvents();
      throw error;
    }
  }
}
