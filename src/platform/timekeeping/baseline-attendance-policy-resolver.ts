import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AttendancePolicyReadRepository } from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyResolver } from "@/platform/timekeeping/attendance-policy-resolver";
import type { AttendancePolicyResolutionInput, AttendancePolicyResolutionResult, ResolvedAttendancePolicy } from "@/platform/timekeeping/attendance-policy";

/** Strips provenance-only fields (changeReason/createdAt/createdBy) from a persisted record, leaving exactly the approved ResolvedAttendancePolicy shape. */
function toResolved(record: ResolvedAttendancePolicy): ResolvedAttendancePolicy {
  return Object.freeze({
    policyId: record.policyId,
    policyVersionId: record.policyVersionId,
    scope: record.scope,
    scopeId: record.scopeId,
    tenantId: record.tenantId,
    effectiveFrom: record.effectiveFrom,
    ...(record.effectiveUntil ? { effectiveUntil: record.effectiveUntil } : {}),
    roundingIntervalMinutes: record.roundingIntervalMinutes,
    roundingDirection: record.roundingDirection,
    gracePeriodMinutes: record.gracePeriodMinutes,
    latenessToleranceMinutes: record.latenessToleranceMinutes,
    ...(record.unpaidBreakMinutes !== undefined ? { unpaidBreakMinutes: record.unpaidBreakMinutes } : {}),
    standardWorkWeekMinutes: record.standardWorkWeekMinutes,
    isStandardWorkWeekStatutoryFloor: record.isStandardWorkWeekStatutoryFloor,
    ...(record.dailyOvertimeThresholdMinutes !== undefined ? { dailyOvertimeThresholdMinutes: record.dailyOvertimeThresholdMinutes } : {}),
    calculationAlgorithmVersion: record.calculationAlgorithmVersion,
    fingerprint: record.fingerprint,
  });
}

/**
 * The only AttendancePolicyResolver implementation Slice 5 Phase A ships.
 * Resolves a single, Tenant-scoped, explicitly admin-configured
 * AttendancePolicy record — never a code constant, never an assumed
 * default. If no Tenant-scoped policy has been configured as of
 * `attendanceAnchorInstant`, returns `configuration_incomplete`. Never
 * independently queries Organization state — `legalEntityId`/`orgUnitId`/
 * `locationId` on the input are accepted for interface-shape compatibility
 * with Slice 7's future precedence resolver, but this implementation never
 * reads them.
 */
export class BaselineAttendancePolicyResolver implements AttendancePolicyResolver {
  constructor(private readonly reads: AttendancePolicyReadRepository) {}

  async resolve(context: TenantContext, input: AttendancePolicyResolutionInput): Promise<AttendancePolicyResolutionResult> {
    if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
    if (input.tenantId !== context.tenantId) throw new AuthorizationError();

    const record = await this.reads.findPolicyAtInstant(context, "TENANT", input.tenantId, input.attendanceAnchorInstant);
    if (!record) {
      return Object.freeze({
        kind: "configuration_incomplete" as const,
        missingScope: "TENANT" as const,
        reason: "No Tenant-scoped attendance policy baseline has been configured for this tenant as of the requested instant.",
      });
    }
    return Object.freeze({ kind: "resolved" as const, policy: toResolved(record) });
  }
}
