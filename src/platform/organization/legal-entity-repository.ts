import type { TenantContext } from "@/platform/context";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

export interface CreateLegalEntityInput {
  tenantId: string;
  code: string;
  legalName: string;
  countryCode: string;
  createdBy: string;
}

export interface UpdateLegalEntityDetailsInput {
  tenantId: string;
  id: string;
  legalName: string;
  countryCode: string;
}

/**
 * Server-only write port for legal entities. Used only inside a tenant-scoped
 * write transaction. `id` and `code` are immutable — there is deliberately no
 * method to change them. There is no delete: a legal entity is archived,
 * never removed, so identifiers are never reused.
 */
export interface LegalEntityWriteRepository {
  findById(tenantId: string, id: string): Promise<LegalEntityRecord | undefined>;
  findByCode(tenantId: string, code: string): Promise<LegalEntityRecord | undefined>;
  create(input: CreateLegalEntityInput): Promise<LegalEntityRecord>;
  updateDetails(input: UpdateLegalEntityDetailsInput): Promise<LegalEntityRecord>;
  archive(tenantId: string, id: string): Promise<LegalEntityRecord>;
}

/** Transaction-scoped repositories exposed to the legal entity write service via UnitOfWork.execute(). */
export type LegalEntityTransactionRepositories = Readonly<{ legalEntities: LegalEntityWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires organization.view.
 */
export interface LegalEntityReadRepository {
  getById(context: TenantContext, id: string): Promise<LegalEntityRecord | undefined>;
  getByCode(context: TenantContext, code: string): Promise<LegalEntityRecord | undefined>;
  /** Only ACTIVE legal entities — the default listing for any picker consumer (Hire, OrgUnit creation). */
  listActive(context: TenantContext): Promise<LegalEntityRecord[]>;
  /** Every legal entity regardless of status, for administration/history views. */
  listAll(context: TenantContext): Promise<LegalEntityRecord[]>;
}
