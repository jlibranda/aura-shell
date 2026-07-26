import type { Prisma } from "@prisma/client";
import type {
  ActivateWorkScheduleVersionInput,
  ActivateWorkScheduleVersionOutcome,
  CreateWorkScheduleInput,
  CreateWorkScheduleVersionInput,
  ReplaceDraftWorkScheduleVersionContentInput,
  UpdateWorkScheduleDetailsInput,
  WorkScheduleWriteRepository,
} from "@/platform/timekeeping/work-schedule-repository";
import type {
  ScheduleType,
  TimezoneResolutionMode,
  WeeklyPattern,
  WorkScheduleRecord,
  WorkScheduleVersionRecord,
  WorkScheduleVersionStatus,
} from "@/platform/timekeeping/work-schedule";

export type PrismaWorkScheduleWriteClient = Pick<Prisma.TransactionClient, "workSchedule" | "workScheduleVersion">;

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

/**
 * Write-side adapter, used only inside a WorkSchedule write transaction.
 * Tenant scoping is on every query's where clause. There is no code
 * mutation, no delete, and no generic status-mutation method — the only
 * path to ACTIVE/RETIRED is activateVersion, which updates both rows
 * inside the same already-open interactive transaction the UnitOfWork
 * provides, so the database's partial unique index
 * (work_schedule_versions_one_active_per_schedule) is the final,
 * authoritative guard against two simultaneously-ACTIVE versions even
 * under concurrent activation attempts.
 */
export class PrismaWorkScheduleWriteRepository implements WorkScheduleWriteRepository {
  constructor(private readonly prisma: PrismaWorkScheduleWriteClient) {}

  async findById(tenantId: string, id: string): Promise<WorkScheduleRecord | undefined> {
    const schedule = await this.prisma.workSchedule.findFirst({ where: { tenantId, id } });
    return schedule ? toScheduleRecord(schedule) : undefined;
  }

  async findByCode(tenantId: string, code: string): Promise<WorkScheduleRecord | undefined> {
    const schedule = await this.prisma.workSchedule.findUnique({ where: { tenantId_code: { tenantId, code } } });
    return schedule ? toScheduleRecord(schedule) : undefined;
  }

  async create(input: CreateWorkScheduleInput): Promise<WorkScheduleRecord> {
    const schedule = await this.prisma.workSchedule.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        createdBy: input.createdBy,
      },
    });
    return toScheduleRecord(schedule);
  }

  async updateDetails(input: UpdateWorkScheduleDetailsInput): Promise<WorkScheduleRecord> {
    const updated = await this.prisma.workSchedule.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.id } },
      data: { name: input.name, description: input.description ?? null },
    });
    return toScheduleRecord(updated);
  }

  async findVersionById(tenantId: string, versionId: string): Promise<WorkScheduleVersionRecord | undefined> {
    const version = await this.prisma.workScheduleVersion.findFirst({ where: { tenantId, id: versionId } });
    return version ? toVersionRecord(version) : undefined;
  }

  async listVersionsForSchedule(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord[]> {
    const versions = await this.prisma.workScheduleVersion.findMany({
      where: { tenantId, workScheduleId },
      orderBy: { versionNumber: "asc" },
    });
    return versions.map(toVersionRecord);
  }

  async getActiveVersion(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined> {
    const version = await this.prisma.workScheduleVersion.findFirst({ where: { tenantId, workScheduleId, status: "ACTIVE" } });
    return version ? toVersionRecord(version) : undefined;
  }

  async nextVersionNumber(tenantId: string, workScheduleId: string): Promise<number> {
    const latest = await this.prisma.workScheduleVersion.findFirst({
      where: { tenantId, workScheduleId },
      orderBy: { versionNumber: "desc" },
    });
    return (latest?.versionNumber ?? 0) + 1;
  }

  async createVersion(input: CreateWorkScheduleVersionInput): Promise<WorkScheduleVersionRecord> {
    const versionNumber = await this.nextVersionNumber(input.tenantId, input.workScheduleId);
    const version = await this.prisma.workScheduleVersion.create({
      data: {
        tenantId: input.tenantId,
        workScheduleId: input.workScheduleId,
        versionNumber,
        status: "DRAFT",
        scheduleType: input.scheduleType,
        timezoneResolutionMode: input.timezoneResolutionMode,
        timezone: input.timezone ?? null,
        weeklyPattern: input.weeklyPattern as unknown as Prisma.InputJsonValue,
        canonicalHash: input.canonicalHash,
        changeReason: input.changeReason ?? null,
        createdBy: input.createdBy,
      },
    });
    return toVersionRecord(version);
  }

  async replaceDraftVersionContent(input: ReplaceDraftWorkScheduleVersionContentInput): Promise<WorkScheduleVersionRecord | "not_found" | "not_draft"> {
    const existing = await this.prisma.workScheduleVersion.findFirst({ where: { tenantId: input.tenantId, id: input.versionId } });
    if (!existing) return "not_found";
    if (existing.status !== "DRAFT") return "not_draft";

    const updated = await this.prisma.workScheduleVersion.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.versionId } },
      data: {
        scheduleType: input.scheduleType,
        timezoneResolutionMode: input.timezoneResolutionMode,
        timezone: input.timezone ?? null,
        weeklyPattern: input.weeklyPattern as unknown as Prisma.InputJsonValue,
        canonicalHash: input.canonicalHash,
        changeReason: input.changeReason ?? null,
      },
    });
    return toVersionRecord(updated);
  }

  async activateVersion(input: ActivateWorkScheduleVersionInput): Promise<ActivateWorkScheduleVersionOutcome | "not_found" | "not_draft"> {
    const target = await this.prisma.workScheduleVersion.findFirst({
      where: { tenantId: input.tenantId, id: input.versionId, workScheduleId: input.workScheduleId },
    });
    if (!target) return "not_found";
    if (target.status !== "DRAFT") return "not_draft";

    const now = new Date();
    const currentActive = await this.prisma.workScheduleVersion.findFirst({
      where: { tenantId: input.tenantId, workScheduleId: input.workScheduleId, status: "ACTIVE" },
    });

    let retired: WorkScheduleVersionRecord | undefined;
    if (currentActive) {
      const retiredRow = await this.prisma.workScheduleVersion.update({
        where: { tenantId_id: { tenantId: input.tenantId, id: currentActive.id } },
        data: { status: "RETIRED", retiredAt: now },
      });
      retired = toVersionRecord(retiredRow);
    }

    const activatedRow = await this.prisma.workScheduleVersion.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.versionId } },
      data: { status: "ACTIVE", activatedAt: now },
    });

    return Object.freeze({ activated: toVersionRecord(activatedRow), ...(retired ? { retired } : {}) });
  }
}
