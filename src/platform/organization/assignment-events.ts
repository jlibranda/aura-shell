import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { AssignmentRecord } from "@/platform/organization/assignment";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function assignmentEvent(
  eventName: string,
  assignment: AssignmentRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "assignment",
    aggregateId: assignment.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      assignmentId: assignment.id,
      personId: assignment.personId,
      orgUnitId: assignment.orgUnitId,
      ...(assignment.managerId ? { managerId: assignment.managerId } : {}),
      isPrimary: assignment.isPrimary,
      effectiveFrom: assignment.effectiveFrom,
      ...(assignment.effectiveUntil ? { effectiveUntil: assignment.effectiveUntil } : {}),
    },
  }, ids, clock);
}

/**
 * Emitted whenever a primary placement is created — a person's first
 * assignment, or the new record opened by a transfer (ADR-012 §7).
 */
export function createAssignmentAssignedEvent(assignment: AssignmentRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return assignmentEvent("organization.assignment.assigned", assignment, context, ids, clock);
}

/**
 * Emitted whenever a placement's window is closed — an offboarding, or the
 * old record closed by a transfer. A transfer therefore produces both an
 * `ended` event (the superseded record) and an `assigned` event (the new
 * one) inside the same transaction.
 */
export function createAssignmentEndedEvent(assignment: AssignmentRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return assignmentEvent("organization.assignment.ended", assignment, context, ids, clock);
}
