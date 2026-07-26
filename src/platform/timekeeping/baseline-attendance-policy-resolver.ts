import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AttendancePolicyReadRepository } from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyResolver } from "@/platform/timekeeping/attendance-policy-resolver";
import type { AttendancePolicyResolutionInput, AttendancePolicyResolutionResult, ResolvedAttendancePolicy } from "@/platform/timekeeping/attendance-policy";

function toResolved(record: {
  attendancePolicyId: string; attendancePolicyVersionId: string; scope: ResolvedAttendancePolicy["scope"]; scopeId: string;
  effectiveFrom: string; effectiveUntil?: string; rounding: ResolvedAttendancePolicy["rounding"]; gracePeriod: ResolvedAttendancePolicy["gracePeriod"];
  breakRules: ResolvedAttendancePolicy["breakRules"]; overtime: ResolvedAttendancePolicy["overtime"]; overtimeThresholdsAreStatutoryFloor: boolean;
  tolerance: ResolvedAttendancePolicy["tolerance"]; calculationAlgorithmVersion: number; fingerprint: string;
}): ResolvedAttendancePolicy {
  return Object.freeze({
    attendancePolicyId: record.attendancePolicyId,
    attendancePolicyVersionId: record.attendancePolicyVersionId,
    scope: record.scope,
    scopeId: record.scopeId,
    effectiveFrom: record.effectiveFrom,
    ...(record.effectiveUntil ? { effectiveUntil: record.effectiveUntil } : {}),
    rounding: record.rounding,
    gracePeriod: record.gracePeriod,
    breakRules: record.breakRules,
    overtime: record.overtime,
    overtimeThresholdsAreStatutoryFloor: record.overtimeThresholdsAreStatutoryFloor,
    tolerance: record.tolerance,
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
