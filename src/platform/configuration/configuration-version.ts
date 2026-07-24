export type ConfigurationVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export interface ConfigurationDefinitionRecord {
  id: string;
  tenantId: string;
  type: string;
  code: string;
  name: string;
  description?: string;
  scopeType: "TENANT";
  scopeRef: string;
  createdAt: string;
  createdBy: string;
}

export interface ConfigurationVersionRecord {
  id: string;
  definitionId: string;
  tenantId: string;
  versionNumber: number;
  status: ConfigurationVersionStatus;
  effectiveFrom?: string;
  effectiveUntil?: string;
  payload: Readonly<Record<string, unknown>>;
  schemaVersion: number;
  changeReason?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
  retiredAt?: string;
}

/** A version whose effectiveFrom is in the future is displayed as "Scheduled" — never stored as a separate status. */
export function isScheduled(version: Pick<ConfigurationVersionRecord, "status" | "effectiveFrom">, now: Date): boolean {
  return version.status === "PUBLISHED" && Boolean(version.effectiveFrom) && new Date(version.effectiveFrom!).getTime() > now.getTime();
}

/** A published version is "in force" once its effectiveFrom has passed and it hasn't been superseded/retired. */
export function isCurrentlyEffective(version: Pick<ConfigurationVersionRecord, "status" | "effectiveFrom" | "effectiveUntil">, now: Date): boolean {
  if (version.status !== "PUBLISHED") return false;
  const nowMs = now.getTime();
  if (version.effectiveFrom && new Date(version.effectiveFrom).getTime() > nowMs) return false;
  if (version.effectiveUntil && new Date(version.effectiveUntil).getTime() <= nowMs) return false;
  return true;
}
