import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  AssignPrimaryInput,
  AssignmentReadRepository,
  AssignmentWriteRepository,
  EndAssignmentInput,
} from "@/platform/organization/assignment-repository";
import type { AssignmentRecord } from "@/platform/organization/assignment";

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class AssignmentStore {
  readonly assignments: AssignmentRecord[] = [];
}

export class InMemoryAssignmentWriteRepository implements AssignmentWriteRepository {
  constructor(private readonly store: AssignmentStore = new AssignmentStore()) {}

  async findById(tenantId: string, id: string): Promise<AssignmentRecord | undefined> {
    return this.store.assignments.find((a) => a.tenantId === tenantId && a.id === id);
  }

  async listForPerson(tenantId: string, personId: string): Promise<AssignmentRecord[]> {
    return this.store.assignments
      .filter((a) => a.tenantId === tenantId && a.personId === personId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async findCurrentPrimaryForPerson(tenantId: string, personId: string): Promise<AssignmentRecord | undefined> {
    return this.store.assignments.find((a) => a.tenantId === tenantId && a.personId === personId && a.isPrimary && !a.effectiveUntil);
  }

  async create(input: AssignPrimaryInput): Promise<AssignmentRecord> {
    const now = new Date().toISOString();
    const assignment: AssignmentRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      personId: input.personId,
      orgUnitId: input.orgUnitId,
      ...(input.managerId ? { managerId: input.managerId } : {}),
      isPrimary: true,
      effectiveFrom: input.effectiveFrom,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    });
    this.store.assignments.push(assignment);
    return assignment;
  }

  async end(input: EndAssignmentInput): Promise<AssignmentRecord> {
    const index = this.store.assignments.findIndex((a) => a.tenantId === input.tenantId && a.id === input.id);
    if (index === -1) throw new Error(`assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated = Object.freeze({
      ...this.store.assignments[index],
      effectiveUntil: input.effectiveUntil,
      updatedAt: new Date(Date.now() + 1).toISOString(),
    });
    this.store.assignments[index] = updated;
    return updated;
  }
}

export class InMemoryAssignmentReadRepository implements AssignmentReadRepository {
  constructor(private readonly store: AssignmentStore) {}

  async getCurrentForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord | undefined> {
    requireOrganizationView(context);
    return this.store.assignments.find((a) => a.tenantId === context.tenantId && a.personId === personId && a.isPrimary && !a.effectiveUntil);
  }

  async listHistoryForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord[]> {
    requireOrganizationView(context);
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.personId === personId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async listCurrentByManager(context: TenantContext, managerId: string): Promise<AssignmentRecord[]> {
    requireOrganizationView(context);
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.managerId === managerId && a.isPrimary && !a.effectiveUntil)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async listCurrentPrimary(context: TenantContext): Promise<AssignmentRecord[]> {
    requireOrganizationView(context);
    return this.store.assignments
      .filter((a) => a.tenantId === context.tenantId && a.isPrimary && !a.effectiveUntil)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
}
