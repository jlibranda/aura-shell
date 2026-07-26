import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { ScheduleAssignmentTransactionRepositories } from "@/platform/timekeeping/schedule-assignment-repository";
import {
  validateAssignScheduleInput,
  validateCancelFutureAssignmentInput,
  validateEndAssignmentInput,
  validateTransferScheduleInput,
  windowsOverlap,
  type AssignScheduleInput,
  type CancelFutureAssignmentInput,
  type EndAssignmentInput,
  type ScheduleAssignmentRecord,
} from "@/platform/timekeeping/schedule-assignment";

export type ScheduleAssigned = Readonly<{ state: "assigned"; assignment: ScheduleAssignmentRecord }>;
export type ScheduleTransferred = Readonly<{ state: "transferred"; previous: ScheduleAssignmentRecord; assignment: ScheduleAssignmentRecord }>;
export type ScheduleAssignmentEnded = Readonly<{ state: "ended"; assignment: ScheduleAssignmentRecord }>;
export type ScheduleAssignmentCancelled = Readonly<{ state: "cancelled"; assignment: ScheduleAssignmentRecord }>;

type EligibilityCheck =
  | "no_organization_assignment"
  | "version_not_found"
  | "version_schedule_mismatch"
  | "version_not_active"
  | undefined;

/**
 * The single write entry point for ScheduleAssignment (Slice 4 Phase A). Owns
 * the invariants that must be enforced against live data *inside the write
 * transaction* — the ADR-014 §4.2 cross-aggregate invariant against
 * Organization's Assignment, WorkScheduleVersion eligibility, and
 * non-overlap — and produces audit and outbox atomically through the
 * UnitOfWork. Every mutation requires timekeeping.manage (Slice 4 Decision
 * 12); there is no read method here — reads go through
 * ScheduleAssignmentReadRepository directly, the same convention every other
 * Organization/Timekeeping service already follows.
 *
 * Validation order (Slice 4 Decision 10), enforced identically by every
 * write method: authorization -> input/domain validation -> (transfer/end/
 * cancel only: the target assignment's own state) -> Organization Assignment
 * as-of validation -> WorkSchedule/Version relationship -> WorkScheduleVersion
 * status eligibility -> application-level overlap pre-check -> write ->
 * audit/events -> commit. The database's GIST exclusion constraint and
 * composite foreign keys remain authoritative for concurrency safety
 * regardless of what the application pre-check already found.
 */
export class ScheduleAssignmentService {
  constructor(private readonly unitOfWork: UnitOfWork<ScheduleAssignmentTransactionRepositories>) {}

  /** A person's first schedule assignment, or a future/past non-overlapping one. */
  async assignSchedule(request: TrustedRequestContext, input: AssignScheduleInput): Promise<CommandResult<ScheduleAssigned>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateAssignScheduleInput(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "AssignSchedule"), async ({ repositories }) => {
      const eligibility = await this.checkEligibility(repositories, tenantId, validation.data);
      if (eligibility) return eligibility;

      const others = await repositories.scheduleAssignments.listForPerson(tenantId, validation.data.personId);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined, cancelledAt: undefined };
      if (others.some((a) => windowsOverlap(a, candidate))) return "overlap" as const;

