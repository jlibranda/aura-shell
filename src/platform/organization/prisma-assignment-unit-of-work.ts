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
import { PrismaAssignmentWriteRepository } from "@/platform/organization/prisma-assignment-write-repository";
import { AssignmentWriteTransaction } from "@/platform/organization/assignment-write-transaction";
import { PrismaOrgUnitWriteRepository } from "@/platform/organization/prisma-org-unit-write-repository";
import { PrismaLocationWriteRepository } from "@/platform/organization/prisma-location-write-repository";
import { PrismaPersonExistenceRepository } from "@/platform/organization/prisma-person-existence-repository";
import type { AssignmentTransactionRepositories } from "@/platform/organization/assignment-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import type { DomainEvent } from "@/platform/events/domain-event";

/** A Prisma client able to own an interactive transaction spanning assignment, org-unit, employee, audit, and outbox tables. */
export type PrismaAssignmentTransactionRunner = Readonly<{
  $transaction<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}>;

/**
 * Durable transaction coordinator for placement. Mirrors
 * PrismaOrgUnitUnitOfWork: assignment writes, audit records, and outbox
 * messages commit atomically inside one Prisma $transaction; domain events
 * are released to their collector only after that commit succeeds. `orgUnits`
 * and `people` are exposed read-only, for the service's in-transaction
 * existence checks (ADR-012 §7).
 */
export class PrismaAssignmentUnitOfWork implements UnitOfWork<AssignmentTransactionRepositories> {
  constructor(
    private readonly prisma: PrismaAssignmentTransactionRunner,
    private readonly eventCollector: DomainEventCollector,
    private readonly auditCollector: AuditCollector,
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly auditRepositoryFactory: (client: ConstructorParameters<typeof PrismaAuditRecordRepository>[0]) => ImmutableAuditRecordRepository = (client) => new PrismaAuditRecordRepository(client),
    private readonly outboxRepositoryFactory: (client: ConstructorParameters<typeof PrismaOutboxRepository>[0]) => OutboxRepository = (client) => new PrismaOutboxRepository(client),
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<AssignmentTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const committed = await this.prisma.$transaction(async (client) => {
      const assignments = new AssignmentWriteTransaction(new PrismaAssignmentWriteRepository(client), transactionContext);
      const orgUnits = new PrismaOrgUnitWriteRepository(client);
      const locations = new PrismaLocationWriteRepository(client);
      const people = new PrismaPersonExistenceRepository(client);
      const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ assignments, orgUnits, locations, people }) });
      const result = await operation(transaction);
      const events = assignments.pullEvents();
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

  private createAuditRecords(context: UnitOfWorkTransaction<AssignmentTransactionRepositories>["context"], events: readonly DomainEvent[]) {
    const { actorUserId, requestId, commandName } = context;
    if (!actorUserId || !requestId || !commandName) return [];
    return events.map((event) => this.auditRecords.organizationEvent({
      tenantId: context.tenantId,
      actorUserId,
      requestId,
      correlationId: context.correlationId,
      transactionId: context.transactionId,
      commandName,
    }, event));
  }
}
