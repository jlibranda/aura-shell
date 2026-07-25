import type { Prisma } from "@prisma/client";
import type {
  AssignPrimaryInput,
  AssignmentWriteRepository,
  EndAssignmentInput,
} from "@/platform/organization/assignment-repository";
import type { AssignmentRecord } from "@/platform/organization/assignment";

export type PrismaAssignmentWriteClient = Pick<Prisma.TransactionClient, "assignment">;

function toRecord(value: {
  id: string; tenantId: string; personId: string; orgUnitId: string; managerId: string | null; locationId: string | null;
  isPrimary: boolean; effectiveFrom: Date; effectiveUntil: Date | null;
  createdAt: Date; createdBy: string; updatedAt: Date;
}): AssignmentRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    personId: value.personId,
    orgUnitId: value.orgUnitId,
    ...(value.managerId ? { managerId: value.managerId } : {}),
    ...(value.locationId ? { locationId: value.locationId } : {}),
    isPrimary: value.isPrimary,
    effectiveFrom: value.effectiveFrom.toISOString(),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
  });
}

/**
 * Write-side adapter, used only inside an Assignment write transaction.
 * Tenant scoping is on every query's where clause. Overlap prevention is
 * enforced twice: here the service pre-checks in-transaction against live
 * data for a clean error, and the database's GIST exclusion constraint is the
 * actual guarantee against a race.
 */
export class PrismaAssignmentWriteRepository implements AssignmentWriteRepository {
  constructor(private readonly prisma: PrismaAssignmentWriteClient) {}

  async findById(tenantId: string, id: string): Promise<AssignmentRecord | undefined> {
    const assignment = await this.prisma.assignment.findFirst({ where: { tenantId, id } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async listForPerson(tenantId: string, personId: string): Promise<AssignmentRecord[]> {
    const assignments = await this.prisma.assignment.findMany({ where: { tenantId, personId }, orderBy: { effectiveFrom: "asc" } });
    return assignments.map(toRecord);
  }

  async findCurrentPrimaryForPerson(tenantId: string, personId: string): Promise<AssignmentRecord | undefined> {
    const assignment = await this.prisma.assignment.findFirst({ where: { tenantId, personId, isPrimary: true, effectiveUntil: null } });
    return assignment ? toRecord(assignment) : undefined;
  }

  async create(input: AssignPrimaryInput): Promise<AssignmentRecord> {
    const assignment = await this.prisma.assignment.create({
      data: {
        tenantId: input.tenantId,
        personId: input.personId,
        orgUnitId: input.orgUnitId,
        managerId: input.managerId ?? null,
        locationId: input.locationId ?? null,
        effectiveFrom: new Date(input.effectiveFrom),
        createdBy: input.createdBy,
      },
    });
    return toRecord(assignment);
  }

  async end(input: EndAssignmentInput): Promise<AssignmentRecord> {
    // updateMany (not update) so the where clause can be tenant-scoped without
    // requiring a compound (tenantId, id) unique key — id alone is never
    // trusted for a write, even though it is a UUID.
    const result = await this.prisma.assignment.updateMany({
      where: { id: input.id, tenantId: input.tenantId },
      data: { effectiveUntil: new Date(input.effectiveUntil) },
    });
    if (result.count === 0) throw new Error(`assignment ${input.id} not found for tenant ${input.tenantId}`);
    const updated = await this.prisma.assignment.findFirst({ where: { id: input.id, tenantId: input.tenantId } });
    if (!updated) throw new Error(`assignment ${input.id} not found for tenant ${input.tenantId}`);
    return toRecord(updated);
  }
}
