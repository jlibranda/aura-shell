import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { LocationStore, InMemoryLocationWriteRepository } from "@/platform/organization/in-memory-location-repository";
import { LocationWriteTransaction } from "@/platform/organization/location-write-transaction";
import type { LocationTransactionRepositories } from "@/platform/organization/location-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryLocationUnitOfWork implements UnitOfWork<LocationTransactionRepositories> {
  constructor(
    private readonly store: LocationStore = new LocationStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): LocationStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<LocationTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.locations];
    const locations = new LocationWriteTransaction(new InMemoryLocationWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ locations }) });

    try {
      const result = await operation(transaction);
      const events = locations.pullEvents();
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
      this.store.locations.length = 0;
      this.store.locations.push(...snapshot);
      locations.clearEvents();
      throw error;
    }
  }
}
