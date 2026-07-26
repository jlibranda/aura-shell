import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AttendancePolicyReadRepository } from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyRecord, PolicyScope, RoundingDirection } from "@/platform/timekeeping/attendance-policy";

function toRecord(value: {
  policyId: string; policyVersionId: string; tenantId: string; scope: string; scopeId: string;
  effectiveFrom: Date; effectiveUntil: Date | null;
  roundingIntervalMinutes: number; roundingDirection: string;
  gracePeriodMinutes: number; latenessToleranceMinutes: number;
  unpaidBreakMinutes: number | null;
  standardWorkWeekMinutes: number; isStandardWorkWeekStatutoryFloor: boolean;
  dailyOvertimeThresholdMinutes: number | null;
  calculationAlgorithmVersion: number; fingerprint: string;
  changeReason: string | null; createdAt: Date; createdBy: string;
}): AttendancePolicyRecord {
  return Object.freeze({
    policyId: value.policyId,
    policyVersionId: value.policyVersionId,
    tenantId: value.tenantId,
    scope: value.scope as PolicyScope,
    scopeId: value.scopeId,
    effectiveFrom: value.effectiveFrom.toISOString(),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    roundingIntervalMinutes: value.roundingIntervalMinutes,
    roundingDirection: value.roundingDirection as RoundingDirection,
    gracePeriodMinutes: value.gracePeriodMinutes,
    latenessToleranceMinutes: value.latenessToleranceMinutes,
    ...(value.unpaidBreakMinutes !== null ? { unpaidBreakMinutes: value.unpaidBreakMinutes } : {}),
    standardWorkWeekMinutes: value.standardWorkWeekMinutes,
    isStandardWorkWeekStatutoryFloor: value.isStandardWorkWeekStatutoryFloor,
    ...(value.dailyOvertimeThresholdMinutes !== null ? { dailyOvertimeThresholdMinutes: value.dailyOvertimeThresholdMinutes } : {}),
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

  async findById(context: TenantContext, policyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId: context.tenantId, policyVersionId } });
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
