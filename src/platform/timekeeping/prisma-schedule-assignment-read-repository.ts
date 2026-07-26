import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { ScheduleAssignmentReadRepository } from "@/platform/timekeeping/schedule-assignment-repository";
import type { ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";

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

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Read-only, tenant-scoped adapter. Every method requires timekeeping.view. */
export class PrismaScheduleAssignmentReadRepository implements ScheduleAssignmentReadRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "scheduleAssignment">) {}

  async findById(context: TenantContext, id: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    const assignment = await this.prisma.scheduleAssignment.findFirst({ where: { tenantId: context.tenantId, id } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async findAssignmentAtDate(context: TenantContext, personId: string, at: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    const asOf = new Date(at);
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        tenantId: context.tenantId,
        personId,
        cancelledAt: null,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: asOf } }],
      },
    });
    return assignment ? toRecord(assignment) : undefined;
  }

  async findCurrentAssignment(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    const assignment = await this.prisma.scheduleAssignment.findFirst({ where: { tenantId: context.tenantId, personId, effectiveUntil: null, cancelledAt: null } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async listAssignmentsForPerson(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: { tenantId: context.tenantId, personId },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }

  async listFutureAssignments(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: { tenantId: context.tenantId, personId, cancelledAt: null, effectiveFrom: { gt: new Date() } },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }

  async listAssignmentsUsingVersion(context: TenantContext, workScheduleVersionId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: { tenantId: context.tenantId, workScheduleVersionId },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }
}
