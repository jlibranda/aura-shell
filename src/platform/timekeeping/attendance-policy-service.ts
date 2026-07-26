import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { AttendancePolicyTransactionRepositories } from "@/platform/timekeeping/attendance-policy-repository";
import {
  CURRENT_CALCULATION_ALGORITHM_VERSION,
  computeAttendancePolicyFingerprint,
  validateAttendancePolicyContentDraft,
  validateEndAttendancePolicyInput,
  windowsOverlap,
  type AttendancePolicyContentDraft,
  type AttendancePolicyRecord,
  type EndAttendancePolicyInput,
} from "@/platform/timekeeping/attendance-policy";

export type AttendancePolicyCreated = Readonly<{ state: "created"; policy: AttendancePolicyRecord }>;
export type AttendancePolicyReplaced = Readonly<{ state: "replaced"; previous: AttendancePolicyRecord; policy: AttendancePolicyRecord }>;
export type AttendancePolicyEnded = Readonly<{ state: "ended"; policy: AttendancePolicyRecord }>;

/**
 * The single write entry point for AttendancePolicy (Slice 5 Phase A).
 * Tenant-scope only in this phase — every method resolves scope="TENANT",
 * scopeId=tenantId internally; Slice 7 extends this same service's write
 * surface to the other four scopes without changing this shape. Only three
 * lifecycle operations exist: create, replace (end + create atomically, the
 * same composition ScheduleAssignmentService uses for transfer), and end.
 * There is deliberately no cancelFutureTenantPolicy — this phase's
 * acceptance criteria never required cancelling a not-yet-started policy.
 * Every mutation requires timekeeping.manage.
 */
export class AttendancePolicyService {
  constructor(private readonly unitOfWork: UnitOfWork<AttendancePolicyTransactionRepositories>) {}

