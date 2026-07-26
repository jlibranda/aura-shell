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
import { PrismaScheduleAssignmentWriteRepository } from "@/platform/timekeeping/prisma-schedule-assignment-write-repository";
import { ScheduleAssignmentWriteTransaction } from "@/platform/timekeeping/schedule-assignment-write-transaction";
import { PrismaWorkScheduleWriteRepository } from "@/platform/timekeeping/prisma-work-schedule-write-repository";
import { PrismaOrganizationAssignmentAsOfRepository } from "@/platform/timekeeping/prisma-organization-assignment-port";
import type { ScheduleAssignmentTransactionRepositories } from "@/platform/timekeeping/schedule-assignment-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import type { DomainEvent } from "@/platform/events/domain-event";

/** A Prisma client able to own an interactive transaction spanning schedule assignment, work schedule, assignment, audit, and outbox tables. */
export type PrismaScheduleAssignmentTransactionRunner = Readonly<{
  $transaction<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}>;

/**
 * Durable transaction coordinator for ScheduleAssignment. Mirrors
 * PrismaAssignmentUnitOfWork/PrismaWorkScheduleUnitOfWork: the write
 * (create/end/cancelFuture), audit records, and outbox messages commit
 * atomically inside one Prisma $transaction; domain events are released to
 * their collector only after that commit succeeds. `workSchedules` (a
 * read-only WorkScheduleVersion eligibility check) and
 * `organizationAssignments` (the ADR-014 §4.2 cross-aggregate invariant
 * check, Slice 4 Decision 9) are both constructed from the exact same
 * `client` the write uses, so every read this transaction performs shares
 * one Postgres transaction snapshot with the write — never a separate
 * connection or service call.
 */
export class PrismaScheduleAssignmentUnitOfWork implements UnitOfWork<ScheduleAssignmentTransactionRepositories> {
  constructor(
    private readonly prisma: PrismaScheduleAssignmentTransactionRunner,
    private readonly eventCollector: DomainEventCollector,
    private readonly auditCollector: AuditCollector,
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly auditRepositoryFactory: (client: ConstructorParameters<typeof PrismaAuditRecordRepository>[0]) => ImmutableAuditRecordRepository = (client) => new PrismaAuditRecordRepository(client),
    private readonly outboxRepositoryFactory: (client: ConstructorParameters<typeof PrismaOutboxRepository>[0]) => OutboxRepository = (client) => new PrismaOutboxRepository(client),
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<ScheduleAssignmentTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const committed = await this.prisma.$transaction(async (client) => {
      const scheduleAssignments = new ScheduleAssignmentWriteTransaction(new PrismaScheduleAssignmentWriteRepository(client), transactionContext);
      const workSchedules = new PrismaWorkScheduleWriteRepository(client);
      const organizationAssignments = new PrismaOrganizationAssignmentAsOfRepository(client);
      const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ scheduleAssignments, workSchedules, organizationAssignments }) });
      const result = await operation(transaction);
      const events = scheduleAssignments.pullEvents();
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

  private createAuditRecords(context: UnitOfWorkTransaction<ScheduleAssignmentTransactionRepositories>["context"], events: readonly DomainEvent[]) {
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
