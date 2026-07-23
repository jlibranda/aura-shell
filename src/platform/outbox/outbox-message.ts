import type { DomainEvent } from "@/platform/events/domain-event";

export type OutboxMessageState = "pending" | "processing" | "retry" | "processed" | "dead_letter";
export type OutboxMessage = Readonly<{
  messageId: string; eventId: string; tenantId: string; eventName: string;
  aggregateType: string; aggregateId: string; correlationId: string;
  occurredAt: string; payload: Readonly<Record<string, unknown>>;
  state: OutboxMessageState; attempts: number; availableAt: string;
  processedAt?: string; lastError?: string;
  leaseOwner?: string; processingStartedAt?: string; leaseExpiresAt?: string; lastErrorCode?: string;
}>;

/** Event payloads are copied, never enriched from persistence. */
export function toOutboxMessage(event: DomainEvent): OutboxMessage {
  return Object.freeze({ messageId: event.eventId, eventId: event.eventId, tenantId: event.tenantId, eventName: event.eventName, aggregateType: event.aggregateType, aggregateId: event.aggregateId, correlationId: event.correlationId, occurredAt: event.occurredAt, payload: Object.freeze({ ...event.payload }), state: "pending", attempts: 0, availableAt: event.occurredAt });
}
