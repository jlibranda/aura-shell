import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { AttendanceEventRecord } from "@/platform/timekeeping/attendance-event";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

/**
 * There is only one lifecycle event for this aggregate — "recorded" — since
 * AttendanceEvent has no update/archive/delete operation to have an event
 * for (ADR-014 §4.3, §14).
 */
export function createAttendanceEventRecordedEvent(
  event: AttendanceEventRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName: "timekeeping.attendance_event.recorded",
    aggregateType: "attendance_event",
    aggregateId: event.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      attendanceEventId: event.id,
      personId: event.personId,
      occurredAtUtc: event.occurredAtUtc,
      source: event.source,
      ...(event.sourceRef ? { sourceRef: event.sourceRef } : {}),
      ...(event.eventType ? { eventType: event.eventType } : {}),
    },
  }, ids, clock);
}
