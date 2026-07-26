import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { AttendanceEventStore, InMemoryAttendanceEventWriteRepository } from "@/platform/timekeeping/in-memory-attendance-event-repository";
import { AttendanceEventWriteTransaction } from "@/platform/timekeeping/attendance-event-write-transaction";
import type { AttendanceEventTransactionRepositories } from "@/platform/timekeeping/attendance-event-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryAttendanceEventUnitOfWork implements UnitOfWork<AttendanceEventTransactionRepositories> {
  constructor(
    private readonly store: AttendanceEventStore = new AttendanceEventStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): AttendanceEventStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<AttendanceEventTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.attendanceEvents];
    const attendanceEvents = new AttendanceEventWriteTransaction(new InMemoryAttendanceEventWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ attendanceEvents }) });

    try {
      const result = await operation(transaction);
      const events = attendanceEvents.pullEvents();
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
      this.store.attendanceEvents.length = 0;
      this.store.attendanceEvents.push(...snapshot);
      attendanceEvents.clearEvents();
      throw error;
    }
  }
}
