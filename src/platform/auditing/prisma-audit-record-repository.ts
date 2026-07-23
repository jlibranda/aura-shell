import type { AuditRecord } from "@/platform/auditing/audit-record";
import type { ImmutableAuditRecordRepository } from "@/platform/auditing/immutable-audit-record-repository";
import type { PrismaAuditPersistenceClient } from "@/platform/people/persistence/prisma-persistence-types";
import type { Prisma } from "@prisma/client";

/** Durable append-only audit adapter. Its port intentionally exposes no mutation APIs. */
export class PrismaAuditRecordRepository implements ImmutableAuditRecordRepository {
  constructor(private readonly prisma: PrismaAuditPersistenceClient) {}

  async append(records: readonly AuditRecord[]): Promise<void> {
    for (const record of records) {
      await this.prisma.auditRecord.create({
        data: {
          auditId: record.auditId,
          occurredAt: new Date(record.occurredAt),
          tenantId: record.tenantId,
          actorUserId: record.actorUserId,
          requestId: record.requestId,
          correlationId: record.correlationId,
          transactionId: record.transactionId,
          commandName: record.commandName,
          eventName: record.eventName,
          aggregateType: record.aggregateType,
          aggregateId: record.aggregateId,
          result: record.result,
          metadata: record.metadata as Prisma.InputJsonValue,
        },
      });
    }
  }
}
