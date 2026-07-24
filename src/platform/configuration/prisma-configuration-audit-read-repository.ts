import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AuditRecord } from "@/platform/auditing/audit-record";
import type { ConfigurationAuditReadRepository } from "@/platform/configuration/configuration-audit-read-repository";
import type { PrismaAuditPersistenceClient } from "@/platform/people/persistence/prisma-persistence-types";

const DEFAULT_LIMIT = 50;

/** Read-only, tenant-scoped. Requires settings.audit.view. */
export class PrismaConfigurationAuditReadRepository implements ConfigurationAuditReadRepository {
  constructor(private readonly prisma: PrismaAuditPersistenceClient) {}

  async listConfigurationAuditRecords(context: TenantContext, limit: number = DEFAULT_LIMIT): Promise<readonly AuditRecord[]> {
    if (!hasPermission(context, "settings.audit.view")) throw new AuthorizationError();
    const records = await this.prisma.auditRecord.findMany({
      where: { tenantId: context.tenantId, eventName: { startsWith: "configuration." } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return Object.freeze(records.map((record): AuditRecord => Object.freeze({
      auditId: record.auditId,
      occurredAt: record.occurredAt.toISOString(),
      tenantId: record.tenantId,
      actorUserId: record.actorUserId,
      requestId: record.requestId,
      correlationId: record.correlationId,
      transactionId: record.transactionId,
      commandName: record.commandName,
      eventName: record.eventName,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      result: record.result as "SUCCESS",
      metadata: record.metadata as Readonly<Record<string, unknown>>,
    })));
  }
}
