import { randomUUID } from "node:crypto";

export type AuditRecord = Readonly<{
  auditId: string;
  occurredAt: string;
  tenantId: string;
  actorUserId: string;
  requestId: string;
  correlationId: string;
  transactionId: string;
  commandName: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  result: "SUCCESS";
  metadata: Readonly<Record<string, unknown>>;
}>;

export interface AuditIdGenerator { next(): string; }
export class ServerAuditIdGenerator implements AuditIdGenerator { next(): string { return randomUUID(); } }
export class SequentialAuditIdGenerator implements AuditIdGenerator {
  private sequence = 0;
  constructor(private readonly prefix = "audit") {}
  next(): string { this.sequence += 1; return `${this.prefix}-${String(this.sequence).padStart(4, "0")}`; }
}

export interface AuditClock { now(): string; }
