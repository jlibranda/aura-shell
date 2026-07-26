import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  ActivateWorkScheduleVersionInput,
  ActivateWorkScheduleVersionOutcome,
  CreateWorkScheduleInput,
  CreateWorkScheduleVersionInput,
  ReplaceDraftWorkScheduleVersionContentInput,
  UpdateWorkScheduleDetailsInput,
  WorkScheduleWriteRepository,
} from "@/platform/timekeeping/work-schedule-repository";
import type { WorkScheduleRecord, WorkScheduleVersionRecord } from "@/platform/timekeeping/work-schedule";
import {
  createWorkScheduleCreatedEvent,
  createWorkScheduleDetailsUpdatedEvent,
  createWorkScheduleVersionActivatedEvent,
  createWorkScheduleVersionCreatedEvent,
  createWorkScheduleVersionDraftUpdatedEvent,
  createWorkScheduleVersionSupersededEvent,
} from "@/platform/timekeeping/work-schedule-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around a WorkScheduleWriteRepository that
 * buffers one DomainEvent per successful mutation, mirroring the
 * LegalEntity/OrgUnit/Assignment pattern. `activateVersion` buffers two
 * events atomically (superseded, then activated) only when the operation
 * as a whole succeeds — no event is ever emitted for a validation failure,
 * a "not_found"/"not_draft" outcome, or a rolled-back transaction (Slice 3
 * Decision 8).
 */
export class WorkScheduleWriteTransaction implements WorkScheduleWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: WorkScheduleWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findById(tenantId: string, id: string): Promise<WorkScheduleRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findById(tenantId, id);
  }

  findByCode(tenantId: string, code: string): Promise<WorkScheduleRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findByCode(tenantId, code);
  }

  async create(input: CreateWorkScheduleInput): Promise<WorkScheduleRecord> {
    this.assertTenant(input.tenantId);
    const schedule = await this.repository.create(input);
    this.events.push(createWorkScheduleCreatedEvent(schedule, this.eventContext(), this.eventIds, this.eventClock));
    return schedule;
  }

  async updateDetails(input: UpdateWorkScheduleDetailsInput): Promise<WorkScheduleRecord> {
    this.assertTenant(input.tenantId);
    const schedule = await this.repository.updateDetails(input);
    this.events.push(createWorkScheduleDetailsUpdatedEvent(schedule, this.eventContext(), this.eventIds, this.eventClock));
    return schedule;
  }

  findVersionById(tenantId: string, versionId: string): Promise<WorkScheduleVersionRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findVersionById(tenantId, versionId);
  }

  listVersionsForSchedule(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.listVersionsForSchedule(tenantId, workScheduleId);
  }

  getActiveVersion(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.getActiveVersion(tenantId, workScheduleId);
  }

  nextVersionNumber(tenantId: string, workScheduleId: string): Promise<number> {
    this.assertTenant(tenantId);
    return this.repository.nextVersionNumber(tenantId, workScheduleId);
  }

  async createVersion(input: CreateWorkScheduleVersionInput): Promise<WorkScheduleVersionRecord> {
    this.assertTenant(input.tenantId);
    const version = await this.repository.createVersion(input);
    this.events.push(createWorkScheduleVersionCreatedEvent(version, this.eventContext(), this.eventIds, this.eventClock));
    return version;
  }

  async replaceDraftVersionContent(input: ReplaceDraftWorkScheduleVersionContentInput): Promise<WorkScheduleVersionRecord | "not_found" | "not_draft"> {
    this.assertTenant(input.tenantId);
    const result = await this.repository.replaceDraftVersionContent(input);
    if (typeof result === "string") return result;
    this.events.push(createWorkScheduleVersionDraftUpdatedEvent(result, this.eventContext(), this.eventIds, this.eventClock));
    return result;
  }

  async activateVersion(input: ActivateWorkScheduleVersionInput): Promise<ActivateWorkScheduleVersionOutcome | "not_found" | "not_draft"> {
    this.assertTenant(input.tenantId);
    const result = await this.repository.activateVersion(input);
    if (typeof result === "string") return result;
    if (result.retired) this.events.push(createWorkScheduleVersionSupersededEvent(result.retired, this.eventContext(), this.eventIds, this.eventClock));
    this.events.push(createWorkScheduleVersionActivatedEvent(result.activated, this.eventContext(), this.eventIds, this.eventClock));
    return result;
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
