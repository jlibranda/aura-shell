import type { DomainEvent } from "@/platform/events/domain-event";

/** Inspection seam for committed events. This is deliberately not a publisher. */
export interface DomainEventCollector {
  collect(events: readonly DomainEvent[]): void;
  list(): readonly DomainEvent[];
  clear(): void;
}

export class InMemoryDomainEventCollector implements DomainEventCollector {
  private events: DomainEvent[] = [];

  collect(events: readonly DomainEvent[]): void { this.events = [...this.events, ...events]; }
  list(): readonly DomainEvent[] { return [...this.events]; }
  clear(): void { this.events = []; }
}
