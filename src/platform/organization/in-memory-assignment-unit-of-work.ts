import { randomUUID } from "node:crypto";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";
import { InMemoryDomainEventCollector, type DomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector, type AuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { AssignmentStore, InMemoryAssignmentWriteRepository } from "@/platform/organization/in-memory-assignment-repository";
import { AssignmentWriteTransaction } from "@/platform/organization/assignment-write-transaction";
import { OrgUnitStore, InMemoryOrgUnitWriteRepository } from "@/platform/organization/in-memory-org-unit-repository";
import { LocationStore, InMemoryLocationWriteRepository } from "@/platform/organization/in-memory-location-repository";
import { InMemoryPersonExistenceRepository } from "@/platform/organization/in-memory-person-existence-repository";
import type { AssignmentTransactionRepositories } from "@/platform/organization/assignment-repository";

/**
 * In-memory transaction coordinator for server-side tests and development
 * only. Exposes the backing org-unit store and person-existence registry so a
 * test can seed the org units and employees an assignment must validate
 * against, in the same way the Prisma adapter reads live tenant data.
 */
export class InMemoryAssignmentUnitOfWork implements UnitOfWork<AssignmentTransactionRepositories> {
  constructor(
    private readonly store: AssignmentStore = new AssignmentStore(),
    private readonly orgUnitStore: OrgUnitStore = new OrgUnitStore(),
    private readonly people: InMemoryPersonExistenceRepository = new InMemoryPersonExistenceRepository(),
    private readonly eventCollector: DomainEventCollector = new InMemoryDomainEventCollector(),
    private readonly auditCollector: AuditCollector = new InMemoryAuditCollector(),
    private readonly auditRecords: AuditRecordFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() }),
    private readonly transactionIds: { next(): string } = { next: () => randomUUID() },
    private readonly locationStore: LocationStore = new LocationStore(),
  ) {}

  getStore(): AssignmentStore { return this.store; }
  getOrgUnitStore(): OrgUnitStore { return this.orgUnitStore; }
  getPeople(): InMemoryPersonExistenceRepository { return this.people; }
  getLocationStore(): LocationStore { return this.locationStore; }

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<AssignmentTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: this.transactionIds.next() });
    const snapshot = [...this.store.assignments];
    const assignments = new AssignmentWriteTransaction(new InMemoryAssignmentWriteRepository(this.store), transactionContext);
    const orgUnits = new InMemoryOrgUnitWriteRepository(this.orgUnitStore);
    const locations = new InMemoryLocationWriteRepository(this.locationStore);
    const transaction = Object.freeze({ context: transactionContext, repositories: Object.freeze({ assignments, orgUnits, locations, people: this.people }) });

    try {
      const result = await operation(transaction);
      const events = assignments.pullEvents();
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
      this.store.assignments.length = 0;
      this.store.assignments.push(...snapshot);
      assignments.clearEvents();
      throw error;
    }
  }
}
