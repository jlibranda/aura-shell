import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  AttendanceEventCreateOutcome,
  AttendanceEventDateRangeQuery,
  AttendanceEventWriteRepository,
  CreateAttendanceEventInput,
} from "@/platform/timekeeping/attendance-event-repository";
import type { AttendanceEventRecord } from "@/platform/timekeeping/attendance-event";
import { createAttendanceEventRecordedEvent } from "@/platform/timekeeping/attendance-event-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around an AttendanceEventWriteRepository,
 * mirroring the LegalEntity/OrgUnit/Location/Assignment pattern so the
 * AttendanceEvent UnitOfWork can commit the write, audit, and outbox message
 * atomically and release events only after that commit succeeds.
 *
 * A domain event is buffered only for a genuine "created" outcome. A
 * same-key/same-fact "replayed" outcome emits no second event and produces
 * no second audit entry (ADR-014 §4.3's idempotency rule); a "conflict"
 * outcome created nothing, so there is nothing to emit an event for either.
 */
export class AttendanceEventWriteTransaction implements AttendanceEventWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: AttendanceEventWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  async create(input: CreateAttendanceEventInput): Promise<AttendanceEventCreateOutcome> {
    this.assertTenant(input.tenantId);
    const outcome = await this.repository.create(input);
    if (outcome.kind === "created") {
      this.events.push(createAttendanceEventRecordedEvent(outcome.event, this.eventContext(), this.eventIds, this.eventClock));
    }
    return outcome;
  }

  findById(tenantId: string, id: string): Promise<AttendanceEventRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<AttendanceEventRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findByIdempotencyKey(tenantId, idempotencyKey);
  }

  listForPersonAndDateRange(query: AttendanceEventDateRangeQuery): Promise<AttendanceEventRecord[]> {
    this.assertTenant(query.tenantId);
    return this.repository.listForPersonAndDateRange(query);
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
