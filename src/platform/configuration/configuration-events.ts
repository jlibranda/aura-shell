import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";

type EventContext = Readonly<{ tenantId: string; correlationId: string }>;

function versionEvent(
  eventName: string,
  version: ConfigurationVersionRecord,
  context: EventContext,
  ids: EventIdGenerator,
  clock: DomainEventClock,
  extraPayload: Readonly<Record<string, unknown>> = {},
): DomainEvent {
  return createDomainEvent({
    eventName,
    aggregateType: "configuration_version",
    aggregateId: version.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: version.versionNumber,
    payload: {
      definitionId: version.definitionId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      ...extraPayload,
    },
  }, ids, clock);
}

export function createConfigurationDraftCreatedEvent(version: ConfigurationVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return versionEvent("configuration.draft.created", version, context, ids, clock);
}

export function createConfigurationDraftUpdatedEvent(version: ConfigurationVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return versionEvent("configuration.draft.updated", version, context, ids, clock);
}

export function createConfigurationDraftDiscardedEvent(version: ConfigurationVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return versionEvent("configuration.draft.discarded", version, context, ids, clock, { discarded: true });
}

export function createConfigurationVersionPublishedEvent(version: ConfigurationVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return versionEvent("configuration.version.published", version, context, ids, clock, {
    effectiveFrom: version.effectiveFrom,
    ...(version.effectiveUntil ? { effectiveUntil: version.effectiveUntil } : {}),
  });
}

export function createConfigurationVersionRetiredEvent(version: ConfigurationVersionRecord, context: EventContext, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return versionEvent("configuration.version.retired", version, context, ids, clock);
}
