import { invalid, issue, valid, type ValidationIssue, type ValidationResult } from "@/platform/validation";

/**
 * ScheduleAssignment — the effective-dated binding of one immutable
 * WorkScheduleVersion to one person (ADR-014 §4.2; Timekeeping Slice 4).
 * Append-oriented: the only ordinary post-creation mutation is closing an
 * open window through `effectiveUntil` (end/transfer); a not-yet-started
 * assignment is retired instead through the explicit cancellation fields,
 * never by mutating `effectiveUntil` (Slice 4 Decision 7). Pins
 * `workScheduleVersionId` permanently — it never dynamically follows
 * whichever version of `workScheduleId` happens to be ACTIVE later (Slice 4
 * Decision 3), and it is never invalidated or auto-migrated when that
 * version is later RETIRED (Slice 4 Decision 4).
 *
 * ScheduleAssignment never snapshots `legalEntityId`/`orgUnitId`/
 * `locationId`/timezone — those are Organization's, resolved live at
 * read/compute time by later slices, never copied here (ADR-014 §5.4: this
 * aggregate's only job is "who is this schedule for, starting when," which
 * has no independent financial meaning of its own).
 */

const isoInstant = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/;
const REASON_MAX_LENGTH = 500;

function validInstant(value: string | undefined): boolean {
  return Boolean(value && isoInstant.test(value) && !Number.isNaN(Date.parse(value)));
}

