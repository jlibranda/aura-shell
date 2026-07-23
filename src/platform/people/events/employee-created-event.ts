import { createDomainEvent, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { EmployeeAggregate } from "@/platform/people/persistence/employee-aggregate-repository";

export function createEmployeeCreatedEvent(
  employee: EmployeeAggregate,
  context: Readonly<{ tenantId: string; correlationId: string }>,
  ids: EventIdGenerator,
  clock: DomainEventClock,
): DomainEvent {
  return createDomainEvent({
    eventName: "people.employee.created",
    aggregateType: "employee",
    aggregateId: employee.id,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    requestId: context.correlationId,
    version: 1,
    payload: {
      employeeId: employee.id,
      workEmail: employee.contact.workEmail,
      departmentId: employee.employment.departmentId,
      position: employee.employment.position,
      hireDate: employee.employment.hireDate,
    },
  }, ids, clock);
}
