import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  CreateLocationInput,
  LocationWriteRepository,
  UpdateLocationDetailsInput,
} from "@/platform/organization/location-repository";
import type { LocationRecord } from "@/platform/organization/location";
import {
  createLocationArchivedEvent,
  createLocationCreatedEvent,
  createLocationUpdatedEvent,
} from "@/platform/organization/location-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around a LocationWriteRepository that buffers
 * one DomainEvent per successful mutation, mirroring the OrgUnit/Assignment
 * pattern so the Location UnitOfWork can commit writes, audits, and outbox
 * messages atomically and release events only after that commit succeeds.
 * Read methods (findById/findByCode) pass through and emit no event.
 */
export class LocationWriteTransaction implements LocationWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: LocationWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<LocationRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  findByCode(tenantId: string, code: string): Promise<LocationRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findByCode(tenantId, code);
  }

  async create(input: CreateLocationInput): Promise<LocationRecord> {
    this.assertTenant(input.tenantId);
    const location = await this.repository.create(input);
    this.events.push(createLocationCreatedEvent(location, this.eventContext(), this.eventIds, this.eventClock));
    return location;
  }

  async updateDetails(input: UpdateLocationDetailsInput): Promise<LocationRecord> {
    this.assertTenant(input.tenantId);
    const location = await this.repository.updateDetails(input);
    this.events.push(createLocationUpdatedEvent(location, this.eventContext(), this.eventIds, this.eventClock));
    return location;
  }

  async archive(tenantId: string, id: string): Promise<LocationRecord> {
    this.assertTenant(tenantId);
    const location = await this.repository.archive(tenantId, id);
    this.events.push(createLocationArchivedEvent(location, this.eventContext(), this.eventIds, this.eventClock));
    return location;
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
