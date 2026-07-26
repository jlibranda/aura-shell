import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { WorkScheduleReadRepository } from "@/platform/timekeeping/work-schedule-repository";
import type {
  ScheduleType,
  TimezoneResolutionMode,
  WeeklyPattern,
  WorkScheduleRecord,
  WorkScheduleVersionRecord,
  WorkScheduleVersionStatus,
} from "@/platform/timekeeping/work-schedule";

function toScheduleRecord(value: {
  id: string; tenantId: string; code: string; name: string; description: string | null;
  createdAt: Date; createdBy: string; updatedAt: Date;
}): WorkScheduleRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    code: value.code,
    name: value.name,
    ...(value.description ? { description: value.description } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
  });
}

function toVersionRecord(value: {
  id: string; tenantId: string; workScheduleId: string; versionNumber: number; status: string;
  scheduleType: string; timezoneResolutionMode: string; timezone: string | null; weeklyPattern: unknown;
  canonicalHash: string; changeReason: string | null; createdAt: Date; createdBy: string;
  activatedAt: Date | null; retiredAt: Date | null;
}): WorkScheduleVersionRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    workScheduleId: value.workScheduleId,
    versionNumber: value.versionNumber,
    status: value.status as WorkScheduleVersionStatus,
    scheduleType: value.scheduleType as ScheduleType,
    timezoneResolutionMode: value.timezoneResolutionMode as TimezoneResolutionMode,
    ...(value.timezone ? { timezone: value.timezone } : {}),
    weeklyPattern: value.weeklyPattern as WeeklyPattern,
    canonicalHash: value.canonicalHash,
    ...(value.changeReason ? { changeReason: value.changeReason } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    ...(value.activatedAt ? { activatedAt: value.activatedAt.toISOString() } : {}),
    ...(value.retiredAt ? { retiredAt: value.retiredAt.toISOString() } : {}),
  });
}

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Read-only, tenant-scoped adapter. Every method requires timekeeping.view. */
export class PrismaWorkScheduleReadRepository implements WorkScheduleReadRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "workSchedule" | "workScheduleVersion">) {}

  async getById(context: TenantContext, id: string): Promise<WorkScheduleRecord | undefined> {
    requireTimekeepingView(context);
    const schedule = await this.prisma.workSchedule.findFirst({ where: { tenantId: context.tenantId, id } });
    return schedule ? toScheduleRecord(schedule) : undefined;
  }

  async getByCode(context: TenantContext, code: string): Promise<WorkScheduleRecord | undefined> {
    requireTimekeepingView(context);
    const schedule = await this.prisma.workSchedule.findUnique({ where: { tenantId_code: { tenantId: context.tenantId, code } } });
    return schedule ? toScheduleRecord(schedule) : undefined;
  }

  async listAll(context: TenantContext): Promise<WorkScheduleRecord[]> {
    requireTimekeepingView(context);
    const schedules = await this.prisma.workSchedule.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ name: "asc" }, { code: "asc" }],
    });
    return schedules.map(toScheduleRecord);
  }

  async getVersionById(context: TenantContext, versionId: string): Promise<WorkScheduleVersionRecord | undefined> {
    requireTimekeepingView(context);
    const version = await this.prisma.workScheduleVersion.findFirst({ where: { tenantId: context.tenantId, id: versionId } });
    return version ? toVersionRecord(version) : undefined;
  }

  async listVersionsForSchedule(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord[]> {
    requireTimekeepingView(context);
    const versions = await this.prisma.workScheduleVersion.findMany({
      where: { tenantId: context.tenantId, workScheduleId },
      orderBy: { versionNumber: "asc" },
    });
    return versions.map(toVersionRecord);
  }

  async getActiveVersion(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined> {
    requireTimekeepingView(context);
    const version = await this.prisma.workScheduleVersion.findFirst({ where: { tenantId: context.tenantId, workScheduleId, status: "ACTIVE" } });
    return version ? toVersionRecord(version) : undefined;
  }
}
