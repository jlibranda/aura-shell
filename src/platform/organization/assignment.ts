import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

/**
 * Assignment — the authoritative, effective-dated placement of a person into
 * the organization (ADR-012 §5, §7). Employee is no longer the source of
 * department / team / manager / work location; those live here, over time.
 *
 * This slice models the PRIMARY placement only (ADR-012 §12 invariant #3):
 * at most one primary assignment may be in force for a person at any instant.
 * Secondary / acting / dotted-line relationships are deferred. A placement is
 * never edited in place — a transfer ends the current record and creates a new
 * one, so historical placement is always resolvable.
 */
export interface AssignmentRecord {
  id: string;
  tenantId: string;
  /** The employee this placement is for. */
  personId: string;
  orgUnitId: string;
  /** The primary manager (an employee), when the person has one. */
  managerId?: string;
  /** The assigned work Location, when the placement has one. Locations are orthogonal to the OrgUnit tree (ADR-012 §5) — this is a plain reference, never a hierarchy relationship. */
  locationId?: string;
  /** Always true this slice; the column exists because "one PRIMARY at a time" is a permanent ADR-012 invariant. */
  isPrimary: boolean;
  /** Inclusive start of the placement window (ISO-8601). */
  effectiveFrom: string;
  /** Exclusive end; absent means the placement is still in force. */
  effectiveUntil?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/;

function validInstant(value: string | undefined): boolean {
  return Boolean(value && isoDate.test(value) && !Number.isNaN(Date.parse(value)));
}

export interface AssignPrimaryInput {
  personId: string;
  orgUnitId: string;
  managerId?: string;
  locationId?: string;
  effectiveFrom: string;
}

/** Validates a new primary assignment's own fields. Cross-aggregate checks (org unit / manager existence, overlap) are enforced by the service against live data. */
export function validateAssignPrimary(input: AssignPrimaryInput): ValidationResult<AssignPrimaryInput> {
  const issues = [];
  if (!input.personId?.trim()) issues.push(issue("personId", "REQUIRED", "A person is required."));
  if (!input.orgUnitId?.trim()) issues.push(issue("orgUnitId", "REQUIRED", "An organization unit is required."));
  if (!validInstant(input.effectiveFrom)) issues.push(issue("effectiveFrom", "INVALID_DATE", "A valid effective-from date is required."));
  if (input.managerId && input.personId && input.managerId === input.personId) issues.push(issue("managerId", "SELF_MANAGER", "A person cannot be their own manager."));
  return issues.length ? invalid(issues) : valid(input);
}

export interface TransferInput {
  personId: string;
  orgUnitId: string;
  managerId?: string;
  locationId?: string;
  effectiveFrom: string;
}

export function validateTransfer(input: TransferInput): ValidationResult<TransferInput> {
  return validateAssignPrimary(input);
}

export interface EndAssignmentInput {
  personId: string;
  effectiveUntil: string;
}

export function validateEndAssignment(input: EndAssignmentInput): ValidationResult<EndAssignmentInput> {
  const issues = [];
  if (!input.personId?.trim()) issues.push(issue("personId", "REQUIRED", "A person is required."));
  if (!validInstant(input.effectiveUntil)) issues.push(issue("effectiveUntil", "INVALID_DATE", "A valid end date is required."));
  return issues.length ? invalid(issues) : valid(input);
}

/* -------------------------------------------------------------------------- */
/* Pure effective-date helpers. No I/O.                                       */
/* -------------------------------------------------------------------------- */

/** Is this assignment in force at `asOf`? Half-open window: [effectiveFrom, effectiveUntil). */
export function isEffectiveAsOf(assignment: Pick<AssignmentRecord, "effectiveFrom" | "effectiveUntil">, asOf: Date): boolean {
  const at = asOf.getTime();
  if (new Date(assignment.effectiveFrom).getTime() > at) return false;
  if (assignment.effectiveUntil && new Date(assignment.effectiveUntil).getTime() <= at) return false;
  return true;
}

/** Do two half-open windows overlap? Adjacent windows (a.until === b.from) do NOT overlap. */
export function windowsOverlap(
  a: Pick<AssignmentRecord, "effectiveFrom" | "effectiveUntil">,
  b: Pick<AssignmentRecord, "effectiveFrom" | "effectiveUntil">,
): boolean {
  const aFrom = new Date(a.effectiveFrom).getTime();
  const aUntil = a.effectiveUntil ? new Date(a.effectiveUntil).getTime() : Infinity;
  const bFrom = new Date(b.effectiveFrom).getTime();
  const bUntil = b.effectiveUntil ? new Date(b.effectiveUntil).getTime() : Infinity;
  return aFrom < bUntil && bFrom < aUntil;
}

/** The single primary assignment in force at `asOf` for an already person-scoped list, if any. */
export function primaryAsOf(assignments: readonly AssignmentRecord[], asOf: Date): AssignmentRecord | undefined {
  return assignments.find((a) => a.isPrimary && isEffectiveAsOf(a, asOf));
}