      return repositories.scheduleAssignments.create({
        tenantId,
        personId: validation.data.personId,
        workScheduleId: validation.data.workScheduleId,
        workScheduleVersionId: validation.data.workScheduleVersionId,
        effectiveFrom: validation.data.effectiveFrom,
        changeReason: validation.data.changeReason,
        createdBy: request.principal.userId,
      });
    });

    if (result === "no_organization_assignment") return commandValidationFailure([issue("effectiveFrom", "no_organization_assignment", "This person has no Organization placement in force on the chosen effective date.")]);
    if (result === "version_not_found") return commandValidationFailure([issue("workScheduleVersionId", "not_found", "This work schedule version does not exist.")]);
    if (result === "version_schedule_mismatch") return commandValidationFailure([issue("workScheduleVersionId", "schedule_mismatch", "This work schedule version does not belong to the chosen work schedule.")]);
    if (result === "version_not_active") return commandValidationFailure([issue("workScheduleVersionId", "not_active", "Only an ACTIVE work schedule version may be newly assigned.")]);
    if (result === "overlap") return commandConflict("This assignment would overlap another schedule assignment for this person.");
    return commandSuccess(Object.freeze({ state: "assigned" as const, assignment: result }));
  }

  /**
   * Ends the current schedule assignment and opens a new one, atomically, at
   * the same instant — old and new windows are adjacent under [) semantics
   * (Slice 4 Decision 8). Unlike endAssignment, transferSchedule may operate
   * on a not-yet-started current assignment (there is no "started" gate
   * here — only cancelFutureAssignment and endAssignment have one).
   */
  async transferSchedule(request: TrustedRequestContext, input: AssignScheduleInput): Promise<CommandResult<ScheduleTransferred>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateTransferScheduleInput(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "TransferSchedule"), async ({ repositories }) => {
      const current = await repositories.scheduleAssignments.findCurrentForPerson(tenantId, validation.data.personId);
      if (!current) return "no_current_assignment" as const;
      if (new Date(validation.data.effectiveFrom).getTime() <= new Date(current.effectiveFrom).getTime()) {
        return "invalid_transfer_date" as const;
      }

      const eligibility = await this.checkEligibility(repositories, tenantId, validation.data);
      if (eligibility) return eligibility;

      const others = (await repositories.scheduleAssignments.listForPerson(tenantId, validation.data.personId)).filter((a) => a.id !== current.id);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined, cancelledAt: undefined };
      if (others.some((a) => windowsOverlap(a, candidate))) return "overlap" as const;

      const previous = await repositories.scheduleAssignments.end({ tenantId, id: current.id, effectiveUntil: validation.data.effectiveFrom });
      const assignment = await repositories.scheduleAssignments.create({
        tenantId,
        personId: validation.data.personId,
        workScheduleId: validation.data.workScheduleId,
        workScheduleVersionId: validation.data.workScheduleVersionId,
        effectiveFrom: validation.data.effectiveFrom,
        changeReason: validation.data.changeReason,
        createdBy: request.principal.userId,
      });
      return Object.freeze({ previous, assignment });
    });

    if (result === "no_current_assignment") return commandValidationFailure([issue("personId", "no_current_assignment", "This person has no current schedule assignment to transfer from.")]);
    if (result === "invalid_transfer_date") return commandValidationFailure([issue("effectiveFrom", "INVALID_DATE", "The transfer date must be after the current assignment's start date.")]);
    if (result === "no_organization_assignment") return commandValidationFailure([issue("effectiveFrom", "no_organization_assignment", "This person has no Organization placement in force on the chosen effective date.")]);
    if (result === "version_not_found") return commandValidationFailure([issue("workScheduleVersionId", "not_found", "This work schedule version does not exist.")]);
    if (result === "version_schedule_mismatch") return commandValidationFailure([issue("workScheduleVersionId", "schedule_mismatch", "This work schedule version does not belong to the chosen work schedule.")]);
    if (result === "version_not_active") return commandValidationFailure([issue("workScheduleVersionId", "not_active", "Only an ACTIVE work schedule version may be newly assigned.")]);
    if (result === "overlap") return commandConflict("This transfer would overlap another schedule assignment for this person.");
    return commandSuccess(Object.freeze({ state: "transferred" as const, previous: result.previous, assignment: result.assignment }));
  }

  /** Closes a person's current, already-started schedule assignment without opening a new one. A not-yet-started assignment must use cancelFutureAssignment instead (Slice 4 Decision 8). */
  async endAssignment(request: TrustedRequestContext, input: EndAssignmentInput): Promise<CommandResult<ScheduleAssignmentEnded>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateEndAssignmentInput(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "EndScheduleAssignment"), async ({ repositories }) => {
      const current = await repositories.scheduleAssignments.findCurrentForPerson(tenantId, validation.data.personId);
      if (!current) return "no_current_assignment" as const;
      if (new Date(current.effectiveFrom).getTime() > Date.now()) return "not_yet_started" as const;
      if (new Date(validation.data.effectiveUntil).getTime() <= new Date(current.effectiveFrom).getTime()) return "invalid_end_date" as const;
      return repositories.scheduleAssignments.end({ tenantId, id: current.id, effectiveUntil: validation.data.effectiveUntil });
    });

    if (result === "no_current_assignment") return commandValidationFailure([issue("personId", "no_current_assignment", "This person has no current schedule assignment to end.")]);
    if (result === "not_yet_started") return commandConflict("This assignment has not started yet. Use cancelFutureAssignment instead of endAssignment.");
    if (result === "invalid_end_date") return commandValidationFailure([issue("effectiveUntil", "INVALID_DATE", "The end date must be after the assignment's start date.")]);
    return commandSuccess(Object.freeze({ state: "ended" as const, assignment: result }));
  }

  /**
   * Cancels a not-yet-started schedule assignment using the explicit
   * cancellation fields — never by mutating effectiveUntil, which could
   * otherwise land earlier than effectiveFrom (Slice 4 Decision 7). A
   * started or historical assignment cannot be cancelled; it must be handled
   * through end or transfer.
   */
  async cancelFutureAssignment(request: TrustedRequestContext, input: CancelFutureAssignmentInput): Promise<CommandResult<ScheduleAssignmentCancelled>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateCancelFutureAssignmentInput(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CancelFutureScheduleAssignment"), async ({ repositories }) => {
      const target = await repositories.scheduleAssignments.findById(tenantId, validation.data.id);
      if (!target) return "not_found" as const;
      if (target.cancelledAt) return "already_cancelled" as const;
      if (new Date(target.effectiveFrom).getTime() <= Date.now()) return "not_future" as const;
      return repositories.scheduleAssignments.cancelFuture({
        tenantId,
        id: validation.data.id,
        cancelledBy: request.principal.userId,
        cancellationReason: validation.data.cancellationReason,
      });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This schedule assignment does not exist.")]);
    if (result === "already_cancelled") return commandConflict("This schedule assignment is already cancelled.");
    if (result === "not_future") return commandConflict("Only a not-yet-started assignment can be cancelled. Use end or transfer for a started assignment.");
    return commandSuccess(Object.freeze({ state: "cancelled" as const, assignment: result }));
  }

  /**
   * Slice 4 Decision 10's deterministic validation order, steps 3-5: person
   * Organization Assignment as-of validation, then WorkSchedule/Version
   * relationship, then WorkScheduleVersion status eligibility — always in
   * this order, so a request invalid on multiple grounds always surfaces the
   * same, most-fundamental reason first (see the dedicated ordering test).
   */
  private async checkEligibility(
    repositories: ScheduleAssignmentTransactionRepositories,
    tenantId: string,
    data: { personId: string; workScheduleId: string; workScheduleVersionId: string; effectiveFrom: string },
  ): Promise<EligibilityCheck> {
    const hasPlacement = await repositories.organizationAssignments.hasApplicableAssignmentAsOf(tenantId, data.personId, data.effectiveFrom);
    if (!hasPlacement) return "no_organization_assignment";

    const version = await repositories.workSchedules.findVersionById(tenantId, data.workScheduleVersionId);
    if (!version) return "version_not_found";
    if (version.workScheduleId !== data.workScheduleId) return "version_schedule_mismatch";
    if (version.status !== "ACTIVE") return "version_not_active";

    return undefined;
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "timekeeping.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage schedule assignments.");
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
