import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { LegalEntityStore, InMemoryLegalEntityWriteRepository } from "@/platform/organization/in-memory-legal-entity-repository";
import { LegalEntityWriteTransaction } from "@/platform/organization/legal-entity-write-transaction";
import type { LegalEntityTransactionRepositories } from "@/platform/organization/legal-entity-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryLegalEntityUnitOfWork implements UnitOfWork<LegalEntityTransactionRepositories> {
  constructor(
    private readonly store: LegalEntityStore = new LegalEntityStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): LegalEntityStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<LegalEntityTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.legalEntities];
    const legalEntities = new LegalEntityWriteTransaction(new InMemoryLegalEntityWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ legalEntities }) });

    try {
      const result = await operation(transaction);
      const events = legalEntities.pullEvents();
      this.eventCollector.collect(events);
      const { actorUserId, requestId, commandName } = transactionContext;
      if (actorUserId && requestId && commandName) {
        this.auditCollector.collect(events.map((event) => this.auditRecords.organizationEvent({
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
      this.store.legalEntities.length = 0;
      this.store.legalEntities.push(...snapshot);
      legalEntities.clearEvents();
      throw error;
    }
  }
}
