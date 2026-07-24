import type { Prisma } from "@prisma/client";
import type { PersonExistenceRepository } from "@/platform/organization/person-existence-repository";

export type PrismaPersonExistenceClient = Pick<Prisma.TransactionClient, "employee">;

/** Existence-only adapter over the `employees` table, used inside an Assignment write transaction. */
export class PrismaPersonExistenceRepository implements PersonExistenceRepository {
  constructor(private readonly prisma: PrismaPersonExistenceClient) {}

  async existsById(tenantId: string, id: string): Promise<boolean> {
    const found = await this.prisma.employee.findFirst({ where: { tenantId, employeeId: id }, select: { employeeId: true } });
    return found !== null;
  }
}
