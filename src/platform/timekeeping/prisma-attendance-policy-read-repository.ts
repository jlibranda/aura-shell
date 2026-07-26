import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AttendancePolicyReadRepository } from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyRecord, PolicyScope } from "@/platform/timekeeping/attendance-policy";

function toRecord(value: {
  attendancePolicyId: string; attendancePolicyVersionId: string; tenantId: string; scope: string; scopeId: string;
  effectiveFrom: Date; effectiveUntil: Date | null;
  roundingIncrementMinutes: number; roundingDirection: string;
  lateArrivalGraceMinutes: number; earlyDepartureGraceMinutes: number;
  unpaidBreakMinutes: number; paidBreakMinutes: number;
  dailyOvertimeThresholdMinutes: number; weeklyOvertimeThresholdMinutes: number; overtimeThresholdsAreStatutoryFloor: boolean;
  missedPunchToleranceMinutes: number;
  calculationAlgorithmVersion: number; fingerprint: string;
  changeReason: string | null; createdAt: Date; createdBy: string;
}): AttendancePolicyRecord {
  return Object.freeze({
    attendancePolicyId: value.attendancePolicyId,
    attendancePolicyVersionId: value.attendancePolicyVersionId,
    tenantId: value.tenantId,
    scope: value.scope as PolicyScope,
    scopeId: value.scopeId,
    effectiveFrom: value.effectiveFrom.toISOString(),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    rounding: { incrementMinutes: value.roundingIncrementMinutes, direction: value.roundingDirection as AttendancePolicyRecord["rounding"]["direction"] },
    gracePeriod: { lateArrivalGraceMinutes: value.lateArrivalGraceMinutes, earlyDepartureGraceMinutes: value.earlyDepartureGraceMinutes },
    breakRules: { unpaidBreakMinutes: value.unpaidBreakMinutes, paidBreakMinutes: value.paidBreakMinutes },
    overtime: { dailyThresholdMinutes: value.dailyOvertimeThresholdMinutes, weeklyThresholdMinutes: value.weeklyOvertimeThresholdMinutes },
    overtimeThresholdsAreStatutoryFloor: value.overtimeThresholdsAreStatutoryFloor,
    tolerance: { missedPunchToleranceMinutes: value.missedPunchToleranceMinutes },
    calculationAlgorithmVersion: value.calculationAlgorithmVersion,
    fingerprint: value.fingerprint,
    ...(value.changeReason ? { changeReason: value.changeReason } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
  });
}

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Read-only, tenant-scoped adapter. Every method requires timekeeping.view. */
export class PrismaAttendancePolicyReadRepository implements AttendancePolicyReadRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "attendancePolicy">) {}

  async findById(context: TenantContext, attendancePolicyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId: context.tenantId, attendancePolicyVersionId } });
    return policy ? toRecord(policy) : undefined;
  }

  async findPolicyAtInstant(context: TenantContext, scope: PolicyScope, scopeId: string, at: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    const asOf = new Date(at);
    const policy = await this.prisma.attendancePolicy.findFirst({
      where: {
        tenantId: context.tenantId,
        scope,
        scopeId,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: asOf } }],
      },
    });
    return policy ? toRecord(policy) : undefined;
  }

  async findCurrentPolicy(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId: context.tenantId, scope, scopeId, effectiveUntil: null } });
    return policy ? toRecord(policy) : undefined;
  }

  async listPolicyHistory(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]> {
    requireTimekeepingView(context);
    const policies = await this.prisma.attendancePolicy.findMany({
      where: { tenantId: context.tenantId, scope, scopeId },
      orderBy: { effectiveFrom: "asc" },
    });
    return policies.map(toRecord);
  }
}
