import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { AttendancePolicyStore, InMemoryAttendancePolicyWriteRepository } from "@/platform/timekeeping/in-memory-attendance-policy-repository";
import { AttendancePolicyWriteTransaction } from "@/platform/timekeeping/attendance-policy-write-transaction";
import type { AttendancePolicyTransactionRepositories } from "@/platform/timekeeping/attendance-policy-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryAttendancePolicyUnitOfWork implements UnitOfWork<AttendancePolicyTransactionRepositories> {
  constructor(
    private readonly store: AttendancePolicyStore = new AttendancePolicyStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): AttendancePolicyStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<AttendancePolicyTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.policies];
    const attendancePolicies = new AttendancePolicyWriteTransaction(new InMemoryAttendancePolicyWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ attendancePolicies }) });

    try {
      const result = await operation(transaction);
      const events = attendancePolicies.pullEvents();
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
      this.store.policies.length = 0;
      this.store.policies.push(...snapshot);
      attendancePolicies.clearEvents();
      throw error;
    }
  }
}
