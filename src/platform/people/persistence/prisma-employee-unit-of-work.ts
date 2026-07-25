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
import { PrismaAssignmentWriteRepository } from "@/platform/organization/prisma-assignment-write-repository";
import { AssignmentWriteTransaction } from "@/platform/organization/assignment-write-transaction";
import { PrismaOrgUnitWriteRepository } from "@/platform/organization/prisma-org-unit-write-repository";
import { PrismaLocationWriteRepository } from "@/platform/organization/prisma-location-write-repository";
import { PrismaLegalEntityWriteRepository } from "@/platform/organization/prisma-legal-entity-write-repository";
import { PrismaPersonExistenceRepository } from "@/platform/organization/prisma-person-existence-repository";
import type { AssignmentWriteRepository } from "@/platform/organization/assignment-repository";
import type { OrgUnitWriteRepository } from "@/platform/organization/org-unit-repository";
import type { LocationWriteRepository } from "@/platform/organization/location-repository";
import type { LegalEntityWriteRepository } from "@/platform/organization/legal-entity-repository";
import type { PersonExistenceRepository } from "@/platform/organization/person-existence-repository";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";

/**
 * `assignments`/`orgUnits`/`locations` let the hire command create the
 * employee's initial primary Assignment in the exact same Postgres
 * transaction as the Employee write (Hire Placement Alignment) — a
 * partially placed employee can never be created. `orgUnits`/`locations`
 * are read-only existence/eligibility checks here, mirroring how
 * AssignmentService itself uses them; nothing in this Unit of Work mutates
 * either.
 */
export type PrismaEmployeeTransactionRepositories = Readonly<{
  employees: EmployeeAggregateRepository;
  assignments: AssignmentWriteRepository;
  orgUnits: OrgUnitWriteRepository;
  locations: LocationWriteRepository;
  legalEntities: Pick<LegalEntityWriteRepository, "findById">;
  /** For the chosen manager's existence check only — the new hire's own existence is trivial (created earlier in the same transaction). */
  people: PersonExistenceRepository;
}>;

/**
 * Durable transaction coordinator. Employee, initial Assignment, and audit
 * writes commit atomically; domain events are released to their collector
 * only after that commit succeeds.
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
      const assignments = new AssignmentWriteTransaction(new PrismaAssignmentWriteRepository(client), transactionContext);
      const orgUnits = new PrismaOrgUnitWriteRepository(client);
      const locations = new PrismaLocationWriteRepository(client);
      const legalEntities = new PrismaLegalEntityWriteRepository(client);
      const people = new PrismaPersonExistenceRepository(client);
      const transaction = Object.freeze({
        context: transactionContext,
        repositories: Object.freeze({ employees, assignments, orgUnits, locations, legalEntities, people }),
      });
      const result = await operation(transaction);
      const events = [...employees.pullEvents(), ...assignments.pullEvents()];
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
    return events.map((event) => (event.aggregateType === "assignment"
      ? this.auditRecords.organizationEvent({
          tenantId: context.tenantId,
          actorUserId,
          requestId,
          correlationId: context.correlationId,
          transactionId: context.transactionId,
          commandName,
        }, event)
      : this.auditRecords.employeeCreated({
          tenantId: context.tenantId,
          actorUserId,
          requestId,
          correlationId: context.correlationId,
          transactionId: context.transactionId,
          commandName,
        }, event)));
  }
}
