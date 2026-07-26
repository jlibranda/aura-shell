import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  AttendancePolicyWriteRepository,
  CreateAttendancePolicyInput,
  EndAttendancePolicyRepositoryInput,
} from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyRecord, PolicyScope } from "@/platform/timekeeping/attendance-policy";

export type PrismaAttendancePolicyWriteClient = Pick<Prisma.TransactionClient, "attendancePolicy">;

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

/**
 * Write-side adapter, used only inside an AttendancePolicy write
 * transaction. Tenant scoping is on every query's where clause. Non-overlap
 * is enforced twice: here the service pre-checks in-transaction against
 * live data for a clean error, and the database's GIST exclusion constraint
 * is the actual guarantee against a race.
 */
export class PrismaAttendancePolicyWriteRepository implements AttendancePolicyWriteRepository {
  constructor(private readonly prisma: PrismaAttendancePolicyWriteClient) {}

  async findById(tenantId: string, attendancePolicyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId, attendancePolicyVersionId } });
    return policy ? toRecord(policy) : undefined;
  }

  async listForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]> {
    const policies = await this.prisma.attendancePolicy.findMany({
      where: { tenantId, scope, scopeId },
      orderBy: { effectiveFrom: "asc" },
    });
    return policies.map(toRecord);
  }

  async findCurrentForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined> {
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId, scope, scopeId, effectiveUntil: null } });
    return policy ? toRecord(policy) : undefined;
  }

  async create(input: CreateAttendancePolicyInput): Promise<AttendancePolicyRecord> {
    const policy = await this.prisma.attendancePolicy.create({
      data: {
        attendancePolicyId: input.attendancePolicyId ?? randomUUID(),
        tenantId: input.tenantId,
        scope: input.scope,
        scopeId: input.scopeId,
        effectiveFrom: new Date(input.effectiveFrom),
        roundingIncrementMinutes: input.rounding.incrementMinutes,
        roundingDirection: input.rounding.direction,
        lateArrivalGraceMinutes: input.gracePeriod.lateArrivalGraceMinutes,
        earlyDepartureGraceMinutes: input.gracePeriod.earlyDepartureGraceMinutes,
        unpaidBreakMinutes: input.breakRules.unpaidBreakMinutes,
        paidBreakMinutes: input.breakRules.paidBreakMinutes,
        dailyOvertimeThresholdMinutes: input.overtime.dailyThresholdMinutes,
        weeklyOvertimeThresholdMinutes: input.overtime.weeklyThresholdMinutes,
        overtimeThresholdsAreStatutoryFloor: input.overtimeThresholdsAreStatutoryFloor,
        missedPunchToleranceMinutes: input.tolerance.missedPunchToleranceMinutes,
        calculationAlgorithmVersion: input.calculationAlgorithmVersion,
        fingerprint: input.fingerprint,
        changeReason: input.changeReason ?? null,
        createdBy: input.createdBy,
      },
    });
    return toRecord(policy);
  }

  async end(input: EndAttendancePolicyRepositoryInput): Promise<AttendancePolicyRecord> {
    // updateMany (not update) so the where clause can be tenant-scoped without requiring a compound unique key on the PK alone.
    const result = await this.prisma.attendancePolicy.updateMany({
      where: { attendancePolicyVersionId: input.attendancePolicyVersionId, tenantId: input.tenantId },
      data: { effectiveUntil: new Date(input.effectiveUntil) },
    });
    if (result.count === 0) throw new Error(`attendance policy ${input.attendancePolicyVersionId} not found for tenant ${input.tenantId}`);
    const updated = await this.prisma.attendancePolicy.findFirst({ where: { attendancePolicyVersionId: input.attendancePolicyVersionId, tenantId: input.tenantId } });
    if (!updated) throw new Error(`attendance policy ${input.attendancePolicyVersionId} not found for tenant ${input.tenantId}`);
    return toRecord(updated);
  }
}
