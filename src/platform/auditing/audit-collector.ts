import type { AuditRecord } from "@/platform/auditing/audit-record";

/** Deterministic post-commit inspection seam. This is not persistence or querying. */
export interface AuditCollector {
  collect(records: readonly AuditRecord[]): void;
  list(): readonly AuditRecord[];
  clear(): void;
}

export class InMemoryAuditCollector implements AuditCollector {
  private records: AuditRecord[] = [];
  collect(records: readonly AuditRecord[]): void { this.records = [...this.records, ...records]; }
  list(): readonly AuditRecord[] { return [...this.records]; }
  clear(): void { this.records = []; }
}
