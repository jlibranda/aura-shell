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
 * "lineage" id (`attendancePolicyId`, copied forward on every replacement)
 * and a per-row "version" id (`attendancePolicyVersionId`, the actual
 * primary key) — the same discipline ScheduleAssignment/Assignment use for
 * effective dating, extended with the lineage id the approved
 * policyId/policyVersionId contract requires.
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

export const ROUNDING_DIRECTIONS = ["NEAREST", "UP", "DOWN"] as const;
export type RoundingDirection = (typeof ROUNDING_DIRECTIONS)[number];

export interface RoundingRule {
  incrementMinutes: number;
  direction: RoundingDirection;
}

export interface GracePeriodRule {
  lateArrivalGraceMinutes: number;
  earlyDepartureGraceMinutes: number;
}

export interface BreakRule {
  unpaidBreakMinutes: number;
  paidBreakMinutes: number;
}

/** Work-week length and overtime thresholds are one statutory axis (ADR-014 §6.1) — grouped here rather than split, since they describe the same legal fact. */
export interface OvertimeRule {
  dailyThresholdMinutes: number;
  weeklyThresholdMinutes: number;
}

export interface ToleranceRule {
  missedPunchToleranceMinutes: number;
}

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
 * identity, an effective period, the resolved policy values, and a
 * deterministic fingerprint so two computations against "the same" policy
 * are provably identical (ADR-014 §4.7's historical-immutability invariant).
 * This is a pure value object: it carries no createdAt/createdBy/changeReason
 * provenance — those live only on AttendancePolicyRecord.
 */
export interface ResolvedAttendancePolicy {
  attendancePolicyId: string;
  attendancePolicyVersionId: string;
  scope: PolicyScope;
  scopeId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  rounding: RoundingRule;
  gracePeriod: GracePeriodRule;
  breakRules: BreakRule;
  overtime: OvertimeRule;
  /** Statutory-floor metadata (ADR-014 §6.1): whether this record's overtime/work-week values are themselves a Legal-Entity-derived statutory floor, vs. pure operational convenience. Always false for a Tenant-scope record in this slice — there is nothing above Tenant to derive a floor from. */
  overtimeThresholdsAreStatutoryFloor: boolean;
  tolerance: ToleranceRule;
  calculationAlgorithmVersion: number;
  fingerprint: string;
}

/** The persisted row — ResolvedAttendancePolicy plus provenance/audit fields never exposed to the resolver contract. */
export interface AttendancePolicyRecord extends ResolvedAttendancePolicy {
  tenantId: string;
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
  rounding: { incrementMinutes: number; direction: string };
  gracePeriod: { lateArrivalGraceMinutes: number; earlyDepartureGraceMinutes: number };
  breakRules: { unpaidBreakMinutes: number; paidBreakMinutes: number };
  overtime: { dailyThresholdMinutes: number; weeklyThresholdMinutes: number };
  overtimeThresholdsAreStatutoryFloor: boolean;
  tolerance: { missedPunchToleranceMinutes: number };
  changeReason?: string;
}

export interface ValidatedAttendancePolicyContent {
  effectiveFrom: string;
  rounding: RoundingRule;
  gracePeriod: GracePeriodRule;
  breakRules: BreakRule;
  overtime: OvertimeRule;
  overtimeThresholdsAreStatutoryFloor: boolean;
  tolerance: ToleranceRule;
  changeReason?: string;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateAttendancePolicyContentDraft(input: AttendancePolicyContentDraft): ValidationResult<ValidatedAttendancePolicyContent> {
  const issues: ValidationIssue[] = [];

  if (!validInstant(input.effectiveFrom)) issues.push(issue("effectiveFrom", "INVALID_DATE", "A valid effective-from date is required."));

  const direction = input.rounding?.direction?.trim().toUpperCase() ?? "";
  if (!direction) issues.push(issue("rounding.direction", "REQUIRED", "A rounding direction is required."));
  else if (!(ROUNDING_DIRECTIONS as readonly string[]).includes(direction)) issues.push(issue("rounding.direction", "INVALID_FORMAT", `"${input.rounding?.direction}" is not a recognized rounding direction.`));
  if (!isNonNegativeInteger(input.rounding?.incrementMinutes)) issues.push(issue("rounding.incrementMinutes", "INVALID_VALUE", "Rounding increment must be a non-negative whole number of minutes."));
  else if (input.rounding.incrementMinutes > 0 && 60 % input.rounding.incrementMinutes !== 0) issues.push(issue("rounding.incrementMinutes", "INVALID_VALUE", "Rounding increment must evenly divide 60 minutes."));

  if (!isNonNegativeInteger(input.gracePeriod?.lateArrivalGraceMinutes)) issues.push(issue("gracePeriod.lateArrivalGraceMinutes", "INVALID_VALUE", "Late-arrival grace must be a non-negative whole number of minutes."));
  if (!isNonNegativeInteger(input.gracePeriod?.earlyDepartureGraceMinutes)) issues.push(issue("gracePeriod.earlyDepartureGraceMinutes", "INVALID_VALUE", "Early-departure grace must be a non-negative whole number of minutes."));

  if (!isNonNegativeInteger(input.breakRules?.unpaidBreakMinutes)) issues.push(issue("breakRules.unpaidBreakMinutes", "INVALID_VALUE", "Unpaid break minutes must be a non-negative whole number."));
  if (!isNonNegativeInteger(input.breakRules?.paidBreakMinutes)) issues.push(issue("breakRules.paidBreakMinutes", "INVALID_VALUE", "Paid break minutes must be a non-negative whole number."));

  if (!isNonNegativeInteger(input.overtime?.dailyThresholdMinutes)) issues.push(issue("overtime.dailyThresholdMinutes", "INVALID_VALUE", "Daily overtime threshold must be a non-negative whole number of minutes."));
  if (!isNonNegativeInteger(input.overtime?.weeklyThresholdMinutes)) issues.push(issue("overtime.weeklyThresholdMinutes", "INVALID_VALUE", "Weekly overtime threshold must be a non-negative whole number of minutes."));
  if (typeof input.overtimeThresholdsAreStatutoryFloor !== "boolean") issues.push(issue("overtimeThresholdsAreStatutoryFloor", "REQUIRED", "overtimeThresholdsAreStatutoryFloor must be explicitly true or false."));

  if (!isNonNegativeInteger(input.tolerance?.missedPunchToleranceMinutes)) issues.push(issue("tolerance.missedPunchToleranceMinutes", "INVALID_VALUE", "Missed-punch tolerance must be a non-negative whole number of minutes."));

  const changeReason = normalizeReason(input.changeReason);
  if (changeReason && changeReason.length > REASON_MAX_LENGTH) issues.push(issue("changeReason", "TOO_LONG", `Change reason must be at most ${REASON_MAX_LENGTH} characters.`));

  if (issues.length > 0) return invalid(issues);
  return valid({
    effectiveFrom: input.effectiveFrom,
    rounding: { incrementMinutes: input.rounding.incrementMinutes, direction: direction as RoundingDirection },
    gracePeriod: { lateArrivalGraceMinutes: input.gracePeriod.lateArrivalGraceMinutes, earlyDepartureGraceMinutes: input.gracePeriod.earlyDepartureGraceMinutes },
    breakRules: { unpaidBreakMinutes: input.breakRules.unpaidBreakMinutes, paidBreakMinutes: input.breakRules.paidBreakMinutes },
    overtime: { dailyThresholdMinutes: input.overtime.dailyThresholdMinutes, weeklyThresholdMinutes: input.overtime.weeklyThresholdMinutes },
    overtimeThresholdsAreStatutoryFloor: input.overtimeThresholdsAreStatutoryFloor,
    tolerance: { missedPunchToleranceMinutes: input.tolerance.missedPunchToleranceMinutes },
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

/**
 * Deterministic content hash (ADR-014 §4.7's fingerprint requirement) —
 * fixed key order, excludes identity/version/effective-period/provenance
 * fields, so two policy rows with identical resolved values always hash
 * identically regardless of when or how they were created. Mirrors
 * computeWorkScheduleCanonicalHash's precedent (Slice 3 Decision 10).
 */
export function computeAttendancePolicyFingerprint(content: Pick<ResolvedAttendancePolicy, "rounding" | "gracePeriod" | "breakRules" | "overtime" | "overtimeThresholdsAreStatutoryFloor" | "tolerance" | "calculationAlgorithmVersion">): string {
  const canonical = {
    rounding: { incrementMinutes: content.rounding.incrementMinutes, direction: content.rounding.direction },
    gracePeriod: { lateArrivalGraceMinutes: content.gracePeriod.lateArrivalGraceMinutes, earlyDepartureGraceMinutes: content.gracePeriod.earlyDepartureGraceMinutes },
    breakRules: { unpaidBreakMinutes: content.breakRules.unpaidBreakMinutes, paidBreakMinutes: content.breakRules.paidBreakMinutes },
    overtime: { dailyThresholdMinutes: content.overtime.dailyThresholdMinutes, weeklyThresholdMinutes: content.overtime.weeklyThresholdMinutes },
    overtimeThresholdsAreStatutoryFloor: content.overtimeThresholdsAreStatutoryFloor,
    tolerance: { missedPunchToleranceMinutes: content.tolerance.missedPunchToleranceMinutes },
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
