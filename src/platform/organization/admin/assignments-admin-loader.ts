import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { OrganizationEmployeeDirectoryEntry } from "@/platform/organization/organization-employee-directory";
import type { AssignmentAdminRow } from "@/platform/organization/organization-admin-dtos";

export type AssignmentsAdminResult =
  | Readonly<{
      kind: "ready";
      context: TenantContext;
      assignments: AssignmentAdminRow[];
      unassigned: OrganizationEmployeeDirectoryEntry[];
      employees: OrganizationEmployeeDirectoryEntry[];
      orgUnits: OrgUnitRecord[];
      canManage: boolean;
    }>
  | Readonly<{ kind: "unauthorized" }>;

/** Pure display-name join: person/org-unit/manager ids -> display names, sorted by employee name. Unit tested directly. */
export function toAssignmentAdminRows(
  currentAssignments: readonly AssignmentRecord[],
  employees: readonly OrganizationEmployeeDirectoryEntry[],
  orgUnits: readonly Pick<OrgUnitRecord, "id" | "name">[],
): AssignmentAdminRow[] {
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.displayName]));
  const orgUnitNames = new Map(orgUnits.map((unit) => [unit.id, unit.name]));

  return currentAssignments
    .map((assignment) => ({
      assignmentId: assignment.id,
      personId: assignment.personId,
      personName: employeeNames.get(assignment.personId) ?? assignment.personId,
      orgUnitId: assignment.orgUnitId,
      orgUnitName: orgUnitNames.get(assignment.orgUnitId) ?? assignment.orgUnitId,
      ...(assignment.managerId ? { managerId: assignment.managerId, managerName: employeeNames.get(assignment.managerId) ?? assignment.managerId } : {}),
      effectiveFrom: assignment.effectiveFrom,
    }))
    .sort((a, b) => a.personName.localeCompare(b.personName));
}

/**
 * No backfill exists (Epic 7B.5 Phase 1 finding: the hire flow never creates
 * an Assignment). `unassigned` surfaces that honestly rather than hiding it —
 * this is visibility only, never an automatic assignment.
 */
export async function loadAssignmentsAdmin(): Promise<AssignmentsAdminResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const [current, employees, orgUnits] = await Promise.all([
    runtime.queries.resolveCurrentAssignments(runtime.context),
    runtime.employees.listAll(runtime.context.tenantId),
    runtime.orgUnits.read.listAll(runtime.context),
  ]);

  const assignedPersonIds = new Set(current.map((assignment) => assignment.personId));

  return {
    kind: "ready",
    context: runtime.context,
    assignments: toAssignmentAdminRows(current, employees, orgUnits),
    unassigned: employees.filter((employee) => !assignedPersonIds.has(employee.id)).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    employees: [...employees].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    orgUnits: orgUnits.filter((unit) => unit.status === "ACTIVE").sort((a, b) => a.name.localeCompare(b.name)),
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
