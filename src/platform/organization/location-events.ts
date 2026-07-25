import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { LocationRecord } from "@/platform/organization/location";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function locationEvent(
  eventName: string,
  location: LocationRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "location",
    aggregateId: location.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      locationId: location.id,
      code: location.code,
      countryCode: location.countryCode,
      timezone: location.timezone,
      status: location.status,
    },
  }, ids, clock);
}

export function createLocationCreatedEvent(location: LocationRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return locationEvent("organization.location.created", location, context, ids, clock);
}

export function createLocationUpdatedEvent(location: LocationRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return locationEvent("organization.location.updated", location, context, ids, clock);
}

export function createLocationArchivedEvent(location: LocationRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return locationEvent("organization.location.archived", location, context, ids, clock);
}
