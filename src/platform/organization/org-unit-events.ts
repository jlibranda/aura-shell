import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function orgUnitEvent(
  eventName: string,
  unit: OrgUnitRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
  extraPayload: Readonly<Record<string, unknown>> = {},
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "org_unit",
    aggregateId: unit.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      orgUnitId: unit.id,
      code: unit.code,
      kind: unit.kind,
      ...(unit.parentId ? { parentId: unit.parentId } : {}),
      status: unit.status,
      ...extraPayload,
    },
  }, ids, clock);
}

export function createOrgUnitCreatedEvent(unit: OrgUnitRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return orgUnitEvent("organization.org_unit.created", unit, context, ids, clock);
}

export function createOrgUnitRenamedEvent(unit: OrgUnitRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return orgUnitEvent("organization.org_unit.renamed", unit, context, ids, clock);
}

export function createOrgUnitMovedEvent(unit: OrgUnitRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return orgUnitEvent("organization.org_unit.moved", unit, context, ids, clock, { parentId: unit.parentId ?? null });
}

export function createOrgUnitArchivedEvent(unit: OrgUnitRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return orgUnitEvent("organization.org_unit.archived", unit, context, ids, clock);
}
