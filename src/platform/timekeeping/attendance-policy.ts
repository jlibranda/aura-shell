import { createHash } from "node:crypto";
import { invalid, issue, valid, type ValidationIssue, type ValidationResult } from "@/platform/validation";

/**
 * AttendancePolicy — the configurable, scoped rule set that governs how
 * AttendanceEvent records become an AttendanceDay result (ADR-014 §4.7;
 * Timekeeping Slice 5 Phase A). This slice ships the stable contract
 * (ResolvedAttendancePolicy, AttendancePolicyResolver) plus the only
 * implementation this phase writes: a single Tenant-scoped baseline. The
 * full Tenant->LegalEntity->Location->OrgUnit->Employee precedence chain is
 * Slice 7, against this same contract, without changing its shape.
 *
 * Identity is a two-ID model on one effective-dated table: a stable
 * "lineage" id (`policyId`, copied forward on every replacement) and a
 * per-row "version" id (`policyVersionId`, the actual primary key) — the
 * same discipline ScheduleAssignment/Assignment use for effective dating,
 * extended with the lineage id the approved contract requires.
 *
 * `ResolvedAttendancePolicy` is a flat contract by design — no nested rule
 * objects. `AttendanceCalculationService` (Slice 6) depends on this exact
 * shape permanently; a flat contract keeps that dependency legible and
 * avoids an internal grouping decision leaking into the public seam.
 *
 * `workdayBoundaryMinutes` is deliberately never a field here — the
 * unscheduled-attribution boundary is a fixed ADR-014 Algorithm Invariant
 * (Appendix G), never a tenant-configurable policy value.
 */

const isoInstant = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/;
const REASON_MAX_LENGTH = 500;

/** Fixed at 1 for this slice — Appendix G's algorithm invariants have no second version yet. Recorded on every policy row so a future algorithm revision can be told apart from the values it interprets. */
export const CURRENT_CALCULATION_ALGORITHM_VERSION = 1;

export const POLICY_SCOPES = ["TENANT", "LEGAL_ENTITY", "LOCATION", "ORG_UNIT", "EMPLOYEE"] as const;
export type PolicyScope = (typeof POLICY_SCOPES)[number];

export const ROUNDING_DIRECTIONS = ["nearest", "up", "down"] as const;
export type RoundingDirection = (typeof ROUNDING_DIRECTIONS)[number];

function validInstant(value: string | undefined): boolean {
  return Boolean(value && isoInstant.test(value) && !Number.isNaN(Date.parse(value)));
}

