import type { PrismaClient } from "@prisma/client";
import type { EmployeeDisplayLookup } from "@/platform/people/read-models/employee-display-lookup";

export type PrismaEmployeeDisplayClient = Pick<PrismaClient, "employee">;

export class PrismaEmployeeDisplayLookup implements EmployeeDisplayLookup {
  constructor(private readonly prisma: PrismaEmployeeDisplayClient) {}

  async findDisplayName(tenantId: string, employeeId: string): Promise<string | undefined> {
    const employee = await this.prisma.employee.findUnique({ where: { tenantId_employeeId: { tenantId, employeeId } }, select: { displayName: true } });
    return employee?.displayName;
  }

  async listDisplays(tenantId: string): Promise<{ id: string; displayName: string }[]> {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: { employeeId: true, displayName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return employees.map((employee) => ({ id: employee.employeeId, displayName: employee.displayName }));
  }
}
