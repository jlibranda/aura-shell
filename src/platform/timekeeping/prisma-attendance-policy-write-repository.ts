import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  AttendancePolicyWriteRepository,
  CreateAttendancePolicyInput,
  EndAttendancePolicyRepositoryInput,
} from "@/platform/timekeeping/attendance-policy-repository";
import type { AttendancePolicyRecord, PolicyScope, RoundingDirection } from "@/platform/timekeeping/attendance-policy";

export type PrismaAttendancePolicyWriteClient = Pick<Prisma.TransactionClient, "attendancePolicy">;

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

/**
 * Write-side adapter, used only inside an AttendancePolicy write
 * transaction. Tenant scoping is on every query's where clause. Non-overlap
 * is enforced twice: here the service pre-checks in-transaction against
 * live data for a clean error, and the database's GIST exclusion constraint
 * is the actual guarantee against a race.
 */
export class PrismaAttendancePolicyWriteRepository implements AttendancePolicyWriteRepository {
  constructor(private readonly prisma: PrismaAttendancePolicyWriteClient) {}

  async findById(tenantId: string, policyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    const policy = await this.prisma.attendancePolicy.findFirst({ where: { tenantId, policyVersionId } });
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
        policyId: input.policyId ?? randomUUID(),
        tenantId: input.tenantId,
        scope: input.scope,
        scopeId: input.scopeId,
        effectiveFrom: new Date(input.effectiveFrom),
        roundingIntervalMinutes: input.roundingIntervalMinutes,
        roundingDirection: input.roundingDirection,
        gracePeriodMinutes: input.gracePeriodMinutes,
        latenessToleranceMinutes: input.latenessToleranceMinutes,
        unpaidBreakMinutes: input.unpaidBreakMinutes ?? null,
        standardWorkWeekMinutes: input.standardWorkWeekMinutes,
        isStandardWorkWeekStatutoryFloor: input.isStandardWorkWeekStatutoryFloor,
        dailyOvertimeThresholdMinutes: input.dailyOvertimeThresholdMinutes ?? null,
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
      where: { policyVersionId: input.policyVersionId, tenantId: input.tenantId },
      data: { effectiveUntil: new Date(input.effectiveUntil) },
    });
    if (result.count === 0) throw new Error(`attendance policy ${input.policyVersionId} not found for tenant ${input.tenantId}`);
    const updated = await this.prisma.attendancePolicy.findFirst({ where: { policyVersionId: input.policyVersionId, tenantId: input.tenantId } });
    if (!updated) throw new Error(`attendance policy ${input.policyVersionId} not found for tenant ${input.tenantId}`);
    return toRecord(updated);
  }
}
