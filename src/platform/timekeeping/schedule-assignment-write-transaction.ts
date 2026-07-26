import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  CancelFutureScheduleAssignmentInput,
  CreateScheduleAssignmentInput,
  EndScheduleAssignmentInput,
  ScheduleAssignmentWriteRepository,
} from "@/platform/timekeeping/schedule-assignment-repository";
import type { ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";
import {
  createScheduleAssignmentCreatedEvent,
  createScheduleAssignmentEndedEvent,
  createScheduleAssignmentFutureCancelledEvent,
} from "@/platform/timekeeping/schedule-assignment-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around a ScheduleAssignmentWriteRepository
 * that buffers one DomainEvent per successful mutation, mirroring the
 * Assignment/WorkSchedule pattern. A transfer is two mutations (end + create)
 * performed by the service as two separate calls through this same
 * decorator, so it naturally buffers an `ended` event followed by a
 * `created` event (Slice 4 Decision 13). Read methods
 * (findById/listForPerson/findCurrentForPerson) pass through and emit no
 * event.
 */
export class ScheduleAssignmentWriteTransaction implements ScheduleAssignmentWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: ScheduleAssignmentWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<ScheduleAssignmentRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  listForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.listForPerson(tenantId, personId);
  }

  findCurrentForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findCurrentForPerson(tenantId, personId);
  }

  async create(input: CreateScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    this.assertTenant(input.tenantId);
    const assignment = await this.repository.create(input);
    this.events.push(createScheduleAssignmentCreatedEvent(assignment, this.eventContext(), this.eventIds, this.eventClock));
    return assignment;
  }

  async end(input: EndScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    this.assertTenant(input.tenantId);
    const assignment = await this.repository.end(input);
    this.events.push(createScheduleAssignmentEndedEvent(assignment, this.eventContext(), this.eventIds, this.eventClock));
    return assignment;
  }

  async cancelFuture(input: CancelFutureScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    this.assertTenant(input.tenantId);
    const assignment = await this.repository.cancelFuture(input);
    this.events.push(createScheduleAssignmentFutureCancelledEvent(assignment, this.eventContext(), this.eventIds, this.eventClock));
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
