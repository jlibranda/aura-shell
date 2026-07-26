import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { WorkScheduleRecord, WorkScheduleVersionRecord } from "@/platform/timekeeping/work-schedule";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function workScheduleEvent(
  eventName: string,
  schedule: WorkScheduleRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "work_schedule",
    aggregateId: schedule.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      workScheduleId: schedule.id,
      code: schedule.code,
      name: schedule.name,
    },
  }, ids, clock);
}

export function createWorkScheduleCreatedEvent(schedule: WorkScheduleRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleEvent("timekeeping.work_schedule.created", schedule, context, ids, clock);
}

export function createWorkScheduleDetailsUpdatedEvent(schedule: WorkScheduleRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleEvent("timekeeping.work_schedule.details_updated", schedule, context, ids, clock);
}

function workScheduleVersionEvent(
  eventName: string,
  version: WorkScheduleVersionRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "work_schedule_version",
    aggregateId: version.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      workScheduleVersionId: version.id,
      workScheduleId: version.workScheduleId,
      versionNumber: version.versionNumber,
      status: version.status,
      scheduleType: version.scheduleType,
    },
  }, ids, clock);
}

export function createWorkScheduleVersionCreatedEvent(version: WorkScheduleVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleVersionEvent("timekeeping.work_schedule.version_created", version, context, ids, clock);
}

/**
 * Distinct from version_created — mirrors Configuration's own
 * draft_created/draft_updated split (configuration-events.ts) for the
 * identical scenario (a DRAFT row's content is replaced in place before
 * activation). Never emitted for ACTIVE/RETIRED content, which cannot
 * be replaced at all.
 */
export function createWorkScheduleVersionDraftUpdatedEvent(version: WorkScheduleVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleVersionEvent("timekeeping.work_schedule.version_draft_updated", version, context, ids, clock);
}

export function createWorkScheduleVersionActivatedEvent(version: WorkScheduleVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleVersionEvent("timekeeping.work_schedule.version_activated", version, context, ids, clock);
}

/** The event name stays "superseded" — it names the action; the version's persisted status transitions to RETIRED (Slice 3 status rename). */
export function createWorkScheduleVersionSupersededEvent(version: WorkScheduleVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return workScheduleVersionEvent("timekeeping.work_schedule.version_superseded", version, context, ids, clock);
}
