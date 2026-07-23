import type { DomainEvent } from "@/platform/events/domain-event";
import type { EmployeeAggregate } from "@/platform/people/persistence/employee-aggregate-repository";

/** Internal aggregate event buffer. Events never cross to browser read models. */
export class EmployeeAggregateRoot {
  private events: DomainEvent[] = [];

  constructor(readonly snapshot: EmployeeAggregate) {}

  record(event: DomainEvent): void { this.events.push(event); }
  pullEvents(): readonly DomainEvent[] { const events = [...this.events]; this.clearEvents(); return events; }
  clearEvents(): void { this.events = []; }
}
