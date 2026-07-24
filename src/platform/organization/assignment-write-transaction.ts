import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  AssignPrimaryInput,
  AssignmentWriteRepository,
  EndAssignmentInput,
} from "@/platform/organization/assignment-repository";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import { createAssignmentAssignedEvent, createAssignmentEndedEvent } from "@/platform/organization/assignment-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around an AssignmentWriteRepository that
 * buffers one DomainEvent per successful mutation, mirroring the OrgUnit
 * pattern so the Assignment UnitOfWork can commit writes, audits, and outbox
 * messages atomically and release events only after that commit succeeds. A
 * transfer is two mutations (end + create) in the same transaction, so it
 * naturally buffers an `ended` event followed by an `assigned` event. Read
 * methods (findById/listForPerson/findCurrentPrimaryForPerson) pass through
 * and emit no event.
 */
export class AssignmentWriteTransaction implements AssignmentWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: AssignmentWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<AssignmentRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  listForPerson(tenantId: string, personId: string): Promise<AssignmentRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.listForPerson(tenantId, personId);
  }

  findCurrentPrimaryForPerson(tenantId: string, personId: string): Promise<AssignmentRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findCurrentPrimaryForPerson(tenantId, personId);
  }

  async create(input: AssignPrimaryInput): Promise<AssignmentRecord> {
    this.assertTenant(input.tenantId);
    const assignment = await this.repository.create(input);
    this.events.push(createAssignmentAssignedEvent(assignment, this.eventContext(), this.eventIds, this.eventClock));
    return assignment;
  }

  async end(input: EndAssignmentInput): Promise<AssignmentRecord> {
    this.assertTenant(input.tenantId);
    const assignment = await this.repository.end(input);
    this.events.push(createAssignmentEndedEvent(assignment, this.eventContext(), this.eventIds, this.eventClock));
    return assignment;
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
