import type { Prisma } from "@prisma/client";
import type {
  CancelFutureScheduleAssignmentInput,
  CreateScheduleAssignmentInput,
  EndScheduleAssignmentInput,
  ScheduleAssignmentWriteRepository,
} from "@/platform/timekeeping/schedule-assignment-repository";
import type { ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";

export type PrismaScheduleAssignmentWriteClient = Pick<Prisma.TransactionClient, "scheduleAssignment">;

function toRecord(value: {
  id: string; tenantId: string; personId: string; workScheduleId: string; workScheduleVersionId: string;
  effectiveFrom: Date; effectiveUntil: Date | null; changeReason: string | null;
  cancelledAt: Date | null; cancelledBy: string | null; cancellationReason: string | null;
  createdAt: Date; createdBy: string;
}): ScheduleAssignmentRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    personId: value.personId,
    workScheduleId: value.workScheduleId,
    workScheduleVersionId: value.workScheduleVersionId,
    effectiveFrom: value.effectiveFrom.toISOString(),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    ...(value.changeReason ? { changeReason: value.changeReason } : {}),
    ...(value.cancelledAt ? { cancelledAt: value.cancelledAt.toISOString() } : {}),
    ...(value.cancelledBy ? { cancelledBy: value.cancelledBy } : {}),
    ...(value.cancellationReason ? { cancellationReason: value.cancellationReason } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
  });
}

/**
 * Write-side adapter, used only inside a ScheduleAssignment write
 * transaction. Tenant scoping is on every query's where clause. Overlap
 * prevention is enforced twice: here the service pre-checks in-transaction
 * against live, non-cancelled data for a clean error, and the database's
 * GIST exclusion constraint (scoped to cancelled_at IS NULL) is the actual
 * guarantee against a race (Slice 4 Decision 6).
 */
export class PrismaScheduleAssignmentWriteRepository implements ScheduleAssignmentWriteRepository {
  constructor(private readonly prisma: PrismaScheduleAssignmentWriteClient) {}

  async findById(tenantId: string, id: string): Promise<ScheduleAssignmentRecord | undefined> {
    const assignment = await this.prisma.scheduleAssignment.findFirst({ where: { tenantId, id } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async listForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord[]> {
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: { tenantId, personId, cancelledAt: null },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }

  async findCurrentForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord | undefined> {
    const assignment = await this.prisma.scheduleAssignment.findFirst({ where: { tenantId, personId, effectiveUntil: null, cancelledAt: null } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async create(input: CreateScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    const assignment = await this.prisma.scheduleAssignment.create({
      data: {
        tenantId: input.tenantId,
        personId: input.personId,
        workScheduleId: input.workScheduleId,
        workScheduleVersionId: input.workScheduleVersionId,
        effectiveFrom: new Date(input.effectiveFrom),
        changeReason: input.changeReason ?? null,
        createdBy: input.createdBy,
      },
    });
    return toRecord(assignment);
  }

  async end(input: EndScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    // updateMany (not update) so the where clause can be tenant-scoped without
    // requiring a compound (tenantId, id) unique key — id alone is never
    // trusted for a write, even though it is a UUID.
    const result = await this.prisma.scheduleAssignment.updateMany({
      where: { id: input.id, tenantId: input.tenantId },
      data: { effectiveUntil: new Date(input.effectiveUntil) },
    });
    if (result.count === 0) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated = await this.prisma.scheduleAssignment.findFirst({ where: { id: input.id, tenantId: input.tenantId } });
    if (!updated) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    return toRecord(updated);
  }

  async cancelFuture(input: CancelFutureScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    const result = await this.prisma.scheduleAssignment.updateMany({
      where: { id: input.id, tenantId: input.tenantId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: input.cancelledBy,
        cancellationReason: input.cancellationReason ?? null,
      },
    });
    if (result.count === 0) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated = await this.prisma.scheduleAssignment.findFirst({ where: { id: input.id, tenantId: input.tenantId } });
    if (!updated) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    return toRecord(updated);
  }
}
