import { createHash } from "node:crypto";
import { invalid, issue, valid, type ValidationIssue, type ValidationResult } from "@/platform/validation";

/**
 * WorkSchedule — a reusable, tenant-scoped schedule template (ADR-014
 * §4.1; Slice 3). Split into a stable definition (this file's
 * WorkScheduleRecord) and versioned content (WorkScheduleVersionRecord):
 * renaming or re-describing a schedule never affects anything already
 * computed, but every field that changes what the schedule *means* — its
 * type, timezone handling, and weekly pattern — lives on the version and
 * is never mutated once a version leaves DRAFT (ADR-014 §4.1's core
 * invariant, the same "append, never rewrite" discipline as `Assignment`
 * and `AttendanceEvent`).
 *
 * WorkSchedule never contains employeeId/personId (that binding is
 * Slice 4's ScheduleAssignment), never references AttendanceEvent/
 * AttendanceDay, and never contains payroll, overtime, lateness, or policy
 * fields (ADR-014 §4.1 vs. §4.7 — this is shape only, never interpretation).
 */

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,49}$/;
const NAME_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;

export interface WorkScheduleRecord {
  id: string;
  tenantId: string;
  /** Permanent business identity — never changed, never reused after this schedule exists. */
  code: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface CreateWorkScheduleDraft {
  code: string;
  name: string;
  description?: string;
}

export interface ValidatedCreateWorkScheduleDraft {
  code: string;
  name: string;
  description?: string;
}

export function validateCreateWorkScheduleDraft(input: CreateWorkScheduleDraft): ValidationResult<ValidatedCreateWorkScheduleDraft> {
  const issues: ValidationIssue[] = [];

  const normalizedCode = input.code?.trim().toUpperCase() ?? "";
  if (!normalizedCode) issues.push(issue("code", "REQUIRED", "A short, stable code is required."));
  else if (!CODE_PATTERN.test(normalizedCode)) issues.push(issue("code", "INVALID_FORMAT", "Code must be 1-50 characters: letters, numbers, dot, dash, or underscore, starting with a letter or number."));

  const normalizedName = input.name?.trim() ?? "";
  if (!normalizedName) issues.push(issue("name", "REQUIRED", "A name is required."));
  else if (normalizedName.length > NAME_MAX_LENGTH) issues.push(issue("name", "TOO_LONG", `Name must be at most ${NAME_MAX_LENGTH} characters.`));

  let normalizedDescription: string | undefined;
  if (input.description !== undefined && input.description !== null) {
    normalizedDescription = input.description.trim();
    if (normalizedDescription.length === 0) normalizedDescription = undefined;
    else if (normalizedDescription.length > DESCRIPTION_MAX_LENGTH) issues.push(issue("description", "TOO_LONG", `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`));
  }

  if (issues.length > 0) return invalid(issues);
  return valid({
    code: normalizedCode,
    name: normalizedName,
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
  });
}

export interface UpdateWorkScheduleDetailsDraft {
  name: string;
  description?: string;
}

export interface ValidatedUpdateWorkScheduleDetailsDraft {
  name: string;
  description?: string;
}

export function validateUpdateWorkScheduleDetailsDraft(input: UpdateWorkScheduleDetailsDraft): ValidationResult<ValidatedUpdateWorkScheduleDetailsDraft> {
  const issues: ValidationIssue[] = [];

  const normalizedName = input.name?.trim() ?? "";
  if (!normalizedName) issues.push(issue("name", "REQUIRED", "A name is required."));
  else if (normalizedName.length > NAME_MAX_LENGTH) issues.push(issue("name", "TOO_LONG", `Name must be at most ${NAME_MAX_LENGTH} characters.`));

  let normalizedDescription: string | undefined;
  if (input.description !== undefined && input.description !== null) {
    normalizedDescription = input.description.trim();
    if (normalizedDescription.length === 0) normalizedDescription = undefined;
    else if (normalizedDescription.length > DESCRIPTION_MAX_LENGTH) issues.push(issue("description", "TOO_LONG", `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`));
  }

  if (issues.length > 0) return invalid(issues);
  return valid({
    name: normalizedName,
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* WorkScheduleVersion — computation-relevant content only.                   */
/* -------------------------------------------------------------------------- */

export const SCHEDULE_TYPES = ["FIXED_WEEKLY"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const TIMEZONE_RESOLUTION_MODES = ["FIXED", "LOCATION"] as const;
export type TimezoneResolutionMode = (typeof TIMEZONE_RESOLUTION_MODES)[number];

export const WORK_SCHEDULE_VERSION_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type WorkScheduleVersionStatus = (typeof WORK_SCHEDULE_VERSION_STATUSES)[number];

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface WorkPeriodBreak {
  start: string;
  end: string;
}

export interface WorkPeriod {
  start: string;
  end: string;
  crossesMidnight: boolean;
  breaks: readonly WorkPeriodBreak[];
}

/** Rest days are represented as a weekday with an empty periods array — never a separate restDays list that could drift out of sync. */
export type WeeklyPattern = Readonly<Record<Weekday, readonly WorkPeriod[]>>;

export interface WorkScheduleVersionRecord {
  id: string;
  tenantId: string;
  workScheduleId: string;
  versionNumber: number;
  status: WorkScheduleVersionStatus;
  scheduleType: ScheduleType;
  timezoneResolutionMode: TimezoneResolutionMode;
  /** Required iff timezoneResolutionMode === "FIXED"; absent iff "LOCATION". */
  timezone?: string;
  weeklyPattern: WeeklyPattern;
  /** Duplicate-content detection only — never business identity (Slice 3 Decision 10). */
  canonicalHash: string;
  changeReason?: string;
  createdAt: string;
  createdBy: string;
  activatedAt?: string;
  /** When this version transitioned ACTIVE -> RETIRED (activation superseded it with a new version). */
  retiredAt?: string;
}

export interface WorkScheduleVersionContentDraft {
  scheduleType: string;
  timezoneResolutionMode: string;
  timezone?: string;
  weeklyPattern: unknown;
  changeReason?: string;
}

export interface ValidatedWorkScheduleVersionContent {
  scheduleType: ScheduleType;
  timezoneResolutionMode: TimezoneResolutionMode;
  timezone?: string;
  weeklyPattern: WeeklyPattern;
  changeReason?: string;
}

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHANGE_REASON_MAX_LENGTH = 500;
const MAX_BREAKS_PER_PERIOD = 1;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** A period's occupied minute-ranges within one 1440-minute day, split at midnight when it wraps. */
function periodIntervals(period: Pick<WorkPeriod, "start" | "end" | "crossesMidnight">): [number, number][] {
  const startMin = toMinutes(period.start);
  const endMin = toMinutes(period.end);
  return period.crossesMidnight ? [[startMin, 1440], [0, endMin]] : [[startMin, endMin]];
}

function intervalsOverlap(a: [number, number][], b: [number, number][]): boolean {
  return a.some(([a1, a2]) => b.some(([b1, b2]) => a1 < b2 && b1 < a2));
}

function intervalContains(outer: [number, number][], innerStart: number, innerEnd: number): boolean {
  return outer.some(([o1, o2]) => innerStart >= o1 && innerEnd <= o2);
}

function validateWorkPeriod(period: unknown, path: string[]): { issues: ValidationIssue[]; data?: WorkPeriod } {
  const issues: ValidationIssue[] = [];
  const candidate = (period ?? {}) as Partial<WorkPeriod> & { breaks?: unknown };

  const start = typeof candidate.start === "string" ? candidate.start : "";
  const end = typeof candidate.end === "string" ? candidate.end : "";
  if (!HH_MM_PATTERN.test(start)) issues.push(issue([...path, "start"], "INVALID_FORMAT", `"${candidate.start}" is not a valid HH:mm time.`));
  if (!HH_MM_PATTERN.test(end)) issues.push(issue([...path, "end"], "INVALID_FORMAT", `"${candidate.end}" is not a valid HH:mm time.`));
  if (issues.length > 0) return { issues };

  if (start === end) {
    issues.push(issue([...path, "end"], "ZERO_OR_FULL_DAY_DURATION", "A work period's start and end cannot be equal — zero-duration and 24-hour periods are not allowed."));
    return { issues };
  }

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const expectedCrossesMidnight = endMin < startMin;
  if (typeof candidate.crossesMidnight !== "boolean") {
    issues.push(issue([...path, "crossesMidnight"], "REQUIRED", "crossesMidnight must be explicitly true or false."));
    return { issues };
  }
  if (candidate.crossesMidnight !== expectedCrossesMidnight) {
    issues.push(issue([...path, "crossesMidnight"], "INCONSISTENT", expectedCrossesMidnight
      ? "crossesMidnight must be true when end is earlier than start."
      : "crossesMidnight must be false when end is later than start."));
    return { issues };
  }

  const rawBreaks = Array.isArray(candidate.breaks) ? candidate.breaks : [];
  if (rawBreaks.length > MAX_BREAKS_PER_PERIOD) {
    issues.push(issue([...path, "breaks"], "TOO_MANY", `At most ${MAX_BREAKS_PER_PERIOD} break is allowed per work period in this slice.`));
    return { issues };
  }

  const periodIntervalSet = periodIntervals({ start, end, crossesMidnight: candidate.crossesMidnight });
  const breaks: WorkPeriodBreak[] = [];
  const breakIntervalSets: [number, number][][] = [];
  for (let i = 0; i < rawBreaks.length; i++) {
    const rawBreak = (rawBreaks[i] ?? {}) as Partial<WorkPeriodBreak>;
    const breakPath = [...path, "breaks", String(i)];
    const bStart = typeof rawBreak.start === "string" ? rawBreak.start : "";
    const bEnd = typeof rawBreak.end === "string" ? rawBreak.end : "";
    if (!HH_MM_PATTERN.test(bStart)) { issues.push(issue([...breakPath, "start"], "INVALID_FORMAT", `"${rawBreak.start}" is not a valid HH:mm time.`)); continue; }
    if (!HH_MM_PATTERN.test(bEnd)) { issues.push(issue([...breakPath, "end"], "INVALID_FORMAT", `"${rawBreak.end}" is not a valid HH:mm time.`)); continue; }
    const bStartMin = toMinutes(bStart);
    const bEndMin = toMinutes(bEnd);
    if (bStartMin >= bEndMin) { issues.push(issue([...breakPath, "end"], "INVALID_RANGE", "A break's end must be strictly after its start; a break cannot itself cross midnight.")); continue; }
    if (!intervalContains(periodIntervalSet, bStartMin, bEndMin)) { issues.push(issue(breakPath, "OUTSIDE_PERIOD", "A break must fall entirely within its work period.")); continue; }
    breaks.push({ start: bStart, end: bEnd });
    breakIntervalSets.push([[bStartMin, bEndMin]]);
  }
  if (issues.length > 0) return { issues };

  for (let i = 0; i < breakIntervalSets.length; i++) {
    for (let j = i + 1; j < breakIntervalSets.length; j++) {
      if (intervalsOverlap(breakIntervalSets[i], breakIntervalSets[j])) {
        issues.push(issue([...path, "breaks"], "OVERLAPPING", "Breaks within the same work period must not overlap."));
        return { issues };
      }
    }
  }

  return { issues: [], data: { start, end, crossesMidnight: candidate.crossesMidnight, breaks } };
}

function validateWeeklyPattern(input: unknown): { issues: ValidationIssue[]; data?: WeeklyPattern } {
  const issues: ValidationIssue[] = [];
  const root = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}) as Record<string, unknown>;

  const unknownKeys = Object.keys(root).filter((key) => !(WEEKDAYS as readonly string[]).includes(key));
  for (const key of unknownKeys) issues.push(issue(["weeklyPattern", key], "UNKNOWN_WEEKDAY", `"${key}" is not a recognized weekday.`));

  const days: Record<string, WorkPeriod[]> = {};
  for (const day of WEEKDAYS) {
    const rawPeriods = Array.isArray(root[day]) ? (root[day] as unknown[]) : [];
    const dayPeriods: WorkPeriod[] = [];
    const dayIntervalSets: [number, number][][] = [];
    for (let i = 0; i < rawPeriods.length; i++) {
      const result = validateWorkPeriod(rawPeriods[i], ["weeklyPattern", day, String(i)]);
      if (result.issues.length > 0) { issues.push(...result.issues); continue; }
      dayPeriods.push(result.data!);
      dayIntervalSets.push(periodIntervals(result.data!));
    }
    for (let i = 0; i < dayIntervalSets.length; i++) {
      for (let j = i + 1; j < dayIntervalSets.length; j++) {
        if (intervalsOverlap(dayIntervalSets[i], dayIntervalSets[j])) {
          issues.push(issue(["weeklyPattern", day], "OVERLAPPING_PERIODS", `Work periods on ${day} must not overlap.`));
        }
      }
    }
    days[day] = dayPeriods;
  }

  if (issues.length > 0) return { issues };
  return { issues: [], data: Object.freeze(days) as WeeklyPattern };
}

export function validateWorkScheduleVersionContent(input: WorkScheduleVersionContentDraft): ValidationResult<ValidatedWorkScheduleVersionContent> {
  const issues: ValidationIssue[] = [];

  const scheduleType = input.scheduleType?.trim().toUpperCase() ?? "";
  if (!scheduleType) issues.push(issue("scheduleType", "REQUIRED", "A schedule type is required."));
  else if (!(SCHEDULE_TYPES as readonly string[]).includes(scheduleType)) issues.push(issue("scheduleType", "INVALID_FORMAT", `"${input.scheduleType}" is not a supported schedule type.`));

  const timezoneResolutionMode = input.timezoneResolutionMode?.trim().toUpperCase() ?? "";
  if (!timezoneResolutionMode) issues.push(issue("timezoneResolutionMode", "REQUIRED", "A timezone resolution mode is required."));
  else if (!(TIMEZONE_RESOLUTION_MODES as readonly string[]).includes(timezoneResolutionMode)) issues.push(issue("timezoneResolutionMode", "INVALID_FORMAT", `"${input.timezoneResolutionMode}" is not a recognized timezone resolution mode.`));

  let normalizedTimezone: string | undefined;
  if (timezoneResolutionMode === "FIXED") {
    normalizedTimezone = input.timezone?.trim() ?? "";
    if (!normalizedTimezone) issues.push(issue("timezone", "REQUIRED", "A fixed timezone-resolution mode requires an explicit IANA timezone."));
    else if (!isValidTimeZone(normalizedTimezone)) issues.push(issue("timezone", "UNSUPPORTED", `"${input.timezone}" is not a recognized IANA time zone.`));
  } else if (timezoneResolutionMode === "LOCATION") {
    if (input.timezone !== undefined && input.timezone !== null && input.timezone.trim() !== "") {
      issues.push(issue("timezone", "NOT_ALLOWED", "timezone must be absent when timezoneResolutionMode is LOCATION — resolution is deferred to ScheduleAssignment."));
    }
    normalizedTimezone = undefined;
  }

  const patternResult = validateWeeklyPattern(input.weeklyPattern);
  issues.push(...patternResult.issues);

  let normalizedChangeReason: string | undefined;
  if (input.changeReason !== undefined && input.changeReason !== null) {
    normalizedChangeReason = input.changeReason.trim();
    if (normalizedChangeReason.length === 0) normalizedChangeReason = undefined;
    else if (normalizedChangeReason.length > CHANGE_REASON_MAX_LENGTH) issues.push(issue("changeReason", "TOO_LONG", `Change reason must be at most ${CHANGE_REASON_MAX_LENGTH} characters.`));
  }

  if (issues.length > 0) return invalid(issues);
  return valid({
    scheduleType: scheduleType as ScheduleType,
    timezoneResolutionMode: timezoneResolutionMode as TimezoneResolutionMode,
    ...(normalizedTimezone ? { timezone: normalizedTimezone } : {}),
    weeklyPattern: patternResult.data!,
    ...(normalizedChangeReason ? { changeReason: normalizedChangeReason } : {}),
  });
}

/**
 * Deterministic content hash for duplicate-content detection only (Slice 3
 * Decision 10) — never business identity. Canonicalizes weekday order
 * (fixed WEEKDAYS order, not object insertion order), period order (sorted
 * by start), and break order (sorted by start) before hashing, so two
 * structurally-different-but-semantically-identical inputs always produce
 * the same hash. changeReason is deliberately excluded — it's metadata
 * about the change, not part of what the schedule computes to.
 */
export function computeWorkScheduleCanonicalHash(content: Pick<ValidatedWorkScheduleVersionContent, "scheduleType" | "timezoneResolutionMode" | "timezone" | "weeklyPattern">): string {
  const canonicalDays: Record<string, { start: string; end: string; crossesMidnight: boolean; breaks: { start: string; end: string }[] }[]> = {};
  for (const day of WEEKDAYS) {
    const periods = [...(content.weeklyPattern[day] ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    canonicalDays[day] = periods.map((period) => ({
      start: period.start,
      end: period.end,
      crossesMidnight: period.crossesMidnight,
      breaks: [...period.breaks].sort((a, b) => a.start.localeCompare(b.start)).map((b) => ({ start: b.start, end: b.end })),
    }));
  }
  const canonical = {
    scheduleType: content.scheduleType,
    timezoneResolutionMode: content.timezoneResolutionMode,
    timezone: content.timezone ?? null,
    weeklyPattern: canonicalDays,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