  /** A tenant's first attendance policy baseline, or a future/past non-overlapping one. */
  async createTenantPolicy(request: TrustedRequestContext, input: AttendancePolicyContentDraft): Promise<CommandResult<AttendancePolicyCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateAttendancePolicyContentDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateTenantAttendancePolicy"), async ({ repositories }) => {
      const others = await repositories.attendancePolicies.listForScope(tenantId, "TENANT", tenantId);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined };
      if (others.some((p) => windowsOverlap(p, candidate))) return "overlap" as const;

      return repositories.attendancePolicies.create({
        tenantId,
        scope: "TENANT",
        scopeId: tenantId,
        effectiveFrom: validation.data.effectiveFrom,
        roundingIntervalMinutes: validation.data.roundingIntervalMinutes,
        roundingDirection: validation.data.roundingDirection,
        gracePeriodMinutes: validation.data.gracePeriodMinutes,
        latenessToleranceMinutes: validation.data.latenessToleranceMinutes,
        unpaidBreakMinutes: validation.data.unpaidBreakMinutes,
        standardWorkWeekMinutes: validation.data.standardWorkWeekMinutes,
        isStandardWorkWeekStatutoryFloor: validation.data.isStandardWorkWeekStatutoryFloor,
        dailyOvertimeThresholdMinutes: validation.data.dailyOvertimeThresholdMinutes,
        calculationAlgorithmVersion: CURRENT_CALCULATION_ALGORITHM_VERSION,
        fingerprint: computeAttendancePolicyFingerprint({
          roundingIntervalMinutes: validation.data.roundingIntervalMinutes,
          roundingDirection: validation.data.roundingDirection,
          gracePeriodMinutes: validation.data.gracePeriodMinutes,
          latenessToleranceMinutes: validation.data.latenessToleranceMinutes,
          unpaidBreakMinutes: validation.data.unpaidBreakMinutes,
          standardWorkWeekMinutes: validation.data.standardWorkWeekMinutes,
          isStandardWorkWeekStatutoryFloor: validation.data.isStandardWorkWeekStatutoryFloor,
          dailyOvertimeThresholdMinutes: validation.data.dailyOvertimeThresholdMinutes,
          calculationAlgorithmVersion: CURRENT_CALCULATION_ALGORITHM_VERSION,
        }),
        changeReason: validation.data.changeReason,
        createdBy: request.principal.userId,
      });
    });

    if (result === "overlap") return commandConflict("This effective date would overlap the tenant's existing attendance policy baseline.");
    return commandSuccess(Object.freeze({ state: "created" as const, policy: result }));
  }

  /**
   * Ends the current tenant policy and opens a new one, atomically, at the
   * same instant — old and new windows are adjacent under [) semantics,
   * carrying the same policyId (lineage) forward so the two-ID identity
   * model's history stays connected.
   */
  async replaceTenantPolicy(request: TrustedRequestContext, input: AttendancePolicyContentDraft): Promise<CommandResult<AttendancePolicyReplaced>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateAttendancePolicyContentDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ReplaceTenantAttendancePolicy"), async ({ repositories }) => {
      const current = await repositories.attendancePolicies.findCurrentForScope(tenantId, "TENANT", tenantId);
      if (!current) return "no_current_policy" as const;
      if (new Date(validation.data.effectiveFrom).getTime() <= new Date(current.effectiveFrom).getTime()) {
        return "invalid_replace_date" as const;
      }

      const others = (await repositories.attendancePolicies.listForScope(tenantId, "TENANT", tenantId)).filter((p) => p.policyVersionId !== current.policyVersionId);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined };
      if (others.some((p) => windowsOverlap(p, candidate))) return "overlap" as const;

      const previous = await repositories.attendancePolicies.end({ tenantId, policyVersionId: current.policyVersionId, effectiveUntil: validation.data.effectiveFrom });
      const policy = await repositories.attendancePolicies.create({
        tenantId,
        scope: "TENANT",
        scopeId: tenantId,
        policyId: current.policyId,
        effectiveFrom: validation.data.effectiveFrom,
        roundingIntervalMinutes: validation.data.roundingIntervalMinutes,
        roundingDirection: validation.data.roundingDirection,
        gracePeriodMinutes: validation.data.gracePeriodMinutes,
        latenessToleranceMinutes: validation.data.latenessToleranceMinutes,
        unpaidBreakMinutes: validation.data.unpaidBreakMinutes,
        standardWorkWeekMinutes: validation.data.standardWorkWeekMinutes,
        isStandardWorkWeekStatutoryFloor: validation.data.isStandardWorkWeekStatutoryFloor,
        dailyOvertimeThresholdMinutes: validation.data.dailyOvertimeThresholdMinutes,
        calculationAlgorithmVersion: CURRENT_CALCULATION_ALGORITHM_VERSION,
        fingerprint: computeAttendancePolicyFingerprint({
          roundingIntervalMinutes: validation.data.roundingIntervalMinutes,
          roundingDirection: validation.data.roundingDirection,
          gracePeriodMinutes: validation.data.gracePeriodMinutes,
          latenessToleranceMinutes: validation.data.latenessToleranceMinutes,
          unpaidBreakMinutes: validation.data.unpaidBreakMinutes,
          standardWorkWeekMinutes: validation.data.standardWorkWeekMinutes,
          isStandardWorkWeekStatutoryFloor: validation.data.isStandardWorkWeekStatutoryFloor,
          dailyOvertimeThresholdMinutes: validation.data.dailyOvertimeThresholdMinutes,
          calculationAlgorithmVersion: CURRENT_CALCULATION_ALGORITHM_VERSION,
        }),
        changeReason: validation.data.changeReason,
        createdBy: request.principal.userId,
      });
      return Object.freeze({ previous, policy });
    });

    if (result === "no_current_policy") return commandValidationFailure([issue("effectiveFrom", "no_current_policy", "This tenant has no current attendance policy baseline to replace.")]);
    if (result === "invalid_replace_date") return commandValidationFailure([issue("effectiveFrom", "INVALID_DATE", "The replacement's effective date must be after the current policy's start date.")]);
    if (result === "overlap") return commandConflict("This replacement would overlap another attendance policy version for this tenant.");
    return commandSuccess(Object.freeze({ state: "replaced" as const, previous: result.previous, policy: result.policy }));
  }

  /** Closes a tenant's current, already-started attendance policy without opening a new one. */
  async endTenantPolicy(request: TrustedRequestContext, input: EndAttendancePolicyInput): Promise<CommandResult<AttendancePolicyEnded>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateEndAttendancePolicyInput(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "EndTenantAttendancePolicy"), async ({ repositories }) => {
      const current = await repositories.attendancePolicies.findCurrentForScope(tenantId, "TENANT", tenantId);
      if (!current) return "no_current_policy" as const;
      if (new Date(validation.data.effectiveUntil).getTime() <= new Date(current.effectiveFrom).getTime()) return "invalid_end_date" as const;
      return repositories.attendancePolicies.end({ tenantId, policyVersionId: current.policyVersionId, effectiveUntil: validation.data.effectiveUntil });
    });

    if (result === "no_current_policy") return commandValidationFailure([issue("effectiveUntil", "no_current_policy", "This tenant has no current attendance policy baseline to end.")]);
    if (result === "invalid_end_date") return commandValidationFailure([issue("effectiveUntil", "INVALID_DATE", "The end date must be after the policy's start date.")]);
    return commandSuccess(Object.freeze({ state: "ended" as const, policy: result }));
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "timekeeping.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage attendance policy.");
  }

  private context(request: TrustedRequestContext, commandName: string): UnitOfWorkContext {
    return {
      tenantId: request.principal.tenantId,
      correlationId: request.correlationId,
      requestId: request.correlationId,
      actorUserId: request.principal.userId,
      commandName,
    };
  }
}
