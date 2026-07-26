import type { TenantContext } from "@/platform/context";
import type { WorkScheduleWriteRepository } from "@/platform/timekeeping/work-schedule-repository";
import type { OrganizationAssignmentAsOfPort } from "@/platform/timekeeping/organization-assignment-port";
import type { ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";

export interface CreateScheduleAssignmentInput {
  tenantId: string;
  personId: string;
  workScheduleId: string;
  workScheduleVersionId: string;
  effectiveFrom: string;
  changeReason?: string;
  createdBy: string;
}

export interface EndScheduleAssignmentInput {
  tenantId: string;
  id: string;
  effectiveUntil: string;
}

export interface CancelFutureScheduleAssignmentInput {
  tenantId: string;
  id: string;
  cancelledBy: string;
  cancellationReason?: string;
}

/**
 * Server-only write port for schedule assignments. Used only inside a
 * tenant-scoped write transaction. There is no update-in-place for
 * `workScheduleVersionId`/`effectiveFrom` and no delete — an assignment is
 * either closed (`end`), superseded (transfer = `end` + `create`), or
 * cancelled before it starts (`cancelFuture`), so history is always
 * resolvable (Slice 4 Decision 1, Decision 8).
 */
export interface ScheduleAssignmentWriteRepository {
  findById(tenantId: string, id: string): Promise<ScheduleAssignmentRecord | undefined>;
  /** Every non-cancelled assignment for a person — the write service's in-transaction overlap check uses this (Slice 4 Decision 6). */
  listForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord[]>;
  /** The currently open (effectiveUntil absent), non-cancelled assignment for a person, if any. */
  findCurrentForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord | undefined>;
  create(input: CreateScheduleAssignmentInput): Promise<ScheduleAssignmentRecord>;
  end(input: EndScheduleAssignmentInput): Promise<ScheduleAssignmentRecord>;
  cancelFuture(input: CancelFutureScheduleAssignmentInput): Promise<ScheduleAssignmentRecord>;
}

/**
 * Transaction-scoped repositories exposed to the ScheduleAssignment write
 * service via UnitOfWork.execute(). `workSchedules` is a read-only
 * existence/eligibility check against WorkSchedule's live tenant data
 * (Slice 4 Decision 3/4) — the write service never mutates WorkSchedule
 * through this port. `organizationAssignments` is the minimal,
 * transaction-scoped read into Organization's Assignment data for the
 * ADR-014 §4.2 cross-aggregate invariant (Slice 4 Decision 9).
 */
export type ScheduleAssignmentTransactionRepositories = Readonly<{
  scheduleAssignments: ScheduleAssignmentWriteRepository;
  workSchedules: Pick<WorkScheduleWriteRepository, "findVersionById">;
  organizationAssignments: OrganizationAssignmentAsOfPort;
}>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires timekeeping.view.
 */
export interface ScheduleAssignmentReadRepository {
  findById(context: TenantContext, id: string): Promise<ScheduleAssignmentRecord | undefined>;
  /** The non-cancelled assignment whose window contains `at` — excludes cancelled rows (Slice 4 Decision 15). */
  findAssignmentAtDate(context: TenantContext, personId: string, at: string): Promise<ScheduleAssignmentRecord | undefined>;
  /** The currently open (effectiveUntil absent), non-cancelled assignment for a person, if any. */
  findCurrentAssignment(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord | undefined>;
  /** Full history for a person, ascending by effectiveFrom — includes cancelled rows, whose cancellation state is explicit on the returned record (Slice 4 Decision 15). */
  listAssignmentsForPerson(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]>;
  /** Non-cancelled assignments not yet started (effectiveFrom in the future), ascending by effectiveFrom. */
  listFutureAssignments(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]>;
  /** Every assignment — including cancelled and historical — referencing a given WorkScheduleVersion. Informational only, for impact analysis (Slice 4 Decision 4); no caller wires this into an enforcement path this slice. */
  listAssignmentsUsingVersion(context: TenantContext, workScheduleVersionId: string): Promise<ScheduleAssignmentRecord[]>;
}
