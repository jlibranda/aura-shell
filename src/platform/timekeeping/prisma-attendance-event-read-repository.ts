import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AttendanceEventReadRepository } from "@/platform/timekeeping/attendance-event-repository";
import type { AttendanceEventRecord, AttendanceEventSource, AttendanceEventType } from "@/platform/timekeeping/attendance-event";

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

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Read-only, tenant-scoped adapter. Every method requires timekeeping.view. */
export class PrismaAttendanceEventReadRepository implements AttendanceEventReadRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "attendanceEvent">) {}

  async getById(context: TenantContext, id: string): Promise<AttendanceEventRecord | undefined> {
    requireTimekeepingView(context);
    const event = await this.prisma.attendanceEvent.findFirst({ where: { tenantId: context.tenantId, id } });
    return event ? toRecord(event) : undefined;
  }

  async listForPersonAndDateRange(context: TenantContext, personId: string, fromUtc: string, toUtc: string): Promise<AttendanceEventRecord[]> {
    requireTimekeepingView(context);
    const events = await this.prisma.attendanceEvent.findMany({
      where: { tenantId: context.tenantId, personId, occurredAtUtc: { gte: new Date(fromUtc), lt: new Date(toUtc) } },
      orderBy: [{ occurredAtUtc: "asc" }, { id: "asc" }],
    });
    return events.map(toRecord);
  }
}
