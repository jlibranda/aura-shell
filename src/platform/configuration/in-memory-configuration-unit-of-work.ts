import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { ConfigurationStore, InMemoryConfigurationWriteRepository } from "@/platform/configuration/in-memory-configuration-repository";
import { ConfigurationWriteTransaction } from "@/platform/configuration/configuration-write-transaction";
import type { ConfigurationTransactionRepositories } from "@/platform/configuration/configuration-repository";

/** In-memory transaction coordinator for server-side tests and development only. */
export class InMemoryConfigurationUnitOfWork implements UnitOfWork<ConfigurationTransactionRepositories> {
  constructor(
    private readonly store: ConfigurationStore = new ConfigurationStore(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
  ) {}

  getStore(): ConfigurationStore { return this.store; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<ConfigurationTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const definitionsSnapshot = [...this.store.definitions];
    const versionsSnapshot = [...this.store.versions];
    const configuration = new ConfigurationWriteTransaction(new InMemoryConfigurationWriteRepository(this.store), transactionContext);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ configuration }) });

    try {
      const result = await operation(transaction);
      const events = configuration.pullEvents();
      this.eventCollector.collect(events);
      const { actorUserId, requestId, commandName } = transactionContext;
      if (actorUserId && requestId && commandName) {
        this.auditCollector.collect(events.map((event) => this.auditRecords.configurationEvent({
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
      this.store.definitions.length = 0;
      this.store.definitions.push(...definitionsSnapshot);
      this.store.versions.length = 0;
      this.store.versions.push(...versionsSnapshot);
      configuration.clearEvents();
      throw error;
    }
  }
}
