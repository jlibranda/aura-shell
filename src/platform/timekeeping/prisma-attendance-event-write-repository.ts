import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  AttendanceEventCreateOutcome,
  AttendanceEventDateRangeQuery,
  AttendanceEventWriteRepository,
  CreateAttendanceEventInput,
} from "@/platform/timekeeping/attendance-event-repository";
import { isSameAttendanceFact, type AttendanceEventRecord, type AttendanceEventSource, type AttendanceEventType } from "@/platform/timekeeping/attendance-event";

export type PrismaAttendanceEventWriteClient = Pick<Prisma.TransactionClient, "attendanceEvent" | "$queryRaw">;

type AttendanceEventRow = {
  id: string; tenantId: string; personId: string; occurredAtUtc: Date; receivedAtUtc: Date;
  source: string; sourceRef: string | null; eventType: string | null; idempotencyKey: string; createdAt: Date;
};

function toRecord(value: AttendanceEventRow): AttendanceEventRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    personId: value.personId,
    occurredAtUtc: value.occurredAtUtc.toISOString(),
    receivedAtUtc: value.receivedAtUtc.toISOString(),
    source: value.source as AttendanceEventSource,
    ...(value.sourceRef ? { sourceRef: value.sourceRef } : {}),
    ...(value.eventType ? { eventType: value.eventType as AttendanceEventType } : {}),
    idempotencyKey: value.idempotencyKey,
    createdAt: value.createdAt.toISOString(),
  });
}

/**
 * Write-side adapter, used only inside an AttendanceEvent write transaction.
 * Tenant scoping is on every query's where clause. There is no update and no
 * delete by design — AttendanceEvent is create-only (ADR-014 §4.3, §14); the
 * database's own immutability trigger (see migration) is the backstop against
 * accidental SQL mutation, the same pattern already used for audit_records
 * and configuration_versions.
 *
 * create() is the atomic "create or detect idempotent replay/conflict" path:
 * the UNIQUE (tenant_id, idempotency_key) database constraint is the source
 * of truth for concurrency safety, not an optimistic pre-check alone.
 *
 * This uses a single `INSERT ... ON CONFLICT DO NOTHING RETURNING` statement
 * rather than "try create(), catch the P2002 error, then look up the
 * existing row" — a failed INSERT inside a Postgres transaction aborts the
 * *entire* transaction (error 25P02 on every subsequent statement, including
 * the lookup meant to run in the same catch block), which made the original
 * try/catch version fail whenever create() ran inside the real
 * PrismaAttendanceEventUnitOfWork's interactive `$transaction` — its only
 * production call path. `ON CONFLICT DO NOTHING` never raises an error, so
 * the transaction stays healthy and the fallback lookup below is safe: two
 * concurrent submissions with the same key will have exactly one INSERT
 * return a row; the loser gets zero rows back and looks up whatever the
 * winner just committed, so the outcome is deterministic regardless of
 * ordering.
 */
export class PrismaAttendanceEventWriteRepository implements AttendanceEventWriteRepository {
  constructor(private readonly prisma: PrismaAttendanceEventWriteClient) {}

  async create(input: CreateAttendanceEventInput): Promise<AttendanceEventCreateOutcome> {
    const id = randomUUID();
    const inserted = await this.prisma.$queryRaw<AttendanceEventRow[]>`
      INSERT INTO attendance_events (attendance_event_id, tenant_id, person_id, occurred_at_utc, received_at_utc, source, source_ref, event_type, idempotency_key)
      VALUES (${id}, ${input.tenantId}, ${input.personId}, ${new Date(input.occurredAtUtc)}, ${new Date(input.receivedAtUtc)}, ${input.source}, ${input.sourceRef ?? null}, ${input.eventType ?? null}, ${input.idempotencyKey})
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING
        attendance_event_id AS "id", tenant_id AS "tenantId", person_id AS "personId",
        occurred_at_utc AS "occurredAtUtc", received_at_utc AS "receivedAtUtc",
        source, source_ref AS "sourceRef", event_type AS "eventType",
        idempotency_key AS "idempotencyKey", created_at AS "createdAt"
    `;
    if (inserted.length === 1) {
      return { kind: "created" as const, event: toRecord(inserted[0]) };
    }

    const existing = await this.prisma.attendanceEvent.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (!existing) throw new Error("AttendanceEvent insert conflicted on (tenant_id, idempotency_key) but no existing row was found.");

    const existingRecord = toRecord(existing);
    const same = isSameAttendanceFact(
      { personId: existingRecord.personId, occurredAtUtc: existingRecord.occurredAtUtc, receivedAtUtc: existingRecord.receivedAtUtc, source: existingRecord.source, sourceRef: existingRecord.sourceRef, eventType: existingRecord.eventType, idempotencyKey: existingRecord.idempotencyKey },
      { personId: input.personId, occurredAtUtc: input.occurredAtUtc, receivedAtUtc: input.receivedAtUtc, source: input.source, sourceRef: input.sourceRef, eventType: input.eventType, idempotencyKey: input.idempotencyKey },
    );
    return same ? { kind: "replayed" as const, event: existingRecord } : { kind: "conflict" as const, existing: existingRecord };
  }

  async findById(tenantId: string, id: string): Promise<AttendanceEventRecord | undefined> {
    const event = await this.prisma.attendanceEvent.findFirst({ where: { tenantId, id } });
    return event ? toRecord(event) : undefined;
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<AttendanceEventRecord | undefined> {
    const event = await this.prisma.attendanceEvent.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } } });
    return event ? toRecord(event) : undefined;
  }

  async listForPersonAndDateRange(query: AttendanceEventDateRangeQuery): Promise<AttendanceEventRecord[]> {
    const events = await this.prisma.attendanceEvent.findMany({
      where: { tenantId: query.tenantId, personId: query.personId, occurredAtUtc: { gte: new Date(query.fromUtc), lt: new Date(query.toUtc) } },
      orderBy: [{ occurredAtUtc: "asc" }, { id: "asc" }],
    });
    return events.map(toRecord);
  }
}
