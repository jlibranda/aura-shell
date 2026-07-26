import type { Prisma } from "@prisma/client";
import type { OrganizationAssignmentAsOfPort } from "@/platform/timekeeping/organization-assignment-port";

export type PrismaOrganizationAssignmentAsOfClient = Pick<Prisma.TransactionClient, "assignment">;

/**
 * Reads Organization's `assignments` table directly — never through
 * Organization's own service or repository classes — inside the same
 * Prisma.TransactionClient the ScheduleAssignment write uses, so the
 * invariant check and the write share one transaction snapshot (Slice 4
 * Decision 9). This is the same kind of database-level cross-context
 * reference already established by the composite tenant-scoped foreign keys
 * throughout this schema (e.g. attendance_events -> employees), not a
 * domain-layer import of Organization code.
 */
export class PrismaOrganizationAssignmentAsOfRepository implements OrganizationAssignmentAsOfPort {
  constructor(private readonly prisma: PrismaOrganizationAssignmentAsOfClient) {}

  async hasApplicableAssignmentAsOf(tenantId: string, personId: string, asOf: string): Promise<boolean> {
    const at = new Date(asOf);
    const found = await this.prisma.assignment.findFirst({
      where: {
        tenantId,
        personId,
        isPrimary: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { id: true },
    });
    return found !== null;
  }
}
