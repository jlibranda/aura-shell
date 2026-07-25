import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { AssignmentReadRepository } from "@/platform/organization/assignment-repository";
import type { AssignmentRecord } from "@/platform/organization/assignment";

export type PrismaAssignmentReadClient = Pick<PrismaClient, "assignment">;

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

function toRecord(value: {
  id: string; tenantId: string; personId: string; orgUnitId: string; managerId: string | null;
  isPrimary: boolean; effectiveFrom: Date; effectiveUntil: Date | null;
  createdAt: Date; createdBy: string; updatedAt: Date;
}): AssignmentRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    personId: value.personId,
    orgUnitId: value.orgUnitId,
    ...(value.managerId ? { managerId: value.managerId } : {}),
    isPrimary: value.isPrimary,
    effectiveFrom: value.effectiveFrom.toISOString(),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
  });
}

/** Read-only, tenant-scoped. Every method requires organization.view. */
export class PrismaAssignmentReadRepository implements AssignmentReadRepository {
  constructor(private readonly prisma: PrismaAssignmentReadClient) {}

  async getCurrentForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord | undefined> {
    requireOrganizationView(context);
    const assignment = await this.prisma.assignment.findFirst({
      where: { tenantId: context.tenantId, personId, isPrimary: true, effectiveUntil: null },
    });
    return assignment ? toRecord(assignment) : undefined;
  }

  async listHistoryForPerson(context: TenantContext, personId: string): Promise<AssignmentRecord[]> {
    requireOrganizationView(context);
    const assignments = await this.prisma.assignment.findMany({
      where: { tenantId: context.tenantId, personId },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }

  async listCurrentByManager(context: TenantContext, managerId: string): Promise<AssignmentRecord[]> {
    requireOrganizationView(context);
    const assignments = await this.prisma.assignment.findMany({
      where: { tenantId: context.tenantId, managerId, isPrimary: true, effectiveUntil: null },
      orderBy: { effectiveFrom: "asc" },
    });
    return assignments.map(toRecord);
  }
}
