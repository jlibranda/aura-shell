import type { TenantContext } from "@/platform/context";
import type { AttendancePolicyRecord, PolicyScope, RoundingDirection } from "@/platform/timekeeping/attendance-policy";

export interface CreateAttendancePolicyInput {
  tenantId: string;
  scope: PolicyScope;
  scopeId: string;
  effectiveFrom: string;
  roundingIntervalMinutes: number;
  roundingDirection: RoundingDirection;
  gracePeriodMinutes: number;
  latenessToleranceMinutes: number;
  unpaidBreakMinutes?: number;
  standardWorkWeekMinutes: number;
  isStandardWorkWeekStatutoryFloor: boolean;
  dailyOvertimeThresholdMinutes?: number;
  calculationAlgorithmVersion: number;
  fingerprint: string;
  changeReason?: string;
  createdBy: string;
  /** Set only when this create is the replacement half of a replace operation — carries the lineage id forward instead of minting a new one (the two-ID identity model). Absent for a brand-new lineage's first version. */
  policyId?: string;
}

export interface EndAttendancePolicyRepositoryInput {
  tenantId: string;
  policyVersionId: string;
  effectiveUntil: string;
}

/**
 * Server-only write port for attendance policies. Used only inside a
 * tenant-scoped write transaction. There is no update-in-place for policy
 * values and no delete — a policy change is either closed (`end`) or
 * replaced (`replace` = `end` + `create` at the service layer, composed the
 * same way ScheduleAssignment composes `transferSchedule`), so history is
 * always resolvable and reproducible (ADR-014 §4.7's immutability invariant).
 * Scope-agnostic: this slice's service only ever passes scope="TENANT", but
 * the port itself carries the full scope shape Slice 7 will reuse unchanged.
 */
export interface AttendancePolicyWriteRepository {
  findById(tenantId: string, policyVersionId: string): Promise<AttendancePolicyRecord | undefined>;
  /** Every version in a scope's history, ascending by effectiveFrom — used for the in-transaction overlap pre-check. */
  listForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]>;
  /** The currently open (effectiveUntil absent) version for a scope, if any. */
  findCurrentForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined>;
  create(input: CreateAttendancePolicyInput): Promise<AttendancePolicyRecord>;
  end(input: EndAttendancePolicyRepositoryInput): Promise<AttendancePolicyRecord>;
}

/** Transaction-scoped repositories exposed to AttendancePolicyService via UnitOfWork.execute(). */
export type AttendancePolicyTransactionRepositories = Readonly<{ attendancePolicies: AttendancePolicyWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires timekeeping.view.
 */
export interface AttendancePolicyReadRepository {
  findById(context: TenantContext, policyVersionId: string): Promise<AttendancePolicyRecord | undefined>;
  /** The version whose window contains `at`, for a given scope. */
  findPolicyAtInstant(context: TenantContext, scope: PolicyScope, scopeId: string, at: string): Promise<AttendancePolicyRecord | undefined>;
  /** The currently open (effectiveUntil absent) version for a scope, if any. */
  findCurrentPolicy(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined>;
  /** Full history for a scope, ascending by effectiveFrom. */
  listPolicyHistory(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]>;
}
