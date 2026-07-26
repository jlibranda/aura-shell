import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import type { AuditCollector } from "@/platform/auditing/audit-collector";
import type { ImmutableAuditRecordRepository } from "@/platform/auditing/immutable-audit-record-repository";
import type { DomainEventCollector } from "@/platform/events/domain-event-collector";
import { PrismaAuditRecordRepository } from "@/platform/auditing/prisma-audit-record-repository";
import { PrismaOutboxRepository } from "@/platform/outbox/prisma-outbox-repository";
import type { OutboxRepository } from "@/platform/outbox/outbox-repository";
import { toOutboxMessage } from "@/platform/outbox/outbox-message";
import { PrismaWorkScheduleWriteRepository } from "@/platform/timekeeping/prisma-work-schedule-write-repository";
import { WorkScheduleWriteTransaction } from "@/platform/timekeeping/work-schedule-write-transaction";
import type { WorkScheduleTransactionRepositories } from "@/platform/timekeeping/work-schedule-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import type { DomainEvent } from "@/platform/events/domain-event";

/** A Prisma client able to own an interactive transaction spanning work schedule, audit, and outbox tables. */
export type PrismaWorkScheduleTransactionRunner = Readonly<{
  $transaction<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}>;

/**
 * Durable transaction coordinator for WorkSchedule. Mirrors
 * PrismaAttendanceEventUnitOfWork/PrismaLegalEntityUnitOfWork: the write
 * (create/updateDetails/createVersion/replaceDraftVersionContent/
 * activateVersion), audit records, and outbox messages commit atomically
 * inside one Prisma $transaction; domain events are released to their
 * collector only after that commit succeeds. activateVersion's two row
 * updates (supersede + activate) happen inside this same transaction, so
 * the database's partial unique index can never observe an intermediate
 * two-ACTIVE state even under a rollback.
 */
export class PrismaWorkScheduleUnitOfWork implements UnitOfWork<WorkScheduleTransactionRepositories> {
  constructor(
    private readonly prisma: PrismaWorkScheduleTransactionRunner,
    private readonly eventCollector: DomainEventCollector,
    private readonly auditCollector: AuditCollector,
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly auditRepositoryFactory: (client: ConstructorParameters<typeof PrismaAuditRecordRepository>[0]) => ImmutableAuditRecordRepository = (client) => new PrismaAuditRecordRepository(client),
    private readonly outboxRepositoryFactory: (client: ConstructorParameters<typeof PrismaOutboxRepository>[0]) => OutboxRepository = (client) => new PrismaOutboxRepository(client),
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<WorkScheduleTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const committed = await this.prisma.$transaction(async (client) => {
      const workSchedules = new WorkScheduleWriteTransaction(new PrismaWorkScheduleWriteRepository(client), transactionContext);
      const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ workSchedules }) });
      const result = await operation(transaction);
      const events = workSchedules.pullEvents();
      const records = this.createAuditRecords(transactionContext, events);
      await this.auditRepositoryFactory(client).append(records);
      const messages = events.map(toOutboxMessage);
      await this.outboxRepositoryFactory(client).append(messages);
      return Object.freeze({ result, events, records, messages });
    });

    this.eventCollector.collect(committed.events);
    this.auditCollector.collect(committed.records);
    return committed.result;
  }

  private createAuditRecords(context: UnitOfWorkTransaction<WorkScheduleTransactionRepositories>["context"], events: readonly DomainEvent[]) {
    const { actorUserId, requestId, commandName } = context;
    if (!actorUserId || !requestId || !commandName) return [];
    return events.map((event) => this.auditRecords.timekeepingEvent({
      tenantId: context.tenantId,
      actorUserId,
      requestId,
      correlationId: context.correlationId,
      transactionId: context.transactionId,
      commandName,
    }, event));
  }
}
