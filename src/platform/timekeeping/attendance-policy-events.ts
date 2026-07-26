import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { AttendancePolicyRecord } from "@/platform/timekeeping/attendance-policy";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function attendancePolicyEvent(
  eventName: string,
  policy: AttendancePolicyRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "attendance_policy",
    aggregateId: policy.policyVersionId,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      policyId: policy.policyId,
      policyVersionId: policy.policyVersionId,
      scope: policy.scope,
      scopeId: policy.scopeId,
      effectiveFrom: policy.effectiveFrom,
      ...(policy.effectiveUntil ? { effectiveUntil: policy.effectiveUntil } : {}),
      fingerprint: policy.fingerprint,
      ...(policy.changeReason ? { changeReason: policy.changeReason } : {}),
    },
  }, ids, clock);
}

/** Emitted whenever a new policy version opens — the first version for a lineage, or the replacement half of a replace (mirrors ScheduleAssignment's created/ended pairing). */
export function createAttendancePolicyCreatedEvent(policy: AttendancePolicyRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return attendancePolicyEvent("timekeeping.attendance_policy.created", policy, context, ids, clock);
}

/**
 * Emitted whenever a policy version's window is closed — a plain end, or the
 * superseded half of a replace. A replace therefore produces both an
 * `ended` event (the closed record) and a `created` event (the new one)
 * inside the same transaction, in that order — there is deliberately no
 * separate `replaced` event, the same reasoning ScheduleAssignment's
 * transfer uses.
 */
export function createAttendancePolicyEndedEvent(policy: AttendancePolicyRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return attendancePolicyEvent("timekeeping.attendance_policy.ended", policy, context, ids, clock);
}
