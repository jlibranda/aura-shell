import type { TenantContext } from "@/platform/context";
import type { AuditRecord } from "@/platform/auditing/audit-record";

/**
 * Read-only, tenant-scoped view over configuration-related audit records.
 * Deliberately separate from ImmutableAuditRecordRepository (append-only,
 * write-side) — this port never mutates and is used only by the Settings
 * audit trail screen.
 */
export interface ConfigurationAuditReadRepository {
  listConfigurationAuditRecords(context: TenantContext, limit?: number): Promise<readonly AuditRecord[]>;
}
