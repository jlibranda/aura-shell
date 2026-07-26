import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { ScheduleAssignmentStore, InMemoryScheduleAssignmentWriteRepository } from "@/platform/timekeeping/in-memory-schedule-assignment-repository";
import { ScheduleAssignmentWriteTransaction } from "@/platform/timekeeping/schedule-assignment-write-transaction";
import { WorkScheduleStore, InMemoryWorkScheduleWriteRepository } from "@/platform/timekeeping/in-memory-work-schedule-repository";
import { InMemoryOrganizationAssignmentAsOfRepository } from "@/platform/timekeeping/in-memory-organization-assignment-port";
import type { ScheduleAssignmentTransactionRepositories } from "@/platform/timekeeping/schedule-assignment-repository";

/**
 * In-memory transaction coordinator for server-side tests and development
 * only. Exposes the backing WorkSchedule store and Organization-Assignment
 * registry so a test can seed the work schedule versions and placement
 * windows a schedule assignment must validate against, in the same way the
 * Prisma adapter reads live tenant data inside its own transaction.
 */
export class InMemoryScheduleAssignmentUnitOfWork implements UnitOfWork<ScheduleAssignmentTransactionRepositories> {
  constructor(
    private readonly store: ScheduleAssignmentStore = new ScheduleAssignmentStore(),
    private readonly workScheduleStore: WorkScheduleStore = new WorkScheduleStore(),
    private readonly organizationAssignments: InMemoryOrganizationAssignmentAsOfRepository = new InMemoryOrganizationAssignmentAsOfRepository(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): ScheduleAssignmentStore { return this.store; }
  getWorkScheduleStore(): WorkScheduleStore { return this.workScheduleStore; }
  getOrganizationAssignments(): InMemoryOrganizationAssignmentAsOfRepository { return this.organizationAssignments; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<ScheduleAssignmentTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.assignments];
    const scheduleAssignments = new ScheduleAssignmentWriteTransaction(new InMemoryScheduleAssignmentWriteRepository(this.store), transactionContext);
    const workSchedules = new InMemoryWorkScheduleWriteRepository(this.workScheduleStore);
    const transaction = Object.freeze({
      context: transactionContext,
      repositories: Object.freeze({ scheduleAssignments, workSchedules, organizationAssignments: this.organizationAssignments }),
    });

    try {
      const result = await operation(transaction);
      const events = scheduleAssignments.pullEvents();
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
      this.store.assignments.length = 0;
      this.store.assignments.push(...snapshot);
      scheduleAssignments.clearEvents();
      throw error;
    }
  }
}
