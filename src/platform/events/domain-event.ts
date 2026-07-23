import { randomUUID } from "node:crypto";

/** Immutable fact emitted only after an authoritative server-side operation. */
export type DomainEvent = Readonly<{
  eventId: string;
  eventName: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  tenantId: string;
  correlationId: string;
  requestId: string;
  version: number;
  payload: Readonly<Record<string, unknown>>;
}>;

export interface EventIdGenerator {
  next(): string;
}

/** Server default; deterministic generators are injected by tests. */
export class ServerEventIdGenerator implements EventIdGenerator {
  next(): string { return randomUUID(); }
}

export class SequentialEventIdGenerator implements EventIdGenerator {
  private sequence = 0;
  constructor(private readonly prefix = "event") {}
  next(): string { this.sequence += 1; return `${this.prefix}-${String(this.sequence).padStart(4, "0")}`; }
}

export interface DomainEventClock {
  now(): string;
}

export function createDomainEvent(input: Omit<DomainEvent, "eventId" | "occurredAt">, ids: EventIdGenerator, clock: DomainEventClock): DomainEvent {
  return Object.freeze({
    ...input,
    eventId: ids.next(),
    occurredAt: clock.now(),
    payload: Object.freeze({ ...input.payload }),
  });
}
