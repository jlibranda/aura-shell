import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  CreateOrgUnitInput,
  MoveOrgUnitInput,
  OrgUnitWriteRepository,
  RenameOrgUnitInput,
} from "@/platform/organization/org-unit-repository";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import {
  createOrgUnitArchivedEvent,
  createOrgUnitCreatedEvent,
  createOrgUnitMovedEvent,
  createOrgUnitRenamedEvent,
} from "@/platform/organization/org-unit-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around an OrgUnitWriteRepository that buffers one
 * DomainEvent per successful mutation, mirroring the configuration/employee
 * pattern so the OrgUnit UnitOfWork can commit writes, audits, and outbox
 * messages atomically and release events only after that commit succeeds.
 * Read methods (findById/findByCode/listAll) pass through and emit no event.
 */
export class OrgUnitWriteTransaction implements OrgUnitWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: OrgUnitWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<OrgUnitRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  findByCode(tenantId: string, code: string): Promise<OrgUnitRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findByCode(tenantId, code);
  }

  listAll(tenantId: string): Promise<OrgUnitRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.listAll(tenantId);
  }

  async create(input: CreateOrgUnitInput): Promise<OrgUnitRecord> {
    this.assertTenant(input.tenantId);
    const unit = await this.repository.create(input);
    this.events.push(createOrgUnitCreatedEvent(unit, this.eventContext(), this.eventIds, this.eventClock));
    return unit;
  }

  async rename(input: RenameOrgUnitInput): Promise<OrgUnitRecord> {
    this.assertTenant(input.tenantId);
    const unit = await this.repository.rename(input);
    this.events.push(createOrgUnitRenamedEvent(unit, this.eventContext(), this.eventIds, this.eventClock));
    return unit;
  }

  async move(input: MoveOrgUnitInput): Promise<OrgUnitRecord> {
    this.assertTenant(input.tenantId);
    const unit = await this.repository.move(input);
    this.events.push(createOrgUnitMovedEvent(unit, this.eventContext(), this.eventIds, this.eventClock));
    return unit;
  }

  async archive(tenantId: string, id: string): Promise<OrgUnitRecord> {
    this.assertTenant(tenantId);
    const unit = await this.repository.archive(tenantId, id);
    this.events.push(createOrgUnitArchivedEvent(unit, this.eventContext(), this.eventIds, this.eventClock));
    return unit;
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
