import type { TenantContext } from "@/platform/context";
import type {
  ScheduleType,
  TimezoneResolutionMode,
  WeeklyPattern,
  WorkScheduleRecord,
  WorkScheduleVersionRecord,
} from "@/platform/timekeeping/work-schedule";

export interface CreateWorkScheduleInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  createdBy: string;
}

export interface UpdateWorkScheduleDetailsInput {
  tenantId: string;
  id: string;
  name: string;
  description?: string;
}

export interface CreateWorkScheduleVersionInput {
  tenantId: string;
  workScheduleId: string;
  scheduleType: ScheduleType;
  timezoneResolutionMode: TimezoneResolutionMode;
  timezone?: string;
  weeklyPattern: WeeklyPattern;
  canonicalHash: string;
  changeReason?: string;
  createdBy: string;
}

export interface ReplaceDraftWorkScheduleVersionContentInput {
  tenantId: string;
  versionId: string;
  scheduleType: ScheduleType;
  timezoneResolutionMode: TimezoneResolutionMode;
  timezone?: string;
  weeklyPattern: WeeklyPattern;
  canonicalHash: string;
  changeReason?: string;
}

export interface ActivateWorkScheduleVersionInput {
  tenantId: string;
  workScheduleId: string;
  versionId: string;
}

export type ActivateWorkScheduleVersionOutcome = Readonly<{
  activated: WorkScheduleVersionRecord;
  /** The version that was ACTIVE before this activation, now RETIRED — undefined if none existed. */
  retired?: WorkScheduleVersionRecord;
}>;

/**
 * Server-only write port, used only inside a tenant-scoped write
 * transaction. `WorkSchedule.code`/`id` are immutable — there is
 * deliberately no method to change them (Slice 3 Decision 2). There is no
 * update/delete for version content once a version leaves DRAFT — the only
 * content-mutating method (`replaceDraftVersionContent`) is gated to DRAFT
 * by its own implementation, never exposed as a generic update. There is
 * no direct status-mutation method; the only way a version becomes ACTIVE
 * or RETIRED is `activateVersion`, which does both atomically.
 */
export interface WorkScheduleWriteRepository {
  findById(tenantId: string, id: string): Promise<WorkScheduleRecord | undefined>;
  findByCode(tenantId: string, code: string): Promise<WorkScheduleRecord | undefined>;
  create(input: CreateWorkScheduleInput): Promise<WorkScheduleRecord>;
  updateDetails(input: UpdateWorkScheduleDetailsInput): Promise<WorkScheduleRecord>;

  findVersionById(tenantId: string, versionId: string): Promise<WorkScheduleVersionRecord | undefined>;
  listVersionsForSchedule(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord[]>;
  getActiveVersion(tenantId: string, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined>;
  /** MAX(versionNumber) + 1, scoped to workScheduleId — mirrors ConfigurationVersion's nextVersionNumber. */
  nextVersionNumber(tenantId: string, workScheduleId: string): Promise<number>;
  createVersion(input: CreateWorkScheduleVersionInput): Promise<WorkScheduleVersionRecord>;
  /** Full-content replace of a DRAFT row's content; rejects if the version is not DRAFT. */
  replaceDraftVersionContent(input: ReplaceDraftWorkScheduleVersionContentInput): Promise<WorkScheduleVersionRecord | "not_found" | "not_draft">;
  /** Atomically retires the current ACTIVE version (if any) and activates the given DRAFT version. */
  activateVersion(input: ActivateWorkScheduleVersionInput): Promise<ActivateWorkScheduleVersionOutcome | "not_found" | "not_draft">;
}

/** Transaction-scoped repositories exposed to the WorkSchedule write service via UnitOfWork.execute(). */
export type WorkScheduleTransactionRepositories = Readonly<{ workSchedules: WorkScheduleWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires timekeeping.view.
 */
export interface WorkScheduleReadRepository {
  getById(context: TenantContext, id: string): Promise<WorkScheduleRecord | undefined>;
  getByCode(context: TenantContext, code: string): Promise<WorkScheduleRecord | undefined>;
  listAll(context: TenantContext): Promise<WorkScheduleRecord[]>;
  getVersionById(context: TenantContext, versionId: string): Promise<WorkScheduleVersionRecord | undefined>;
  listVersionsForSchedule(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord[]>;
  getActiveVersion(context: TenantContext, workScheduleId: string): Promise<WorkScheduleVersionRecord | undefined>;
}
