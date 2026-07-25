import type { PrismaClient } from "@prisma/client";
import type { OrganizationEmployeeDirectory, OrganizationEmployeeDirectoryEntry } from "@/platform/organization/organization-employee-directory";

export type PrismaOrganizationEmployeeDirectoryClient = Pick<PrismaClient, "employee">;

export class PrismaOrganizationEmployeeDirectory implements OrganizationEmployeeDirectory {
  constructor(private readonly prisma: PrismaOrganizationEmployeeDirectoryClient) {}

  async listAll(tenantId: string): Promise<OrganizationEmployeeDirectoryEntry[]> {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: { employeeId: true, displayName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return employees.map((employee) => ({ id: employee.employeeId, displayName: employee.displayName }));
  }
}