function normalizeReason(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Every field AttendanceCalculationService (Slice 6) will ever need to
 * interpret one day's AttendanceEvents against — a stable policy version
 * identity, an effective period, the resolved flat policy values, and a
 * deterministic fingerprint so two computations against "the same" policy
 * are provably identical (ADR-014 §4.7's historical-immutability invariant).
 * This is the exact, approved public contract — no nested rule objects, no
 * additional fields, no renamed fields.
 */
export interface ResolvedAttendancePolicy {
  policyId: string;
  policyVersionId: string;

  scope: PolicyScope;
  scopeId: string;

  tenantId: string;

  effectiveFrom: string;
  effectiveUntil?: string;

  roundingIntervalMinutes: number;
  roundingDirection: RoundingDirection;

  gracePeriodMinutes: number;
  latenessToleranceMinutes: number;

  unpaidBreakMinutes?: number;

  standardWorkWeekMinutes: number;
  isStandardWorkWeekStatutoryFloor: boolean;

  dailyOvertimeThresholdMinutes?: number;

  calculationAlgorithmVersion: number;

  fingerprint: string;
}

/** The persisted row — ResolvedAttendancePolicy plus provenance/audit fields never exposed to the resolver contract. */
export interface AttendancePolicyRecord extends ResolvedAttendancePolicy {
  changeReason?: string;
  createdAt: string;
  createdBy: string;
}

/** The resolver's stable input contract (ADR-014 §5.3/§5.7). `attendanceAnchorInstant` is the precise UTC instant to resolve effective-dated policy state as of — never a bare calendar date, and never "now." `legalEntityId`/`orgUnitId`/`locationId` are caller-resolved by Slice 6 from its own historical Organization placement snapshot; this resolver never independently queries Organization state. */
export interface AttendancePolicyResolutionInput {
  tenantId: string;
  personId: string;

  attendanceAnchorInstant: string;

  legalEntityId?: string;
  orgUnitId?: string;
  locationId?: string;
}

/** Never a bare value that silently defaults when nothing is configured — an explicit discriminated union (ADR-014, Slice 5 architecture decision gate). */
export type AttendancePolicyResolutionResult =
  | Readonly<{ kind: "resolved"; policy: ResolvedAttendancePolicy }>
  | Readonly<{ kind: "configuration_incomplete"; missingScope: PolicyScope; reason: string }>;

/* -------------------------------------------------------------------------- */
/* Validation — content of a create/replace, never scope/identity.            */
/* -------------------------------------------------------------------------- */

export interface AttendancePolicyContentDraft {
  effectiveFrom: string;
  roundingIntervalMinutes: number;
  roundingDirection: string;
  gracePeriodMinutes: number;
  latenessToleranceMinutes: number;
  unpaidBreakMinutes?: number;
  standardWorkWeekMinutes: number;
  isStandardWorkWeekStatutoryFloor: boolean;
  dailyOvertimeThresholdMinutes?: number;
  changeReason?: string;
}

export interface ValidatedAttendancePolicyContent {
  effectiveFrom: string;
  roundingIntervalMinutes: number;
  roundingDirection: RoundingDirection;
  gracePeriodMinutes: number;
  latenessToleranceMinutes: number;
  unpaidBreakMinutes?: number;
  standardWorkWeekMinutes: number;
  isStandardWorkWeekStatutoryFloor: boolean;
  dailyOvertimeThresholdMinutes?: number;
  changeReason?: string;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * `roundingIntervalMinutes` must be a strictly positive whole number of
 * minutes — the approved contract requires `roundingIntervalMinutes > 0`
 * and does not authorize any divisibility-by-60 (or any other) restriction
 * on top of it.
 */
export function validateAttendancePolicyContentDraft(input: AttendancePolicyContentDraft): ValidationResult<ValidatedAttendancePolicyContent> {
  const issues: ValidationIssue[] = [];

  if (!validInstant(input.effectiveFrom)) issues.push(issue("effectiveFrom", "INVALID_DATE", "A valid effective-from date is required."));

  const roundingDirection = input.roundingDirection?.trim().toLowerCase() ?? "";
  if (!roundingDirection) issues.push(issue("roundingDirection", "REQUIRED", "A rounding direction is required."));
  else if (!(ROUNDING_DIRECTIONS as readonly string[]).includes(roundingDirection)) issues.push(issue("roundingDirection", "INVALID_FORMAT", `"${input.roundingDirection}" is not a recognized rounding direction.`));

  if (!isPositiveInteger(input.roundingIntervalMinutes)) issues.push(issue("roundingIntervalMinutes", "INVALID_VALUE", "Rounding interval must be a positive whole number of minutes."));

  if (!isNonNegativeInteger(input.gracePeriodMinutes)) issues.push(issue("gracePeriodMinutes", "INVALID_VALUE", "Grace period must be a non-negative whole number of minutes."));
  if (!isNonNegativeInteger(input.latenessToleranceMinutes)) issues.push(issue("latenessToleranceMinutes", "INVALID_VALUE", "Lateness tolerance must be a non-negative whole number of minutes."));

  if (input.unpaidBreakMinutes !== undefined && !isNonNegativeInteger(input.unpaidBreakMinutes)) {
    issues.push(issue("unpaidBreakMinutes", "INVALID_VALUE", "Unpaid break minutes must be a non-negative whole number when provided."));
  }

  if (!isNonNegativeInteger(input.standardWorkWeekMinutes)) issues.push(issue("standardWorkWeekMinutes", "INVALID_VALUE", "Standard work week must be a non-negative whole number of minutes."));
  if (typeof input.isStandardWorkWeekStatutoryFloor !== "boolean") issues.push(issue("isStandardWorkWeekStatutoryFloor", "REQUIRED", "isStandardWorkWeekStatutoryFloor must be explicitly true or false."));

  if (input.dailyOvertimeThresholdMinutes !== undefined && !isNonNegativeInteger(input.dailyOvertimeThresholdMinutes)) {
    issues.push(issue("dailyOvertimeThresholdMinutes", "INVALID_VALUE", "Daily overtime threshold must be a non-negative whole number when provided."));
  }

  const changeReason = normalizeReason(input.changeReason);
  if (changeReason && changeReason.length > REASON_MAX_LENGTH) issues.push(issue("changeReason", "TOO_LONG", `Change reason must be at most ${REASON_MAX_LENGTH} characters.`));

  if (issues.length > 0) return invalid(issues);
  return valid({
    effectiveFrom: input.effectiveFrom,
    roundingIntervalMinutes: input.roundingIntervalMinutes,
    roundingDirection: roundingDirection as RoundingDirection,
    gracePeriodMinutes: input.gracePeriodMinutes,
    latenessToleranceMinutes: input.latenessToleranceMinutes,
    ...(input.unpaidBreakMinutes !== undefined ? { unpaidBreakMinutes: input.unpaidBreakMinutes } : {}),
    standardWorkWeekMinutes: input.standardWorkWeekMinutes,
    isStandardWorkWeekStatutoryFloor: input.isStandardWorkWeekStatutoryFloor,
    ...(input.dailyOvertimeThresholdMinutes !== undefined ? { dailyOvertimeThresholdMinutes: input.dailyOvertimeThresholdMinutes } : {}),
    ...(changeReason ? { changeReason } : {}),
  });
}

export interface EndAttendancePolicyInput {
  effectiveUntil: string;
}

export function validateEndAttendancePolicyInput(input: EndAttendancePolicyInput): ValidationResult<EndAttendancePolicyInput> {
  const issues: ValidationIssue[] = [];
  if (!validInstant(input.effectiveUntil)) issues.push(issue("effectiveUntil", "INVALID_DATE", "A valid end date is required."));
  if (issues.length) return invalid(issues);
  return valid({ effectiveUntil: input.effectiveUntil });
}

const FINGERPRINT_FIELDS = [
  "roundingIntervalMinutes",
  "roundingDirection",
  "gracePeriodMinutes",
  "latenessToleranceMinutes",
  "unpaidBreakMinutes",
  "standardWorkWeekMinutes",
  "isStandardWorkWeekStatutoryFloor",
  "dailyOvertimeThresholdMinutes",
  "calculationAlgorithmVersion",
] as const;

/**
 * Deterministic content hash (ADR-014 §4.7's fingerprint requirement) —
 * fixed key order, excludes identity/version/scope/effective-period/
 * provenance fields, so two policy rows with identical resolved values
 * always hash identically regardless of when or how they were created.
 * Undefined optional values normalize to `null` before hashing so an
 * absent field never silently changes the fingerprint's shape. Mirrors
 * computeWorkScheduleCanonicalHash's precedent (Slice 3 Decision 10).
 */
export function computeAttendancePolicyFingerprint(content: Pick<ResolvedAttendancePolicy, (typeof FINGERPRINT_FIELDS)[number]>): string {
  const canonical = {
    roundingIntervalMinutes: content.roundingIntervalMinutes,
    roundingDirection: content.roundingDirection,
    gracePeriodMinutes: content.gracePeriodMinutes,
    latenessToleranceMinutes: content.latenessToleranceMinutes,
    unpaidBreakMinutes: content.unpaidBreakMinutes ?? null,
    standardWorkWeekMinutes: content.standardWorkWeekMinutes,
    isStandardWorkWeekStatutoryFloor: content.isStandardWorkWeekStatutoryFloor,
    dailyOvertimeThresholdMinutes: content.dailyOvertimeThresholdMinutes ?? null,
    calculationAlgorithmVersion: content.calculationAlgorithmVersion,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Pure effective-date helpers. No I/O.                                       */
/* -------------------------------------------------------------------------- */

/** Is this policy in force at `asOf`? Half-open window: [effectiveFrom, effectiveUntil). */
export function isEffectiveAsOf(policy: Pick<AttendancePolicyRecord, "effectiveFrom" | "effectiveUntil">, asOf: Date): boolean {
  const at = asOf.getTime();
  if (new Date(policy.effectiveFrom).getTime() > at) return false;
  if (policy.effectiveUntil && new Date(policy.effectiveUntil).getTime() <= at) return false;
  return true;
}

/** Do two half-open windows overlap? Adjacent windows (a.until === b.from) do NOT overlap — the same discipline as ScheduleAssignment/Assignment. */
export function windowsOverlap(
  a: Pick<AttendancePolicyRecord, "effectiveFrom" | "effectiveUntil">,
  b: Pick<AttendancePolicyRecord, "effectiveFrom" | "effectiveUntil">,
): boolean {
  const aFrom = new Date(a.effectiveFrom).getTime();
  const aUntil = a.effectiveUntil ? new Date(a.effectiveUntil).getTime() : Infinity;
  const bFrom = new Date(b.effectiveFrom).getTime();
  const bUntil = b.effectiveUntil ? new Date(b.effectiveUntil).getTime() : Infinity;
  return aFrom < bUntil && bFrom < aUntil;
}
