import { hasPermission } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import type { OrganizationReferenceOptionDto, OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";
import { createPrismaPeopleReadRuntime, type PrismaPeopleReadRuntime } from "@/platform/people/prisma-people-read-runtime";
import { PEOPLE_DIRECTORY_FILTERABLE_STATUSES, type PeopleDirectoryReadModel, type PeopleEmploymentStatus } from "@/platform/people/read-models/people-read-models";

export interface PeopleDirectoryRow {
  employeeId: string;
  employeeNumber: string;
  displayName: string;
  workEmail: string;
  position: string;
  employmentStatus: PeopleDirectoryReadModel["status"];
  department?: string;
  manager?: string;
  hireDate: string;
}

export interface RuntimeDirectoryPage {
  items: PeopleDirectoryRow[];
  offset: number;
  limit: number;
  total: number;
  query: string;
  status: PeopleEmploymentStatus[];
  departmentId?: string;
  departmentOptions: OrganizationReferenceOptionDto[];
  canCreateEmployee: boolean;
}

export function toPeopleDirectoryRow(
  employee: PeopleDirectoryReadModel,
  organization: OrganizationSummaryDto = {},
): PeopleDirectoryRow {
  return {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    displayName: employee.displayName,
    workEmail: employee.workEmail,
    position: employee.position,
    employmentStatus: employee.status,
    department: organization.department?.displayName,
    manager: organization.manager?.displayName,
    hireDate: employee.hireDate,
  };
}

export async function resolveDirectoryRows(
  runtime: Pick<PrismaPeopleReadRuntime, "context" | "organizationReferences">,
  employees: readonly PeopleDirectoryReadModel[],
): Promise<PeopleDirectoryRow[]> {
  try {
    const references = await runtime.organizationReferences.resolveSummaries(
      runtime.context,
      employees.map((employee) => ({
        departmentId: employee.departmentId,
        managerId: employee.managerId,
      })),
    );
    return employees.map((employee, index) => toPeopleDirectoryRow(employee, references[index]));
  } catch {
    return employees.map((employee) => toPeopleDirectoryRow(employee));
  }
}

export async function loadRuntimeDirectory(input: {
  query?: string;
  offset?: number;
  limit?: number;
  status?: readonly string[];
  departmentId?: string;
}): Promise<RuntimeDirectoryPage> {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const query = input.query?.trim() ?? "";
  const status = (input.status ?? []).filter((value): value is PeopleEmploymentStatus =>
    (PEOPLE_DIRECTORY_FILTERABLE_STATUSES as readonly string[]).includes(value),
  );
  const departmentId = input.departmentId?.trim() || undefined;
  const runtime = createPrismaPeopleReadRuntime(await resolveRequestContext());
  const [result, departmentOptions] = await Promise.all([
    runtime.directory.list(runtime.context, {
      offset,
      limit,
      ...(query ? { query } : {}),
      ...(status.length ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
    }),
    runtime.organizationReferences.list(runtime.context, "department"),
  ]);
  return {
    items: await resolveDirectoryRows(runtime, result.items),
    offset: result.offset,
    limit: result.limit,
    total: result.total,
    query,
    status,
    departmentId,
    departmentOptions,
    canCreateEmployee: hasPermission(runtime.context, "people.employee.hire"),
  };
}