function normalizeReason(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export interface ScheduleAssignmentRecord {
  id: string;
  tenantId: string;
  /** The person this schedule is assigned to — a database reference to Employee, never a People domain import (Slice 4 Decision 2). */
  personId: string;
  workScheduleId: string;
  /** The specific, immutable WorkScheduleVersion pinned by this assignment (Slice 4 Decision 3). */
  workScheduleVersionId: string;
  /** Inclusive start of the binding (ISO-8601). */
  effectiveFrom: string;
  /** Exclusive end; absent means the binding is still open. */
  effectiveUntil?: string;
  changeReason?: string;
  /** Set only by cancelFutureAssignment — never as a side effect of end/transfer, which use effectiveUntil instead (Slice 4 Decision 7). */
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: string;
  createdBy: string;
}

export interface AssignScheduleInput {
  personId: string;
  workScheduleId: string;
  workScheduleVersionId: string;
  effectiveFrom: string;
  changeReason?: string;
}

export interface ValidatedAssignScheduleInput {
  personId: string;
  workScheduleId: string;
  workScheduleVersionId: string;
  effectiveFrom: string;
  changeReason?: string;
}

function validateIdentifiersAndDate(input: { personId: string; workScheduleId: string; workScheduleVersionId: string; effectiveFrom: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.personId?.trim()) issues.push(issue("personId", "REQUIRED", "A person is required."));
  if (!input.workScheduleId?.trim()) issues.push(issue("workScheduleId", "REQUIRED", "A work schedule is required."));
  if (!input.workScheduleVersionId?.trim()) issues.push(issue("workScheduleVersionId", "REQUIRED", "A work schedule version is required."));
  if (!validInstant(input.effectiveFrom)) issues.push(issue("effectiveFrom", "INVALID_DATE", "A valid effective-from date is required."));
  return issues;
}

/** Validates a new assignment's/transfer's own fields. Cross-aggregate checks (Organization Assignment window, WorkScheduleVersion eligibility, overlap) are enforced by the service against live data (Slice 4 Decision 10). */
export function validateAssignScheduleInput(input: AssignScheduleInput): ValidationResult<ValidatedAssignScheduleInput> {
  const issues = validateIdentifiersAndDate(input);
  const changeReason = normalizeReason(input.changeReason);
  if (changeReason && changeReason.length > REASON_MAX_LENGTH) issues.push(issue("changeReason", "TOO_LONG", `Change reason must be at most ${REASON_MAX_LENGTH} characters.`));
  if (issues.length) return invalid(issues);
  return valid({
    personId: input.personId.trim(),
    workScheduleId: input.workScheduleId.trim(),
    workScheduleVersionId: input.workScheduleVersionId.trim(),
    effectiveFrom: input.effectiveFrom,
    ...(changeReason ? { changeReason } : {}),
  });
}

/** transferSchedule shares assignSchedule's field shape — the service layer distinguishes "transfer" (there must be a current open assignment) from "assign" (there must not be an overlapping one). */
export const validateTransferScheduleInput = validateAssignScheduleInput;

export interface EndAssignmentInput {
  personId: string;
  effectiveUntil: string;
}

export function validateEndAssignmentInput(input: EndAssignmentInput): ValidationResult<EndAssignmentInput> {
  const issues: ValidationIssue[] = [];
  if (!input.personId?.trim()) issues.push(issue("personId", "REQUIRED", "A person is required."));
  if (!validInstant(input.effectiveUntil)) issues.push(issue("effectiveUntil", "INVALID_DATE", "A valid end date is required."));
  if (issues.length) return invalid(issues);
  return valid({ personId: input.personId.trim(), effectiveUntil: input.effectiveUntil });
}

export interface CancelFutureAssignmentInput {
  id: string;
  cancellationReason?: string;
}

export interface ValidatedCancelFutureAssignmentInput {
  id: string;
  cancellationReason?: string;
}

export function validateCancelFutureAssignmentInput(input: CancelFutureAssignmentInput): ValidationResult<ValidatedCancelFutureAssignmentInput> {
  const issues: ValidationIssue[] = [];
  if (!input.id?.trim()) issues.push(issue("id", "REQUIRED", "A schedule assignment is required."));
  const cancellationReason = normalizeReason(input.cancellationReason);
  if (cancellationReason && cancellationReason.length > REASON_MAX_LENGTH) issues.push(issue("cancellationReason", "TOO_LONG", `Cancellation reason must be at most ${REASON_MAX_LENGTH} characters.`));
  if (issues.length) return invalid(issues);
  return valid({ id: input.id.trim(), ...(cancellationReason ? { cancellationReason } : {}) });
}

/* -------------------------------------------------------------------------- */
/* Pure effective-date / cancellation-state helpers. No I/O.                  */
/* -------------------------------------------------------------------------- */

export function isCancelled(assignment: Pick<ScheduleAssignmentRecord, "cancelledAt">): boolean {
  return Boolean(assignment.cancelledAt);
}

/** Is this assignment in force at `asOf`? Half-open window: [effectiveFrom, effectiveUntil). Cancelled assignments are never in force (Slice 4 Decision 15). */
export function isEffectiveAsOf(assignment: Pick<ScheduleAssignmentRecord, "effectiveFrom" | "effectiveUntil" | "cancelledAt">, asOf: Date): boolean {
  if (isCancelled(assignment)) return false;
  const at = asOf.getTime();
  if (new Date(assignment.effectiveFrom).getTime() > at) return false;
  if (assignment.effectiveUntil && new Date(assignment.effectiveUntil).getTime() <= at) return false;
  return true;
}

/** Do two half-open windows overlap? Adjacent windows (a.until === b.from) do NOT overlap. Cancelled assignments never participate in overlap (Slice 4 Decision 6). */
export function windowsOverlap(
  a: Pick<ScheduleAssignmentRecord, "effectiveFrom" | "effectiveUntil" | "cancelledAt">,
  b: Pick<ScheduleAssignmentRecord, "effectiveFrom" | "effectiveUntil" | "cancelledAt">,
): boolean {
  if (isCancelled(a) || isCancelled(b)) return false;
  const aFrom = new Date(a.effectiveFrom).getTime();
  const aUntil = a.effectiveUntil ? new Date(a.effectiveUntil).getTime() : Infinity;
  const bFrom = new Date(b.effectiveFrom).getTime();
  const bUntil = b.effectiveUntil ? new Date(b.effectiveUntil).getTime() : Infinity;
  return aFrom < bUntil && bFrom < aUntil;
}
