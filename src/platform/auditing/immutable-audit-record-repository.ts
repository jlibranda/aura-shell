import type { AuditRecord } from "@/platform/auditing/audit-record";

/**
 * Server-side append-only persistence boundary for immutable audit evidence.
 * Implementations must not provide update or delete operations.
 */
export interface ImmutableAuditRecordRepository {
  append(records: readonly AuditRecord[]): Promise<void>;
}
