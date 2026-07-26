import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  ActivateWorkScheduleVersionInput,
  ActivateWorkScheduleVersionOutcome,
  CreateWorkScheduleInput,
  CreateWorkScheduleVersionInput,
  ReplaceDraftWorkScheduleVersionContentInput,
  UpdateWorkScheduleDetailsInput,
  WorkScheduleReadRepository,
  WorkScheduleWriteRepository,
} from "@/platform/timekeeping/work-schedule-repository";
import type { WorkScheduleRecord, WorkScheduleVersionRecord } from "@/platform/timekeeping/work-schedule";

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class WorkScheduleStore {
  readonly workSchedules: WorkScheduleRecord[] = [];
  readonly versions: WorkScheduleVersionRecord[] = [];
}

export class InMemoryWorkScheduleWriteRepository implements WorkScheduleWriteRepository {
  constructor(private readonly store: WorkScheduleStore = new WorkScheduleStore()) {}

  async findById(tenantId: string, id: string): Promise<WorkScheduleRecord | undefined> {
    return this.store.workSchedules.find((s) => s.tenantId === tenantId && s.id === id);
  }

  async findByCode(tenantId: string, code: string): Promise<WorkScheduleRecord | undefined> {
    return this.store.workSchedules.find((s) => s.tenantId === tenantId && s.code === code);
  }

  async create(input: CreateWorkScheduleInput): Promise<WorkScheduleRecord> {
    const now = new Date().toISOString();
    const schedule: WorkScheduleRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    });
    this.store.workSchedules.push(schedule);
    return schedule;
  }

  async updateDetails(input: UpdateWorkScheduleDetailsInput): Promise<WorkScheduleRecord> {
    const index = this.store.workSchedules.findIndex((s) => s.tenantId === input.tenantId && s.id === input.id);
    if (index === -1) throw new Error(`work schedule ${input.id} not found for tenant ${input.tenantId}`);
    const { description: _currentDescription, ...currentRest } = this.store.workSchedules[index];
    const updated: WorkScheduleRecord = Object.freeze({
      ...currentRest,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      updatedAt: new Date(Date.now() + 1).toISOString(),
    });
    this.store.workSchedules[index] = updated;
    return updated;
  }

  async findVersionById(tenantId: string, versionId: string): Promise<WorkScheduleVersionRecord | undefined> {
    return this.store.versions.find((v) => v.tenantId === tenantId && v.id === versionId);
  }

  async listVersionsForSchedule(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord[]> {
    return this.store.versions
      .filter((v) => v.tenantId === tenantId && v.workScheduleId === workScheduleId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  async getActiveVersion(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined> {
    return this.store.versions.find((v) => v.tenantId === tenantId && v.workScheduleId === workScheduleId && v.status === "ACTIVE");
  }

  async nextVersionNumber(tenantId: string, workScheduleId: string): Promise<number> {
    const numbers = this.store.versions
      .filter((v) => v.tenantId === tenantId && v.workScheduleId === workScheduleId)
      .map((v) => v.versionNumber);
    return (numbers.length ? Math.max(...numbers) : 0) + 1;
  }

  async createVersion(input: CreateWorkScheduleVersionInput): Promise<WorkScheduleVersionRecord> {
    const versionNumber = await this.nextVersionNumber(input.tenantId, input.workScheduleId);
    const version: WorkScheduleVersionRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      workScheduleId: input.workScheduleId,
      versionNumber,
      status: "DRAFT" as const,
      scheduleType: input.scheduleType,
      timezoneResolutionMode: input.timezoneResolutionMode,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      weeklyPattern: input.weeklyPattern,
      canonicalHash: input.canonicalHash,
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    });
    this.store.versions.push(version);
    return version;
  }

  async replaceDraftVersionContent(input: ReplaceDraftWorkScheduleVersionContentInput): Promise<WorkScheduleVersionRecord | "not_found" | "not_draft"> {
    const index = this.store.versions.findIndex((v) => v.tenantId === input.tenantId && v.id === input.versionId);
    if (index === -1) return "not_found";
    if (this.store.versions[index].status !== "DRAFT") return "not_draft";
    const { timezone: _currentTimezone, changeReason: _currentChangeReason, ...currentRest } = this.store.versions[index];
    const updated: WorkScheduleVersionRecord = Object.freeze({
      ...currentRest,
      scheduleType: input.scheduleType,
      timezoneResolutionMode: input.timezoneResolutionMode,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      weeklyPattern: input.weeklyPattern,
      canonicalHash: input.canonicalHash,
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
    });
    this.store.versions[index] = updated;
    return updated;
  }

  async activateVersion(input: ActivateWorkScheduleVersionInput): Promise<ActivateWorkScheduleVersionOutcome | "not_found" | "not_draft"> {
    const targetIndex = this.store.versions.findIndex((v) => v.tenantId === input.tenantId && v.id === input.versionId && v.workScheduleId === input.workScheduleId);
    if (targetIndex === -1) return "not_found";
    if (this.store.versions[targetIndex].status !== "DRAFT") return "not_draft";

    const now = new Date().toISOString();
    let retired: WorkScheduleVersionRecord | undefined;
    const currentActiveIndex = this.store.versions.findIndex((v) => v.tenantId === input.tenantId && v.workScheduleId === input.workScheduleId && v.status === "ACTIVE");
    if (currentActiveIndex !== -1) {
      retired = Object.freeze({ ...this.store.versions[currentActiveIndex], status: "RETIRED" as const, retiredAt: now });
      this.store.versions[currentActiveIndex] = retired;
    }

    const activated: WorkScheduleVersionRecord = Object.freeze({ ...this.store.versions[targetIndex], status: "ACTIVE" as const, activatedAt: now });
    this.store.versions[targetIndex] = activated;

    return Object.freeze({ activated, ...(retired ? { retired } : {}) });
  }
}

export class InMemoryWorkScheduleReadRepository implements WorkScheduleReadRepository {
  constructor(private readonly store: WorkScheduleStore) {}

  async getById(context: TenantContext, id: string): Promise<WorkScheduleRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.workSchedules.find((s) => s.tenantId === context.tenantId && s.id === id);
  }

  async getByCode(context: TenantContext, code: string): Promise<WorkScheduleRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.workSchedules.find((s) => s.tenantId === context.tenantId && s.code === code);
  }

  async listAll(context: TenantContext): Promise<WorkScheduleRecord[]> {
    requireTimekeepingView(context);
    return this.store.workSchedules
      .filter((s) => s.tenantId === context.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }

  async getVersionById(context: TenantContext, versionId: string): Promise<WorkScheduleVersionRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.versions.find((v) => v.tenantId === context.tenantId && v.id === versionId);
  }

  async listVersionsForSchedule(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord[]> {
    requireTimekeepingView(context);
    return this.store.versions
      .filter((v) => v.tenantId === context.tenantId && v.workScheduleId === workScheduleId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  async getActiveVersion(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.versions.find((v) => v.tenantId === context.tenantId && v.workScheduleId === workScheduleId && v.status === "ACTIVE");
  }
}
