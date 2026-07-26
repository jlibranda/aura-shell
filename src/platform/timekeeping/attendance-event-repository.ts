import type { TenantContext } from "@/platform/context";
import type { AttendanceEventRecord, AttendanceEventSource, AttendanceEventType } from "@/platform/timekeeping/attendance-event";

export interface CreateAttendanceEventInput {
  tenantId: string;
  personId: string;
  occurredAtUtc: string;
  receivedAtUtc: string;
  source: AttendanceEventSource;
  sourceRef?: string;
  eventType?: AttendanceEventType;
  idempotencyKey: string;
}

/**
 * Outcome of an attempted create. "created" is the normal case. "replayed"
 * is a same-key/same-fact retry — the caller gets the original record back,
 * deterministically, with no second event, no second audit entry, and no
 * second row. "conflict" is a same-key/different-fact submission — rejected,
 * the existing record is returned for the caller to report but is never
 * mutated (ADR-014 §4.3's idempotency rule).
 */
export type AttendanceEventCreateOutcome =
  | Readonly<{ kind: "created"; event: AttendanceEventRecord }>
  | Readonly<{ kind: "replayed"; event: AttendanceEventRecord }>
  | Readonly<{ kind: "conflict"; existing: AttendanceEventRecord }>;

export interface AttendanceEventDateRangeQuery {
  tenantId: string;
  personId: string;
  /** Inclusive UTC instant lower bound, compared against occurredAtUtc. */
  fromUtc: string;
  /** Exclusive UTC instant upper bound, compared against occurredAtUtc. */
  toUtc: string;
}

/**
 * Server-only write port for attendance events, used only inside a
 * tenant-scoped write transaction. There is deliberately no update and no
 * delete method — AttendanceEvent is create-only (ADR-014 §4.3, §14).
 */
export interface AttendanceEventWriteRepository {
  create(input: CreateAttendanceEventInput): Promise<AttendanceEventCreateOutcome>;
  findById(tenantId: string, id: string): Promise<AttendanceEventRecord | undefined>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<AttendanceEventRecord | undefined>;
  /** Ordered by occurredAtUtc ascending — never by insertion order (ADR-014's own explicit requirement). */
  listForPersonAndDateRange(query: AttendanceEventDateRangeQuery): Promise<AttendanceEventRecord[]>;
}

/** Transaction-scoped repositories exposed to future write callers via UnitOfWork.execute(). */
export type AttendanceEventTransactionRepositories = Readonly<{ attendanceEvents: AttendanceEventWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires timekeeping.view.
 */
export interface AttendanceEventReadRepository {
  getById(context: TenantContext, id: string): Promise<AttendanceEventRecord | undefined>;
  /** Ordered by occurredAtUtc ascending — never by insertion order. */
  listForPersonAndDateRange(context: TenantContext, personId: string, fromUtc: string, toUtc: string): Promise<AttendanceEventRecord[]>;
}
