import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { WorkScheduleTransactionRepositories } from "@/platform/timekeeping/work-schedule-repository";
import {
  computeWorkScheduleCanonicalHash,
  validateCreateWorkScheduleDraft,
  validateUpdateWorkScheduleDetailsDraft,
  validateWorkScheduleVersionContent,
  type WorkScheduleRecord,
  type WorkScheduleVersionRecord,
} from "@/platform/timekeeping/work-schedule";

export type WorkScheduleCreated = Readonly<{ state: "created"; schedule: WorkScheduleRecord }>;
export type WorkScheduleDetailsUpdated = Readonly<{ state: "updated"; schedule: WorkScheduleRecord }>;
export type WorkScheduleVersionCreated = Readonly<{ state: "version_created"; version: WorkScheduleVersionRecord }>;
export type WorkScheduleDraftContentReplaced = Readonly<{ state: "draft_replaced"; version: WorkScheduleVersionRecord }>;
export type WorkScheduleVersionActivated = Readonly<{ state: "activated"; activated: WorkScheduleVersionRecord; retired?: WorkScheduleVersionRecord }>;

/**
 * The single write entry point for WorkSchedule (Slice 3 Phase A). Owns the
 * invariants that must be enforced against live data *inside the write
 * transaction* — schedule existence, DRAFT-only content mutation, and the
 * duplicate-content rule (below) — and produces audit and outbox atomically
 * through the UnitOfWork. Every mutation requires timekeeping.manage
 * (Slice 3 Decision 11); there is no read method here — reads go through
 * WorkScheduleReadRepository directly, the same convention every other
 * Organization/Timekeeping service already follows (no existing service
 * exposes read methods itself).
 *
 * Duplicate-content rule (Slice 3 "Duplicate Version Rule" investigation):
 * a new or replaced DRAFT's canonicalHash is rejected only if it matches
 * the schedule's current ACTIVE version or another existing DRAFT version —
 * never checked against RETIRED versions, so an intentional restore of
 * an older configuration (Version 1 -> A, Version 2 -> B, Version 3
 * deliberately restores A) is always allowed. This is enforced here, in
 * the service, not as a database constraint — a permanent
 * workScheduleId+canonicalHash unique index would make that legitimate
 * restore scenario impossible forever, which is exactly the failure mode
 * the investigation was asked to avoid.
 */
export class WorkScheduleService {
  constructor(private readonly unitOfWork: UnitOfWork<WorkScheduleTransactionRepositories>) {}

