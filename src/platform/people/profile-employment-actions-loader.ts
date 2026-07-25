import { hasPermission } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { OrganizationEmployeeDirectoryEntry } from "@/platform/organization/organization-employee-directory";

/**
 * Deliberately not imported from the OrganizationPath component — platform
 * code must not depend on @/components (see the
 * platform-must-not-import-nextjs-ui architecture-fitness rule). The two
 * declarations are kept structurally identical rather than shared.
 */
export interface OrganizationPathSegment {
  id: string;
  name: string;
}

export interface EmploymentPickerOption {
  id: string;
  label: string;
}

export interface EmploymentHistoryRow {
  assignmentId: string;
  orgUnitName: string;
  managerName?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface EmploymentActionsViewModel {
  /** Gates whether Transfer/Change Manager/End Placement render at all. The
   *  underlying AssignmentService re-checks organization.manage server-side
   *  regardless — this only controls what the viewer sees. */
  canManage: boolean;
  currentOrgUnitId?: string;
  currentManagerId?: string;
  orgUnitOptions: EmploymentPickerOption[];
  managerOptions: EmploymentPickerOption[];
  history: EmploymentHistoryRow[];
  /** Root -> assigned unit, for the canonical OrganizationPath component. Empty when there's no current placement. */
  organizationPath: OrganizationPathSegment[];
}

const EMPTY_ACTIONS: EmploymentActionsViewModel = Object.freeze({
  canManage: false,
  orgUnitOptions: [],
  managerOptions: [],
  history: [],
  organizationPath: [],
});

/** Pure: OrgUnitRecord path -> the minimal shape OrganizationPath renders. */
export function toOrganizationPathSegments(path: readonly Pick<OrgUnitRecord, "id" | "name">[]): OrganizationPathSegment[] {
  return path.map((unit) => ({ id: unit.id, name: unit.name }));
}

/** Pure history-row shaping: assignment history -> display rows, most recent first. */
export function toEmploymentHistoryRows(
  history: readonly AssignmentRecord[],
  orgUnitNames: ReadonlyMap<string, string>,
  employeeNames: ReadonlyMap<string, string>,
): EmploymentHistoryRow[] {
  return [...history]
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .map((assignment) => ({
      assignmentId: assignment.id,
      orgUnitName: orgUnitNames.get(assignment.orgUnitId) ?? assignment.orgUnitId,
      ...(assignment.managerId ? { managerName: employeeNames.get(assignment.managerId) ?? assignment.managerId } : {}),
      effectiveFrom: assignment.effectiveFrom,
      ...(assignment.effectiveUntil ? { effectiveUntil: assignment.effectiveUntil } : {}),
    }));
}

/** Pure picker shaping: active org units become the Transfer picker, every other employee becomes a manager candidate. */
export function toEmploymentPickerOptions(
  orgUnits: readonly Pick<OrgUnitRecord, "id" | "name" | "code" | "status">[],
  employees: readonly OrganizationEmployeeDirectoryEntry[],
  employeeId: string,
): { orgUnitOptions: EmploymentPickerOption[]; managerOptions: EmploymentPickerOption[] } {
  return {
    orgUnitOptions: orgUnits.filter((unit) => unit.status === "ACTIVE").map((unit) => ({ id: unit.id, label: `${unit.name} (${unit.code})` })),
    managerOptions: employees.filter((employee) => employee.id !== employeeId).map((employee) => ({ id: employee.id, label: employee.displayName })),
  };
}

/**
 * Read-only support data for the Employment tab's Transfer / Change Manager /
 * End Placement actions and Employment History card. Composes the same
 * OrganizationQueryService + OrganizationEmployeeDirectory the Settings admin
 * surface uses via createOrganizationAdminRuntime — no new domain logic, no
 * duplicate read path.
 *
 * A viewer with people.read but not organization.view can still see the
 * Employment tab (existing behavior — see profile-runtime-loader.ts's
 * loadOrganizationPlacement), so this degrades to an empty, no-actions view
 * model rather than throwing, matching that established precedent.
 */
export async function loadEmploymentActionsSurface(employeeId: string): Promise<EmploymentActionsViewModel> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return EMPTY_ACTIONS;

  const [currentPlacement, history, orgUnits, employees] = await Promise.all([
    runtime.queries.resolveCurrentPlacement(runtime.context, employeeId),
    runtime.queries.resolveAssignmentHistory(runtime.context, employeeId),
    runtime.orgUnits.read.listAll(runtime.context),
    runtime.employees.listAll(runtime.context.tenantId),
  ]);

  const orgUnitNames = new Map(orgUnits.map((unit) => [unit.id, unit.name]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.displayName]));
  const organizationPath = currentPlacement
    ? toOrganizationPathSegments(await runtime.queries.resolveOrgPath(runtime.context, currentPlacement.assignment.orgUnitId))
    : [];

  return {
    canManage: hasPermission(runtime.context, "organization.manage"),
    ...(currentPlacement ? { currentOrgUnitId: currentPlacement.assignment.orgUnitId } : {}),
    ...(currentPlacement?.assignment.managerId ? { currentManagerId: currentPlacement.assignment.managerId } : {}),
    ...toEmploymentPickerOptions(orgUnits, employees, employeeId),
    history: toEmploymentHistoryRows(history, orgUnitNames, employeeNames),
    organizationPath,
  };
}

/**
 * Lightweight sibling of loadEmploymentActionsSurface for screens that only
 * need the organization path (e.g. Work Information) — skips the picker
 * options and history payload loadEmploymentActionsSurface also computes.
 * Same OrganizationQueryService, same graceful degradation.
 */
export async function loadOrganizationPathForEmployee(employeeId: string): Promise<OrganizationPathSegment[]> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return [];

  const currentPlacement = await runtime.queries.resolveCurrentPlacement(runtime.context, employeeId);
  if (!currentPlacement) return [];

  const path = await runtime.queries.resolveOrgPath(runtime.context, currentPlacement.assignment.orgUnitId);
  return toOrganizationPathSegments(path);
}
