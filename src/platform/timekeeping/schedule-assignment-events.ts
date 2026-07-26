import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function scheduleAssignmentEvent(
  eventName: string,
  assignment: ScheduleAssignmentRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "schedule_assignment",
    aggregateId: assignment.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      scheduleAssignmentId: assignment.id,
      personId: assignment.personId,
      workScheduleId: assignment.workScheduleId,
      workScheduleVersionId: assignment.workScheduleVersionId,
      effectiveFrom: assignment.effectiveFrom,
      ...(assignment.effectiveUntil ? { effectiveUntil: assignment.effectiveUntil } : {}),
      ...(assignment.changeReason ? { changeReason: assignment.changeReason } : {}),
    },
  }, ids, clock);
}

/** Emitted whenever a new assignment opens — the first assignment for a person, or the replacement half of a transfer (Slice 4 Decision 13). */
export function createScheduleAssignmentCreatedEvent(assignment: ScheduleAssignmentRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return scheduleAssignmentEvent("timekeeping.schedule_assignment.created", assignment, context, ids, clock);
}

/**
 * Emitted whenever an assignment's window is closed — a plain end, or the
 * superseded half of a transfer. A transfer therefore produces both an
 * `ended` event (the closed record) and a `created` event (the new one)
 * inside the same transaction, in that order (Slice 4 Decision 13). There is
 * deliberately no separate `transferred` event — one atomic operation, two
 * events that already explain the transition.
 */
export function createScheduleAssignmentEndedEvent(assignment: ScheduleAssignmentRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return scheduleAssignmentEvent("timekeeping.schedule_assignment.ended", assignment, context, ids, clock);
}

/**
 * Emitted only by cancelFutureAssignment. Distinct from `ended` because
 * cancellation does not shorten the assignment's effective window and only
 * ever applies before it begins (Slice 4 Decision 7/13). Payload carries the
 * cancellation timestamp/reason instead of an effectiveUntil, since the
 * window itself is unchanged.
 */
export function createScheduleAssignmentFutureCancelledEvent(assignment: ScheduleAssignmentRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return createDomainEvent({
    eventName: "timekeeping.schedule_assignment.future_cancelled",
    aggregateType: "schedule_assignment",
    aggregateId: assignment.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      scheduleAssignmentId: assignment.id,
      personId: assignment.personId,
      workScheduleId: assignment.workScheduleId,
      workScheduleVersionId: assignment.workScheduleVersionId,
      effectiveFrom: assignment.effectiveFrom,
      cancelledAt: assignment.cancelledAt,
      ...(assignment.cancellationReason ? { cancellationReason: assignment.cancellationReason } : {}),
    },
  }, ids, clock);
}
