import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  AttendancePolicyWriteRepository,
  CreateAttendancePolicyInput,
  EndAttendancePolicyRepositoryInput,
} from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyRecord, PolicyScope } from "@/platform/timekeeping/attendance-policy";
import { createAttendancePolicyCreatedEvent, createAttendancePolicyEndedEvent } from "@/platform/timekeeping/attendance-policy-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around an AttendancePolicyWriteRepository
 * that buffers one DomainEvent per successful mutation, mirroring the
 * ScheduleAssignmentWriteTransaction pattern. A replace is two mutations
 * (end + create) performed by the service as two separate calls through this
 * same decorator, so it naturally buffers an `ended` event followed by a
 * `created` event. Read methods pass through and emit no event.
 */
export class AttendancePolicyWriteTransaction implements AttendancePolicyWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: AttendancePolicyWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, attendancePolicyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, attendancePolicyVersionId);
  }

  listForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.listForScope(tenantId, scope, scopeId);
  }

  findCurrentForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findCurrentForScope(tenantId, scope, scopeId);
  }

  async create(input: CreateAttendancePolicyInput): Promise<AttendancePolicyRecord> {
    this.assertTenant(input.tenantId);
    const policy = await this.repository.create(input);
    this.events.push(createAttendancePolicyCreatedEvent(policy, this.eventContext(), this.eventIds, this.eventClock));
    return policy;
  }

  async end(input: EndAttendancePolicyRepositoryInput): Promise<AttendancePolicyRecord> {
    this.assertTenant(input.tenantId);
    const policy = await this.repository.end(input);
    this.events.push(createAttendancePolicyEndedEvent(policy, this.eventContext(), this.eventIds, this.eventClock));
    return policy;
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
