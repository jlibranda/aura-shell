import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  CancelFutureScheduleAssignmentInput,
  CreateScheduleAssignmentInput,
  EndScheduleAssignmentInput,
  ScheduleAssignmentReadRepository,
  ScheduleAssignmentWriteRepository,
} from "@/platform/timekeeping/schedule-assignment-repository";
import { isEffectiveAsOf, type ScheduleAssignmentRecord } from "@/platform/timekeeping/schedule-assignment";

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class ScheduleAssignmentStore {
  readonly assignments: ScheduleAssignmentRecord[] = [];
}

export class InMemoryScheduleAssignmentWriteRepository implements ScheduleAssignmentWriteRepository {
  constructor(private readonly store: ScheduleAssignmentStore = new ScheduleAssignmentStore()) {}

  async findById(tenantId: string, id: string): Promise<ScheduleAssignmentRecord | undefined> {
    return this.store.assignments.find((a) => a.tenantId === tenantId && a.id === id);
  }

  async listForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord[]> {
    return this.store.assignments
      .filter((a) => a.tenantId === tenantId && a.personId === personId && !a.cancelledAt)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async findCurrentForPerson(tenantId: string, personId: string): Promise<ScheduleAssignmentRecord | undefined> {
    return this.store.assignments.find((a) => a.tenantId === tenantId && a.personId === personId && !a.effectiveUntil && !a.cancelledAt);
  }

  async create(input: CreateScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    const assignment: ScheduleAssignmentRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      personId: input.personId,
      workScheduleId: input.workScheduleId,
      workScheduleVersionId: input.workScheduleVersionId,
      effectiveFrom: input.effectiveFrom,
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    });
    this.store.assignments.push(assignment);
    return assignment;
  }

  async end(input: EndScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    const index = this.store.assignments.findIndex((a) => a.tenantId === input.tenantId && a.id === input.id);
    if (index === -1) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated: ScheduleAssignmentRecord = Object.freeze({ ...this.store.assignments[index], effectiveUntil: input.effectiveUntil });
    this.store.assignments[index] = updated;
    return updated;
  }

  async cancelFuture(input: CancelFutureScheduleAssignmentInput): Promise<ScheduleAssignmentRecord> {
    const index = this.store.assignments.findIndex((a) => a.tenantId === input.tenantId && a.id === input.id);
    if (index === -1) throw new Error(`schedule assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated: ScheduleAssignmentRecord = Object.freeze({
      ...this.store.assignments[index],
      cancelledAt: new Date().toISOString(),
      cancelledBy: input.cancelledBy,
      ...(input.cancellationReason ? { cancellationReason: input.cancellationReason } : {}),
    });
    this.store.assignments[index] = updated;
    return updated;
  }
}

export class InMemoryScheduleAssignmentReadRepository implements ScheduleAssignmentReadRepository {
  constructor(private readonly store: ScheduleAssignmentStore) {}

  async findById(context: TenantContext, id: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.assignments.find((a) => a.tenantId === context.tenantId && a.id === id);
  }

  async findAssignmentAtDate(context: TenantContext, personId: string, at: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    const asOf = new Date(at);
    return this.store.assignments.find((a) => a.tenantId === context.tenantId && a.personId === personId && isEffectiveAsOf(a, asOf));
  }

  async findCurrentAssignment(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.assignments.find((a) => a.tenantId === context.tenantId && a.personId === personId && !a.effectiveUntil && !a.cancelledAt);
  }

  async listAssignmentsForPerson(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.personId === personId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async listFutureAssignments(context: TenantContext, personId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    const now = Date.now();
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.personId === personId && !a.cancelledAt && new Date(a.effectiveFrom).getTime() > now)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async listAssignmentsUsingVersion(context: TenantContext, workScheduleVersionId: string): Promise<ScheduleAssignmentRecord[]> {
    requireTimekeepingView(context);
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.workScheduleVersionId === workScheduleVersionId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
}
