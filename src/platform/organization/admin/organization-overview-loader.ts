import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { LocationRecord } from "@/platform/organization/location";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";
import type { OrganizationEmployeeDirectoryEntry } from "@/platform/organization/organization-employee-directory";

export interface OrganizationOverviewCounts {
  activeLegalEntities: number;
  archivedLegalEntities: number;
  activeOrgUnits: number;
  archivedOrgUnits: number;
  activeLocations: number;
  archivedLocations: number;
  employeesWithAssignment: number;
  employeesWithoutAssignment: number;
}

export type OrganizationOverviewResult =
  | Readonly<{ kind: "ready"; context: TenantContext; counts: OrganizationOverviewCounts; canManage: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

/**
 * Counts only — deliberately not a reporting subsystem (Epic 7B.5 scope).
 * Every number here is derived from the existing read repositories'
 * `listAll` methods plus the one narrow read method added this slice
 * (`resolveCurrentAssignments`); nothing new is persisted or aggregated.
 * Pure so it can be unit tested without a request/runtime.
 */
export function computeOrganizationOverviewCounts(
  legalEntities: readonly Pick<LegalEntityRecord, "status">[],
  orgUnits: readonly Pick<OrgUnitRecord, "status">[],
  locations: readonly Pick<LocationRecord, "status">[],
  employees: readonly OrganizationEmployeeDirectoryEntry[],
  currentAssignments: readonly Pick<AssignmentRecord, "personId">[],
): OrganizationOverviewCounts {
  const activeLegalEntities = legalEntities.filter((entity) => entity.status === "ACTIVE").length;
  const activeOrgUnits = orgUnits.filter((unit) => unit.status === "ACTIVE").length;
  const activeLocations = locations.filter((location) => location.status === "ACTIVE").length;
  const assignedPersonIds = new Set(currentAssignments.map((assignment) => assignment.personId));
  const employeesWithAssignment = employees.filter((employee) => assignedPersonIds.has(employee.id)).length;

  return {
    activeLegalEntities,
    archivedLegalEntities: legalEntities.length - activeLegalEntities,
    activeOrgUnits,
    archivedOrgUnits: orgUnits.length - activeOrgUnits,
    activeLocations,
    archivedLocations: locations.length - activeLocations,
    employeesWithAssignment,
    employeesWithoutAssignment: employees.length - employeesWithAssignment,
  };
}

export async function loadOrganizationOverview(): Promise<OrganizationOverviewResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const [legalEntities, orgUnits, locations, employees, currentAssignments] = await Promise.all([
    runtime.legalEntities.read.listAll(runtime.context),
    runtime.orgUnits.read.listAll(runtime.context),
    runtime.locations.read.listAll(runtime.context),
    runtime.employees.listAll(runtime.context.tenantId),
    runtime.queries.resolveCurrentAssignments(runtime.context),
  ]);

  return {
    kind: "ready",
    context: runtime.context,
    counts: computeOrganizationOverviewCounts(legalEntities, orgUnits, locations, employees, currentAssignments),
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
