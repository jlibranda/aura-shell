import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function legalEntityEvent(
  eventName: string,
  entity: LegalEntityRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "legal_entity",
    aggregateId: entity.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      legalEntityId: entity.id,
      code: entity.code,
      countryCode: entity.countryCode,
      status: entity.status,
    },
  }, ids, clock);
}

export function createLegalEntityCreatedEvent(entity: LegalEntityRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return legalEntityEvent("organization.legal_entity.created", entity, context, ids, clock);
}

export function createLegalEntityUpdatedEvent(entity: LegalEntityRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return legalEntityEvent("organization.legal_entity.updated", entity, context, ids, clock);
}

export function createLegalEntityArchivedEvent(entity: LegalEntityRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return legalEntityEvent("organization.legal_entity.archived", entity, context, ids, clock);
}