  async createWorkSchedule(request: TrustedRequestContext, input: { code: string; name: string; description?: string }): Promise<CommandResult<WorkScheduleCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateCreateWorkScheduleDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateWorkSchedule"), async ({ repositories }) => {
      const existing = await repositories.workSchedules.findByCode(tenantId, validation.data.code);
      if (existing) return "code_taken" as const;
      return repositories.workSchedules.create({
        tenantId,
        code: validation.data.code,
        name: validation.data.name,
        description: validation.data.description,
        createdBy: request.principal.userId,
      });
    });

    if (result === "code_taken") return commandConflict(`A work schedule with code "${validation.data.code}" already exists.`);
    return commandSuccess(Object.freeze({ state: "created" as const, schedule: result }));
  }

  async updateWorkScheduleDetails(request: TrustedRequestContext, input: { id: string; name: string; description?: string }): Promise<CommandResult<WorkScheduleDetailsUpdated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateUpdateWorkScheduleDetailsDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "UpdateWorkScheduleDetails"), async ({ repositories }) => {
      const existing = await repositories.workSchedules.findById(tenantId, input.id);
      if (!existing) return "not_found" as const;
      return repositories.workSchedules.updateDetails({
        tenantId,
        id: input.id,
        name: validation.data.name,
        description: validation.data.description,
      });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This work schedule does not exist.")]);
    return commandSuccess(Object.freeze({ state: "updated" as const, schedule: result }));
  }

  async createWorkScheduleVersion(
    request: TrustedRequestContext,
    input: { workScheduleId: string; scheduleType: string; timezoneResolutionMode: string; timezone?: string; weeklyPattern: unknown; changeReason?: string },
  ): Promise<CommandResult<WorkScheduleVersionCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateWorkScheduleVersionContent(input);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const canonicalHash = computeWorkScheduleCanonicalHash(validation.data);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateWorkScheduleVersion"), async ({ repositories }) => {
      const schedule = await repositories.workSchedules.findById(tenantId, input.workScheduleId);
      if (!schedule) return "schedule_not_found" as const;

      const duplicate = await this.findDuplicateContent(repositories, tenantId, input.workScheduleId, canonicalHash);
      if (duplicate) return "duplicate_content" as const;

      return repositories.workSchedules.createVersion({
        tenantId,
        workScheduleId: input.workScheduleId,
        scheduleType: validation.data.scheduleType,
        timezoneResolutionMode: validation.data.timezoneResolutionMode,
        timezone: validation.data.timezone,
        weeklyPattern: validation.data.weeklyPattern,
        canonicalHash,
        changeReason: validation.data.changeReason,
        createdBy: request.principal.userId,
      });
    });

    if (result === "schedule_not_found") return commandValidationFailure([issue("workScheduleId", "not_found", "This work schedule does not exist.")]);
    if (result === "duplicate_content") return commandConflict("This content is identical to the schedule's current active version or an existing draft.");
    return commandSuccess(Object.freeze({ state: "version_created" as const, version: result }));
  }

  async replaceDraftVersionContent(
    request: TrustedRequestContext,
    input: { versionId: string; scheduleType: string; timezoneResolutionMode: string; timezone?: string; weeklyPattern: unknown; changeReason?: string },
  ): Promise<CommandResult<WorkScheduleDraftContentReplaced>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateWorkScheduleVersionContent(input);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const canonicalHash = computeWorkScheduleCanonicalHash(validation.data);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ReplaceDraftWorkScheduleVersionContent"), async ({ repositories }) => {
      const target = await repositories.workSchedules.findVersionById(tenantId, input.versionId);
      if (!target) return "not_found" as const;
      if (target.status !== "DRAFT") return "not_draft" as const;

      const duplicate = await this.findDuplicateContent(repositories, tenantId, target.workScheduleId, canonicalHash, input.versionId);
      if (duplicate) return "duplicate_content" as const;

      return repositories.workSchedules.replaceDraftVersionContent({
        tenantId,
        versionId: input.versionId,
        scheduleType: validation.data.scheduleType,
        timezoneResolutionMode: validation.data.timezoneResolutionMode,
        timezone: validation.data.timezone,
        weeklyPattern: validation.data.weeklyPattern,
        canonicalHash,
        changeReason: validation.data.changeReason,
      });
    });

    if (result === "not_found") return commandValidationFailure([issue("versionId", "not_found", "This work schedule version does not exist.")]);
    if (result === "not_draft") return commandConflict("Only a DRAFT version's content may be replaced.");
    if (result === "duplicate_content") return commandConflict("This content is identical to the schedule's current active version or another existing draft.");
    return commandSuccess(Object.freeze({ state: "draft_replaced" as const, version: result }));
  }

  async activateWorkScheduleVersion(request: TrustedRequestContext, input: { workScheduleId: string; versionId: string }): Promise<CommandResult<WorkScheduleVersionActivated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ActivateWorkScheduleVersion"), ({ repositories }) =>
      repositories.workSchedules.activateVersion({ tenantId, workScheduleId: input.workScheduleId, versionId: input.versionId }),
    );

    if (result === "not_found") return commandValidationFailure([issue("versionId", "not_found", "This work schedule version does not exist.")]);
    if (result === "not_draft") return commandConflict("Only a DRAFT version may be activated.");
    return commandSuccess(Object.freeze({ state: "activated" as const, activated: result.activated, ...(result.retired ? { retired: result.retired } : {}) }));
  }

  private async findDuplicateContent(
    repositories: WorkScheduleTransactionRepositories,
    tenantId: string,
    workScheduleId: string,
    canonicalHash: string,
    excludeVersionId?: string,
  ): Promise<boolean> {
    const active = await repositories.workSchedules.getActiveVersion(tenantId, workScheduleId);
    if (active && active.canonicalHash === canonicalHash) return true;

    const versions = await repositories.workSchedules.listVersionsForSchedule(tenantId, workScheduleId);
    return versions.some((v) => v.status === "DRAFT" && v.id !== excludeVersionId && v.canonicalHash === canonicalHash);
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "timekeeping.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage work schedules.");
  }

  private context(request: TrustedRequestContext, commandName: string): UnitOfWorkContext {
    return {
      tenantId: request.principal.tenantId,
      correlationId: request.correlationId,
      requestId: request.correlationId,
      actorUserId: request.principal.userId,
      commandName,
    };
  }
}
