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
import { PrismaAttendanceEventWriteRepository } from "@/platform/timekeeping/prisma-attendance-event-write-repository";
import { AttendanceEventWriteTransaction } from "@/platform/timekeeping/attendance-event-write-transaction";
import type { AttendanceEventTransactionRepositories } from "@/platform/timekeeping/attendance-event-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import type { DomainEvent } from "@/platform/events/domain-event";

/** A Prisma client able to own an interactive transaction spanning attendance event, audit, and outbox tables. */
export type PrismaAttendanceEventTransactionRunner = Readonly<{
  $transaction<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}>;

/**
 * Durable transaction coordinator for attendance events. Mirrors
 * PrismaLegalEntityUnitOfWork/PrismaOrgUnitUnitOfWork: the attendance event
 * write (create, or idempotent replay/conflict detection), audit records,
 * and outbox messages commit atomically inside one Prisma $transaction;
 * domain events are released to their collector only after that commit
 * succeeds. A replayed or conflicting outcome produces zero events and zero
 * audit records — nothing was created, so there is nothing to audit twice.
 */
export class PrismaAttendanceEventUnitOfWork implements UnitOfWork<AttendanceEventTransactionRepositories> {
  constructor(
    private readonly prisma: PrismaAttendanceEventTransactionRunner,
    private readonly eventCollector: DomainEventCollector,
    private readonly auditCollector: AuditCollector,
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly auditRepositoryFactory: (client: ConstructorParameters<typeof PrismaAuditRecordRepository>[0]) => ImmutableAuditRecordRepository = (client) => new PrismaAuditRecordRepository(client),
    private readonly outboxRepositoryFactory: (client: ConstructorParameters<typeof PrismaOutboxRepository>[0]) => OutboxRepository = (client) => new PrismaOutboxRepository(client),
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<AttendanceEventTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const committed = await this.prisma.$transaction(async (client) => {
      const attendanceEvents = new AttendanceEventWriteTransaction(new PrismaAttendanceEventWriteRepository(client), transactionContext);
      const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ attendanceEvents }) });
      const result = await operation(transaction);
      const events = attendanceEvents.pullEvents();
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

  private createAuditRecords(context: UnitOfWorkTransaction<AttendanceEventTransactionRepositories>["context"], events: readonly DomainEvent[]) {
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
