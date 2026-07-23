import type { Prisma, PrismaClient } from "@prisma/client";
import { requirePeoplePermission } from "@/platform/people/application/people-policies";
import type { TenantContext } from "@/platform/context";
import type { PeopleDirectoryReadInput, PeopleDirectoryReadRepository, PeopleDirectoryReadResult } from "@/platform/people/read-models/people-directory-read-repository";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import { PEOPLE_DIRECTORY_FILTERABLE_STATUSES, type EmployeeContactReadModel, type EmployeeProfileReadModel, type PeopleDirectoryReadModel, type PeopleEmploymentStatus } from "@/platform/people/read-models/people-read-models";

type PrismaPeopleReadClient = Pick<PrismaClient, "employee">;
const statuses = new Set<PeopleEmploymentStatus>(PEOPLE_DIRECTORY_FILTERABLE_STATUSES);
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const optional = (value: string | null): string | undefined => value ?? undefined;
const status = (value: string | null): PeopleEmploymentStatus => value && statuses.has(value as PeopleEmploymentStatus) ? value as PeopleEmploymentStatus : "not_available";

const directorySelect = {
  employeeId: true, employeeNumber: true, displayName: true, workEmail: true,
  departmentId: true, teamId: true, managerId: true, hireDate: true,
  position: true, employmentStatus: true,
} satisfies Prisma.EmployeeSelect;

const profileSelect = {
  employeeId: true, employeeNumber: true, displayName: true, departmentId: true,
  teamId: true, managerId: true, position: true, employmentStatus: true,
  workLocation: true, hireDate: true,
} satisfies Prisma.EmployeeSelect;

function toDirectory(value: Prisma.EmployeeGetPayload<{ select: typeof directorySelect }>): PeopleDirectoryReadModel {
  return Object.freeze({ id: value.employeeId, employeeNumber: value.employeeNumber, displayName: value.displayName, workEmail: value.workEmail, departmentId: value.departmentId, ...(optional(value.teamId) ? { teamId: value.teamId! } : {}), ...(optional(value.managerId) ? { managerId: value.managerId! } : {}), hireDate: dateOnly(value.hireDate), position: value.position, status: status(value.employmentStatus) });
}

function toProfile(value: Prisma.EmployeeGetPayload<{ select: typeof profileSelect }>): EmployeeProfileReadModel {
  return Object.freeze({ id: value.employeeId, employeeNumber: value.employeeNumber, displayName: value.displayName, status: status(value.employmentStatus), position: value.position, departmentId: value.departmentId, ...(optional(value.teamId) ? { teamId: value.teamId! } : {}), ...(optional(value.managerId) ? { managerId: value.managerId! } : {}), location: value.workLocation, hireDate: dateOnly(value.hireDate) });
}

/** Prisma implementation with tenant predicates and explicit safe projections. */
export class PrismaPeopleDirectoryReadRepository implements PeopleDirectoryReadRepository {
  constructor(private readonly prisma: PrismaPeopleReadClient) {}

  async list(context: TenantContext, input: PeopleDirectoryReadInput): Promise<PeopleDirectoryReadResult> {
    requirePeoplePermission(context, "people.read");
    const query = input.query?.trim();
    const selectedStatuses = (input.status ?? []).filter((value) => statuses.has(value));
    const departmentId = input.departmentId?.trim();
    const where: Prisma.EmployeeWhereInput = {
      tenantId: context.tenantId,
      ...(query ? { OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { employeeNumber: { contains: query, mode: "insensitive" } },
        { workEmail: { contains: query, mode: "insensitive" } },
        { position: { contains: query, mode: "insensitive" } },
      ] } : {}),
      ...(selectedStatuses.length ? { employmentStatus: { in: selectedStatuses } } : {}),
      ...(departmentId ? { departmentId } : {}),
    };
    const [total, employees] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({ where, select: directorySelect, skip: input.offset, take: input.limit, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    ]);
    return Object.freeze({ items: Object.freeze(employees.map(toDirectory)), offset: input.offset, limit: input.limit, total });
  }
}

export class PrismaEmployeeProfileReadRepository implements EmployeeProfileReadRepository {
  constructor(private readonly prisma: PrismaPeopleReadClient) {}

  async findProfile(context: TenantContext, employeeId: string): Promise<EmployeeProfileReadModel | undefined> {
    requirePeoplePermission(context, "people.read");
    const employee = await this.prisma.employee.findUnique({ where: { tenantId_employeeId: { tenantId: context.tenantId, employeeId } }, select: profileSelect });
    return employee ? toProfile(employee) : undefined;
  }

  async findContact(context: TenantContext, employeeId: string): Promise<EmployeeContactReadModel | undefined> {
    requirePeoplePermission(context, "people.read");
    const employee = await this.prisma.employee.findUnique({ where: { tenantId_employeeId: { tenantId: context.tenantId, employeeId } }, select: { employeeId: true, workEmail: true } });
    return employee ? Object.freeze({ id: employee.employeeId, workEmail: employee.workEmail }) : undefined;
  }
}
