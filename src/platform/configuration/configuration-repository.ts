import type { TenantContext } from "@/platform/context";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";

export interface CreateDefinitionInput {
  tenantId: string;
  type: string;
  code: string;
  name: string;
  description?: string;
  createdBy: string;
}

export interface CreateDraftVersionInput {
  definitionId: string;
  tenantId: string;
  versionNumber: number;
  payload: Readonly<Record<string, unknown>>;
  schemaVersion: number;
  changeReason?: string;
  createdBy: string;
}

export interface UpdateDraftVersionInput {
  versionId: string;
  tenantId: string;
  /** Optimistic-concurrency token: the caller's last-known updatedAt. Rejected if it no longer matches. */
  expectedUpdatedAt: string;
  payload: Readonly<Record<string, unknown>>;
  changeReason?: string;
}

export interface PublishVersionInput {
  versionId: string;
  tenantId: string;
  expectedUpdatedAt: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  publishedBy: string;
}

/** Server-only port. Every method requires a tenant-scoped write transaction. */
export interface ConfigurationWriteRepository {
  findDefinitionByCode(tenantId: string, code: string): Promise<ConfigurationDefinitionRecord | undefined>;
  createDefinition(input: CreateDefinitionInput): Promise<ConfigurationDefinitionRecord>;
  findDraftVersion(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord | undefined>;
  getVersionById(tenantId: string, versionId: string): Promise<ConfigurationVersionRecord | undefined>;
  createDraftVersion(input: CreateDraftVersionInput): Promise<ConfigurationVersionRecord>;
  updateDraftVersion(input: UpdateDraftVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found">;
  discardDraftVersion(tenantId: string, versionId: string, expectedUpdatedAt: string): Promise<"discarded" | "stale" | "not_found">;
  findPublishedVersions(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord[]>;
  publishVersion(input: PublishVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found">;
  retireVersion(tenantId: string, versionId: string): Promise<void>;
  nextVersionNumber(tenantId: string, definitionId: string): Promise<number>;
}

/** Transaction-scoped repositories exposed to configuration command handlers via UnitOfWork.execute(). */
export type ConfigurationTransactionRepositories = Readonly<{ configuration: ConfigurationWriteRepository }>;

/**
 * A safe, minimal per-category status summary — dates and booleans only, never
 * a configuration payload. Used by the Configuration Registry (ADR-011 Layer 2)
 * to describe many categories without a per-category query.
 */
export interface ConfigurationCategorySummary {
  /** The definition code this summary is for. */
  code: string;
  /** The tenant's definition id for this code, if one exists yet. */
  definitionId?: string;
  /** True when an effective published version is in force as of the queried instant. */
  configured: boolean;
  /** The in-force version's effectiveFrom, when configured. */
  effectiveFrom?: string;
  /** True when an editable draft exists. */
  hasDraft: boolean;
  /** The next future-dated published version's effectiveFrom, when one is scheduled. */
  scheduledFrom?: string;
}

/** Server-only port. Read-only, tenant-scoped, used outside any write transaction. */
export interface ConfigurationReadRepository {
  findDefinitionByCode(context: TenantContext, code: string): Promise<ConfigurationDefinitionRecord | undefined>;
  listVersions(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord[]>;
  getVersionById(context: TenantContext, versionId: string): Promise<ConfigurationVersionRecord | undefined>;
  getDraftVersion(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord | undefined>;
  getEffectiveVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined>;
  getNextScheduledVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined>;
  /**
   * Batched status summary for many categories at once, in a bounded number of
   * queries (never one-per-category). Returns an entry for every requested
   * code; codes with no definition come back configured:false, hasDraft:false.
   */
  getConfigurationSummaries(context: TenantContext, codes: readonly string[], asOf: Date): Promise<ReadonlyMap<string, ConfigurationCategorySummary>>;
}
