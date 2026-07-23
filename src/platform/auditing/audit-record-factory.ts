import type { AuditClock, AuditIdGenerator, AuditRecord } from "@/platform/auditing/audit-record";
import type { DomainEvent } from "@/platform/events/domain-event";

export type AuditContext = Readonly<{
  tenantId: string;
  actorUserId: string;
  requestId: string;
  correlationId: string;
  transactionId: string;
  commandName: string;
}>;

/** Server-only factory for audits of committed domain events. */
export class AuditRecordFactory {
  constructor(private readonly ids: AuditIdGenerator, private readonly clock: AuditClock) {}

  employeeCreated(context: AuditContext, event: DomainEvent): AuditRecord {
    return Object.freeze({
      auditId: this.ids.next(),
      occurredAt: this.clock.now(),
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      correlationId: context.correlationId,
      transactionId: context.transactionId,
      commandName: context.commandName,
      eventName: event.eventName,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      result: "SUCCESS" as const,
      metadata: Object.freeze({ ...event.payload }),
    });
  }
}
