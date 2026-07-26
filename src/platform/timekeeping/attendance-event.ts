import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

/**
 * AttendanceEvent — the immutable, atomic fact that a person's clock-in/out
 * channel registered a punch at a specific instant (ADR-014 §4.3). This is
 * the raw fact layer only: it records *that* something happened and *who
 * reported it*, never an interpretation of it. Pairing punches into a day,
 * deciding lateness/overtime, and everything payroll-adjacent belongs to
 * AttendanceDay (a later slice) — never here.
 *
 * Create-only. There is deliberately no update, delete, archive, or
 * correction operation anywhere in this file or in
 * AttendanceEventWriteRepository — a mistaken punch is addressed by a future
 * AttendanceAdjustment against the computed AttendanceDay, never by mutating
 * or removing the original event (ADR-014 §4.3, §4.5, §14).
 *
 * Self-contained historical fact: every field a reader needs to understand
 * who, when, via which channel, and under which idempotent identity is a
 * typed column on this record. No field here depends on an external
 * device/vendor/import system remaining reachable to be meaningful later.
 */

export const ATTENDANCE_EVENT_SOURCES = [
  "BIOMETRIC_DEVICE",
  "WEB_CLOCK",
  "MOBILE",
  "QR",
  "KIOSK",
  "API",
  "IMPORT",
  "SYSTEM",
] as const;
export type AttendanceEventSource = (typeof ATTENDANCE_EVENT_SOURCES)[number];

/**
 * What the source channel itself reported, if it reported anything —
 * evidentiary only. Never treated as a payable result, an authoritative
 * clock pairing, an overtime/lateness/schedule decision, or a payroll
 * conclusion; AttendanceDay remains solely responsible for interpreting
 * event chronology (ADR-014 §4.4, §9).
 */
export const ATTENDANCE_EVENT_TYPES = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END", "UNKNOWN"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

const SOURCE_REF_MAX_LENGTH = 200;
const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

/** Immutable read record of one attendance event. */
export interface AttendanceEventRecord {
  id: string;
  tenantId: string;
  personId: string;
  /** The device/channel-reported instant the punch occurred, UTC. */
  occurredAtUtc: string;
  /** When AURA received this event — distinct from occurredAtUtc (channel-reported) and createdAt (persistence time). */
  receivedAtUtc: string;
  source: AttendanceEventSource;
  /** Device id / import batch id / API caller — free-text, channel-specific identity. Never drives the source enum. */
  sourceRef?: string;
  eventType?: AttendanceEventType;
  idempotencyKey: string;
  /** Persistence timestamp assigned by the platform/database — not the same instant as receivedAtUtc. */
  createdAt: string;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

function isValidInstant(value: string | undefined): boolean {
  return Boolean(value && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value)));
}

function isAttendanceEventSource(value: string): value is AttendanceEventSource {
  return (ATTENDANCE_EVENT_SOURCES as readonly string[]).includes(value);
}

function isAttendanceEventType(value: string): value is AttendanceEventType {
  return (ATTENDANCE_EVENT_TYPES as readonly string[]).includes(value);
}

export interface CreateAttendanceEventDraft {
  personId: string;
  occurredAtUtc: string;
  receivedAtUtc: string;
  source: string;
  sourceRef?: string;
  eventType?: string;
  idempotencyKey: string;
}

export interface ValidatedCreateAttendanceEventDraft {
  personId: string;
  occurredAtUtc: string;
  receivedAtUtc: string;
  source: AttendanceEventSource;
  sourceRef?: string;
  eventType?: AttendanceEventType;
  idempotencyKey: string;
}

/**
 * Server-authoritative validation for a new attendance event's own fields.
 * receivedAtUtc is never compared against occurredAtUtc here — a device
 * reporting a punch after AURA would "expect" it (clock skew, offline sync,
 * delayed import) is a forensic/anomaly-detection concern (ADR-014 §15),
 * never a reason to reject a genuinely received fact.
 */
export function validateCreateAttendanceEventDraft(input: CreateAttendanceEventDraft): ValidationResult<ValidatedCreateAttendanceEventDraft> {
  const issues = [];

  if (!input.personId?.trim()) issues.push(issue("personId", "REQUIRED", "A person is required."));

  if (!isValidInstant(input.occurredAtUtc)) issues.push(issue("occurredAtUtc", "INVALID_INSTANT", "A valid UTC instant is required for when the event occurred."));
  if (!isValidInstant(input.receivedAtUtc)) issues.push(issue("receivedAtUtc", "INVALID_INSTANT", "A valid UTC instant is required for when AURA received the event."));

  const source = input.source?.trim().toUpperCase() ?? "";
  if (!source) issues.push(issue("source", "REQUIRED", "A source channel is required."));
  else if (!isAttendanceEventSource(source)) issues.push(issue("source", "INVALID_FORMAT", `"${input.source}" is not a recognized attendance event source.`));

  let normalizedSourceRef: string | undefined;
  if (input.sourceRef !== undefined && input.sourceRef !== null) {
    normalizedSourceRef = input.sourceRef.trim();
    if (normalizedSourceRef.length === 0) normalizedSourceRef = undefined;
    else if (normalizedSourceRef.length > SOURCE_REF_MAX_LENGTH) issues.push(issue("sourceRef", "TOO_LONG", `Source reference must be at most ${SOURCE_REF_MAX_LENGTH} characters.`));
  }

  let normalizedEventType: string | undefined;
  if (input.eventType !== undefined && input.eventType !== null) {
    normalizedEventType = input.eventType.trim().toUpperCase();
    if (normalizedEventType.length === 0) normalizedEventType = undefined;
    else if (!isAttendanceEventType(normalizedEventType)) issues.push(issue("eventType", "INVALID_FORMAT", `"${input.eventType}" is not a recognized attendance event type.`));
  }

  const idempotencyKey = input.idempotencyKey?.trim() ?? "";
  if (!idempotencyKey) issues.push(issue("idempotencyKey", "REQUIRED", "An idempotency key is required."));
  else if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) issues.push(issue("idempotencyKey", "TOO_LONG", `Idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`));

  if (issues.length > 0) return invalid(issues);

  return valid({
    personId: input.personId!.trim(),
    occurredAtUtc: input.occurredAtUtc,
    receivedAtUtc: input.receivedAtUtc,
    source: source as AttendanceEventSource,
    ...(normalizedSourceRef ? { sourceRef: normalizedSourceRef } : {}),
    ...(normalizedEventType ? { eventType: normalizedEventType as AttendanceEventType } : {}),
    idempotencyKey,
  });
}

/**
 * Two drafts represent the same persisted fact when every field excluding
 * generated identity (id) and persistence timestamps (createdAt) matches —
 * the exact comparison the idempotency "same key, same fact" rule uses
 * (ADR-014 §4.3). Absent optional values normalize to undefined on both
 * sides before comparison, so an omitted sourceRef/eventType on a retry
 * matches an omitted sourceRef/eventType on the original, consistently.
 */
export function isSameAttendanceFact(a: ValidatedCreateAttendanceEventDraft, b: ValidatedCreateAttendanceEventDraft): boolean {
  return (
    a.personId === b.personId &&
    a.occurredAtUtc === b.occurredAtUtc &&
    a.receivedAtUtc === b.receivedAtUtc &&
    a.source === b.source &&
    (a.sourceRef ?? undefined) === (b.sourceRef ?? undefined) &&
    (a.eventType ?? undefined) === (b.eventType ?? undefined) &&
    a.idempotencyKey === b.idempotencyKey
  );
}
