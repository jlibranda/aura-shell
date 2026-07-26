import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  AttendanceEventCreateOutcome,
  AttendanceEventDateRangeQuery,
  AttendanceEventReadRepository,
  AttendanceEventWriteRepository,
  CreateAttendanceEventInput,
} from "@/platform/timekeeping/attendance-event-repository";
import { isSameAttendanceFact, type AttendanceEventRecord } from "@/platform/timekeeping/attendance-event";

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via the write repository and read via the read repository. */
export class AttendanceEventStore {
  readonly attendanceEvents: AttendanceEventRecord[] = [];
}

function sortByOccurrence(events: AttendanceEventRecord[]): AttendanceEventRecord[] {
  return [...events].sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc) || a.id.localeCompare(b.id));
}

export class InMemoryAttendanceEventWriteRepository implements AttendanceEventWriteRepository {
  constructor(private readonly store: AttendanceEventStore = new AttendanceEventStore()) {}

  async create(input: CreateAttendanceEventInput): Promise<AttendanceEventCreateOutcome> {
    const existing = this.store.attendanceEvents.find((e) => e.tenantId === input.tenantId && e.idempotencyKey === input.idempotencyKey);
    if (existing) {
      const same = isSameAttendanceFact(
        { personId: existing.personId, occurredAtUtc: existing.occurredAtUtc, receivedAtUtc: existing.receivedAtUtc, source: existing.source, sourceRef: existing.sourceRef, eventType: existing.eventType, idempotencyKey: existing.idempotencyKey },
        { personId: input.personId, occurredAtUtc: input.occurredAtUtc, receivedAtUtc: input.receivedAtUtc, source: input.source, sourceRef: input.sourceRef, eventType: input.eventType, idempotencyKey: input.idempotencyKey },
      );
      return same ? { kind: "replayed" as const, event: existing } : { kind: "conflict" as const, existing };
    }

    const now = new Date().toISOString();
    const event: AttendanceEventRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      personId: input.personId,
      occurredAtUtc: input.occurredAtUtc,
      receivedAtUtc: input.receivedAtUtc,
      source: input.source,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
    });
    this.store.attendanceEvents.push(event);
    return { kind: "created" as const, event };
  }

  async findById(tenantId: string, id: string): Promise<AttendanceEventRecord | undefined> {
    return this.store.attendanceEvents.find((e) => e.tenantId === tenantId && e.id === id);
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<AttendanceEventRecord | undefined> {
    return this.store.attendanceEvents.find((e) => e.tenantId === tenantId && e.idempotencyKey === idempotencyKey);
  }

  async listForPersonAndDateRange(query: AttendanceEventDateRangeQuery): Promise<AttendanceEventRecord[]> {
    return sortByOccurrence(
      this.store.attendanceEvents.filter(
        (e) => e.tenantId === query.tenantId && e.personId === query.personId && e.occurredAtUtc >= query.fromUtc && e.occurredAtUtc < query.toUtc,
      ),
    );
  }
}

export class InMemoryAttendanceEventReadRepository implements AttendanceEventReadRepository {
  constructor(private readonly store: AttendanceEventStore) {}

  async getById(context: TenantContext, id: string): Promise<AttendanceEventRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.attendanceEvents.find((e) => e.tenantId === context.tenantId && e.id === id);
  }

  async listForPersonAndDateRange(context: TenantContext, personId: string, fromUtc: string, toUtc: string): Promise<AttendanceEventRecord[]> {
    requireTimekeepingView(context);
    return sortByOccurrence(
      this.store.attendanceEvents.filter(
        (e) => e.tenantId === context.tenantId && e.personId === personId && e.occurredAtUtc >= fromUtc && e.occurredAtUtc < toUtc,
      ),
    );
  }
}
