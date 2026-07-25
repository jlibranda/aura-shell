import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { OrgUnitStore, InMemoryOrgUnitWriteRepository } from "@/platform/organization/in-memory-org-unit-repository";
import { OrgUnitWriteTransaction } from "@/platform/organization/org-unit-write-transaction";
import type { OrgUnitTransactionRepositories } from "@/platform/organization/org-unit-repository";
import { LegalEntityStore, InMemoryLegalEntityWriteRepository } from "@/platform/organization/in-memory-legal-entity-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryOrgUnitUnitOfWork implements UnitOfWork<OrgUnitTransactionRepositories> {
  constructor(
    private readonly store: OrgUnitStore = new OrgUnitStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly legalEntityStore: LegalEntityStore = new LegalEntityStore(),
  ) {}

  getStore(): OrgUnitStore { return this.store; }
  getLegalEntityStore(): LegalEntityStore { return this.legalEntityStore; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<OrgUnitTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.units];
    const orgUnits = new OrgUnitWriteTransaction(new InMemoryOrgUnitWriteRepository(this.store), transactionContext);
    const legalEntities = new InMemoryLegalEntityWriteRepository(this.legalEntityStore);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ orgUnits, legalEntities }) });

    try {
      const result = await operation(transaction);
      const events = orgUnits.pullEvents();
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
      this.store.units.length = 0;
      this.store.units.push(...snapshot);
      orgUnits.clearEvents();
      throw error;
    }
  }
}
