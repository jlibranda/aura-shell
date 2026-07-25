import type { TenantContext } from "@/platform/context";
import type { OrgUnitWriteRepository } from "@/platform/organization/org-unit-repository";
import type { PersonExistenceRepository } from "@/platform/organization/person-existence-repository";
import type { AssignmentRecord } from "@/platform/organization/assignment";

export interface AssignPrimaryInput {
  tenantId: string;
  personId: string;
  orgUnitId: string;
  managerId?: string;
  effectiveFrom: string;
  createdBy: string;
}

export interface EndAssignmentInput {
  tenantId: string;
  id: string;
  effectiveUntil: string;
}

/**
 * Server-only write port for assignments. Used only inside a tenant-scoped
 * write transaction. There is no update-in-place for placement fields and no
 * delete — a placement is superseded (ended, then a new one created) so
 * history is always resolvable (ADR-012 §7, §12).
 */
export interface AssignmentWriteRepository {
  findById(tenantId: string, id: string): Promise<AssignmentRecord | undefined>;
  /** Every assignment for a person, ascending by effectiveFrom — the write service's in-transaction overlap check uses this. */
  listForPerson(tenantId: string, personId: string): Promise<AssignmentRecord[]>;
  /** The currently open (effectiveUntil absent) primary assignment for a person, if any. */
  findCurrentPrimaryForPerson(tenantId: string, personId: string): Promise<AssignmentRecord | undefined>;
  create(input: AssignPrimaryInput): Promise<AssignmentRecord>;
  end(input: EndAssignmentInput): Promise<AssignmentRecord>;
}

/**
 * Transaction-scoped repositories exposed to the Assignment write service via
 * UnitOfWork.execute(). `orgUnits` and `people` are read-only existence checks
 * against the live tenant data inside the same transaction — the write
 * service never mutates either through this port.
 */
export type AssignmentTransactionRepositories = Readonly<{
  assignments: AssignmentWriteRepository;
  orgUnits: OrgUnitWriteRepository;
  people: PersonExistenceRepository;
}>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires organization.view.
 */
export interface AssignmentReadRepository {
  /** The currently open primary assignment for a person, if any. */
  getCurrentForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord | undefined>;
  /** Full placement history for a person, ascending by effectiveFrom. */
  listHistoryForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord[]>;
  /** Every currently open primary assignment reporting to this manager — the "direct reports" query. */
  listCurrentByManager(context: TenantContext, managerId: string): Promise<AssignmentRecord[]>;
  /** Every currently open primary assignment for the tenant — the Assignment administration list. */
  listCurrentPrimary(context: TenantContext): Promise<AssignmentRecord[]>;
}
