import { Prisma } from "@prisma/client";
import type {
  AttendanceEventCreateOutcome,
  AttendanceEventDateRangeQuery,
  AttendanceEventWriteRepository,
  CreateAttendanceEventInput,
} from "@/platform/timekeeping/attendance-event-repository";
import { isSameAttendanceFact, type AttendanceEventRecord, type AttendanceEventSource, type AttendanceEventType } from "@/platform/timekeeping/attendance-event";

export type PrismaAttendanceEventWriteClient = Pick<Prisma.TransactionClient, "attendanceEvent">;

function toRecord(value: {
  id: string; tenantId: string; personId: string; occurredAtUtc: Date; receivedAtUtc: Date;
  source: string; sourceRef: string | null; eventType: string | null; idempotencyKey: string; createdAt: Date;
}): AttendanceEventRecord {
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
 * of truth for concurrency safety, not an optimistic pre-check alone — two
 * concurrent submissions with the same key will have exactly one INSERT
 * succeed; the loser falls into the catch branch and compares against
 * whatever the winner just committed, so the outcome is deterministic
 * regardless of ordering.
 */
export class PrismaAttendanceEventWriteRepository implements AttendanceEventWriteRepository {
  constructor(private readonly prisma: PrismaAttendanceEventWriteClient) {}

  async create(input: CreateAttendanceEventInput): Promise<AttendanceEventCreateOutcome> {
    try {
      const created = await this.prisma.attendanceEvent.create({
        data: {
          tenantId: input.tenantId,
          personId: input.personId,
          occurredAtUtc: new Date(input.occurredAtUtc),
          receivedAtUtc: new Date(input.receivedAtUtc),
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          eventType: input.eventType ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { kind: "created" as const, event: toRecord(created) };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;

      const existing = await this.prisma.attendanceEvent.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      });
      if (!existing) throw error;

      const existingRecord = toRecord(existing);
      const same = isSameAttendanceFact(
        { personId: existingRecord.personId, occurredAtUtc: existingRecord.occurredAtUtc, receivedAtUtc: existingRecord.receivedAtUtc, source: existingRecord.source, sourceRef: existingRecord.sourceRef, eventType: existingRecord.eventType, idempotencyKey: existingRecord.idempotencyKey },
        { personId: input.personId, occurredAtUtc: input.occurredAtUtc, receivedAtUtc: input.receivedAtUtc, source: input.source, sourceRef: input.sourceRef, eventType: input.eventType, idempotencyKey: input.idempotencyKey },
      );
      return same ? { kind: "replayed" as const, event: existingRecord } : { kind: "conflict" as const, existing: existingRecord };
    }
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
