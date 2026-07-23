import { randomUUID } from "node:crypto";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import type { AuditCollector } from "@/platform/auditing/audit-collector";
import type { ImmutableAuditRecordRepository } from "@/platform/auditing/immutable-audit-record-repository";
import type { DomainEventCollector } from "@/platform/events/domain-event-collector";
import { PrismaAuditRecordRepository } from "@/platform/auditing/prisma-audit-record-repository";
import { PrismaOutboxRepository } from "@/platform/outbox/prisma-outbox-repository";
import type { OutboxRepository } from "@/platform/outbox/outbox-repository";
import { toOutboxMessage } from "@/platform/outbox/outbox-message";
import { PrismaEmployeeAggregateRepository, type EmployeeAggregateIdentifierGenerator, PrismaEmployeeAggregateTransaction } from "@/platform/people/persistence/prisma-employee-aggregate-repository";
import type { PrismaTransactionRunner } from "@/platform/people/persistence/prisma-persistence-types";
import type { EmployeeAggregateRepository } from "@/platform/people/persistence/employee-aggregate-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";

export type PrismaEmployeeTransactionRepositories = Readonly<{ employees: EmployeeAggregateRepository }>;

/**
 * Durable transaction coordinator. Employee and audit writes commit atomically;
 * domain events are released to their collector only after that commit succeeds.
 */
export class PrismaEmployeeUnitOfWork implements UnitOfWork<PrismaEmployeeTransactionRepositories> {
  constructor(
    private readonly prisma: PrismaTransactionRunner,
    private readonly eventCollector: DomainEventCollector,
    private readonly auditCollector: AuditCollector,
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly identifiers?: EmployeeAggregateIdentifierGenerator,
    private readonly auditRepositoryFactory: (client: ConstructorParameters<typeof PrismaAuditRecordRepository>[0]) => ImmutableAuditRecordRepository = (client) => new PrismaAuditRecordRepository(client),
    private readonly outboxRepositoryFactory: (client: ConstructorParameters<typeof PrismaOutboxRepository>[0]) => OutboxRepository = (client) => new PrismaOutboxRepository(client),
  ) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<PrismaEmployeeTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const committed = await this.prisma.$transaction(async (client) => {
      const employees = new PrismaEmployeeAggregateRepository(client, this.identifiers).forTransaction(transactionContext);
      const transaction = Object.freeze({
        context: transactionContext,
        repositories: Object.freeze({ employees }),
      });
      const result = await operation(transaction);
      const events = employees.pullEvents();
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

  private createAuditRecords(context: UnitOfWorkTransaction<PrismaEmployeeTransactionRepositories>["context"], events: readonly import("@/platform/events/domain-event").DomainEvent[]) {
    const { actorUserId, requestId, commandName } = context;
    if (!actorUserId || !requestId || !commandName) return [];
    return events.map((event) => this.auditRecords.employeeCreated({
      tenantId: context.tenantId,
      actorUserId,
      requestId,
      correlationId: context.correlationId,
      transactionId: context.transactionId,
      commandName,
    }, event));
  }
}
