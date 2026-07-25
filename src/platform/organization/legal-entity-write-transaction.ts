import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  CreateLegalEntityInput,
  LegalEntityWriteRepository,
  UpdateLegalEntityDetailsInput,
} from "@/platform/organization/legal-entity-repository";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";
import {
  createLegalEntityArchivedEvent,
  createLegalEntityCreatedEvent,
  createLegalEntityUpdatedEvent,
} from "@/platform/organization/legal-entity-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around a LegalEntityWriteRepository that
 * buffers one DomainEvent per successful mutation, mirroring the
 * OrgUnit/Location/Assignment pattern so the LegalEntity UnitOfWork can
 * commit writes, audits, and outbox messages atomically and release events
 * only after that commit succeeds. Read methods pass through and emit no
 * event.
 */
export class LegalEntityWriteTransaction implements LegalEntityWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: LegalEntityWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<LegalEntityRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  findByCode(tenantId: string, code: string): Promise<LegalEntityRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findByCode(tenantId, code);
  }

  async create(input: CreateLegalEntityInput): Promise<LegalEntityRecord> {
    this.assertTenant(input.tenantId);
    const entity = await this.repository.create(input);
    this.events.push(createLegalEntityCreatedEvent(entity, this.eventContext(), this.eventIds, this.eventClock));
    return entity;
  }

  async updateDetails(input: UpdateLegalEntityDetailsInput): Promise<LegalEntityRecord> {
    this.assertTenant(input.tenantId);
    const entity = await this.repository.updateDetails(input);
    this.events.push(createLegalEntityUpdatedEvent(entity, this.eventContext(), this.eventIds, this.eventClock));
    return entity;
  }

  async archive(tenantId: string, id: string): Promise<LegalEntityRecord> {
    this.assertTenant(tenantId);
    const entity = await this.repository.archive(tenantId, id);
    this.events.push(createLegalEntityArchivedEvent(entity, this.eventContext(), this.eventIds, this.eventClock));
    return entity;
  }

  pullEvents(): readonly DomainEvent[] { return this.events.splice(0, this.events.length); }
  clearEvents(): void { this.events.length = 0; }

  private eventContext(): Readonly<{ tenantId: string; correlationId: string }> {
    return Object.freeze({ tenantId: this.context.tenantId, correlationId: this.context.correlationId });
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== this.context.tenantId) {
      throw Object.freeze({ code: "TENANT_MISMATCH", message: "Transaction access must use its trusted tenant." });
    }
  }
}
