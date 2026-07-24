import type { TenantContext } from "@/platform/context";
import type { OrgUnitKind, OrgUnitRecord } from "@/platform/organization/org-unit";

export interface CreateOrgUnitInput {
  tenantId: string;
  code: string;
  name: string;
  kind: OrgUnitKind;
  parentId?: string;
  createdBy: string;
}

export interface RenameOrgUnitInput {
  tenantId: string;
  id: string;
  name: string;
}

export interface MoveOrgUnitInput {
  tenantId: string;
  id: string;
  /** The new parent, or null to make this a root. */
  parentId: string | null;
}

/**
 * Server-only write port for org units. Used only inside a tenant-scoped write
 * transaction. `id` and `code` are immutable — there is deliberately no method
 * to change them (ADR-012 §12). There is no delete: a unit is archived, never
 * removed, so identifiers are never reused.
 */
export interface OrgUnitWriteRepository {
  findById(tenantId: string, id: string): Promise<OrgUnitRecord | undefined>;
  findByCode(tenantId: string, code: string): Promise<OrgUnitRecord | undefined>;
  /** All units for the tenant — the adjacency list the write service uses to enforce hierarchy invariants in-transaction. */
  listAll(tenantId: string): Promise<OrgUnitRecord[]>;
  create(input: CreateOrgUnitInput): Promise<OrgUnitRecord>;
  rename(input: RenameOrgUnitInput): Promise<OrgUnitRecord>;
  move(input: MoveOrgUnitInput): Promise<OrgUnitRecord>;
  archive(tenantId: string, id: string): Promise<OrgUnitRecord>;
}

/** Transaction-scoped repositories exposed to the org-unit write service via UnitOfWork.execute(). */
export type OrgUnitTransactionRepositories = Readonly<{ orgUnits: OrgUnitWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires organization.view.
 */
export interface OrgUnitReadRepository {
  getById(context: TenantContext, id: string): Promise<OrgUnitRecord | undefined>;
  getByCode(context: TenantContext, code: string): Promise<OrgUnitRecord | undefined>;
  /** Direct children of a parent, or the roots when parentId is null. */
  listChildren(context: TenantContext, parentId: string | null): Promise<OrgUnitRecord[]>;
  /** The full adjacency list for the tenant, from which the tree is built (ADR-012 §10 — adjacency now, closure table later). */
  listAll(context: TenantContext): Promise<OrgUnitRecord[]>;
}
