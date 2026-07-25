import { hasPermission } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { OrgUnitKind, OrgUnitRecord } from "@/platform/organization/org-unit";
import type { LocationRecord } from "@/platform/organization/location";
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
  kind: OrgUnitKind;
}

export interface EmploymentPickerOption {
  id: string;
  label: string;
}

export interface EmploymentHistoryRow {
  assignmentId: string;
  orgUnitName: string;
  managerName?: string;
  locationName?: string;
  /** Set only when this placement's location differs from the immediately preceding one — the display name of that prior location. */
  locationChangedFrom?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface EmploymentLegalEntitySummary {
  id: string;
  legalName: string;
  code: string;
}

export interface EmploymentActionsViewModel {
  /** Gates whether Transfer/Change Manager/End Placement render at all. The
   *  underlying AssignmentService re-checks organization.manage server-side
   *  regardless — this only controls what the viewer sees. */
  canManage: boolean;
  currentOrgUnitId?: string;
  currentManagerId?: string;
  currentLocationId?: string;
  orgUnitOptions: EmploymentPickerOption[];
  managerOptions: EmploymentPickerOption[];
  /** Only ACTIVE locations — the Change Location picker's choices, sourced from Settings > Organization > Locations master data. */
  locationOptions: EmploymentPickerOption[];
  history: EmploymentHistoryRow[];
  /** Root -> assigned unit, for the canonical OrganizationPath component. Empty when there's no current placement. */
  organizationPath: OrganizationPathSegment[];
  /** The current placement's employer of record (Assignment.legalEntityId — ADR-013 §3). Absent when there's no current placement, matching organizationPath. */
  legalEntity?: EmploymentLegalEntitySummary;
}

const EMPTY_ACTIONS: EmploymentActionsViewModel = Object.freeze({
  canManage: false,
  orgUnitOptions: [],
  managerOptions: [],
  locationOptions: [],
  history: [],
  organizationPath: [],
});

/** Pure: OrgUnitRecord path -> the minimal shape OrganizationPath renders. kind comes straight from the OrgUnit record — never derived from depth or position. */
export function toOrganizationPathSegments(path: readonly Pick<OrgUnitRecord, "id" | "name" | "kind">[]): OrganizationPathSegment[] {
  return path.map((unit) => ({ id: unit.id, name: unit.name, kind: unit.kind }));
}

/**
 * Pure history-row shaping: assignment history -> display rows, most recent
 * first. Location changes are computed by walking the history in
 * chronological order first (each row compared against the placement
 * immediately before it), then reversing for display — the same
 * effective-dated Assignment history this always resolved from, no parallel
 * change-tracking system.
 */
export function toEmploymentHistoryRows(
  history: readonly AssignmentRecord[],
  orgUnitNames: ReadonlyMap<string, string>,
  employeeNames: ReadonlyMap<string, string>,
  locationNames: ReadonlyMap<string, string> = new Map(),
): EmploymentHistoryRow[] {
  const chronological = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const rows: EmploymentHistoryRow[] = [];
  let previousLocationId: string | undefined;
  let hasPrevious = false;
  for (const assignment of chronological) {
    const locationChanged = hasPrevious && assignment.locationId !== previousLocationId;
    rows.push({
      assignmentId: assignment.id,
      orgUnitName: orgUnitNames.get(assignment.orgUnitId) ?? assignment.orgUnitId,
      ...(assignment.managerId ? { managerName: employeeNames.get(assignment.managerId) ?? assignment.managerId } : {}),
      ...(assignment.locationId ? { locationName: locationNames.get(assignment.locationId) ?? assignment.locationId } : {}),
      ...(locationChanged && previousLocationId ? { locationChangedFrom: locationNames.get(previousLocationId) ?? previousLocationId } : {}),
      effectiveFrom: assignment.effectiveFrom,
      ...(assignment.effectiveUntil ? { effectiveUntil: assignment.effectiveUntil } : {}),
    });
    previousLocationId = assignment.locationId;
    hasPrevious = true;
  }
  return rows.reverse();
}

/** Pure picker shaping: active org units become the Transfer picker, every other employee becomes a manager candidate, active locations become the Change Location picker. */
export function toEmploymentPickerOptions(
  orgUnits: readonly Pick<OrgUnitRecord, "id" | "name" | "code" | "status">[],
  employees: readonly OrganizationEmployeeDirectoryEntry[],
  employeeId: string,
  locations: readonly Pick<LocationRecord, "id" | "name" | "code" | "status">[] = [],
): { orgUnitOptions: EmploymentPickerOption[]; managerOptions: EmploymentPickerOption[]; locationOptions: EmploymentPickerOption[] } {
  return {
    orgUnitOptions: orgUnits.filter((unit) => unit.status === "ACTIVE").map((unit) => ({ id: unit.id, label: `${unit.name} (${unit.code})` })),
    managerOptions: employees.filter((employee) => employee.id !== employeeId).map((employee) => ({ id: employee.id, label: employee.displayName })),
    locationOptions: locations.filter((location) => location.status === "ACTIVE").map((location) => ({ id: location.id, label: `${location.name} (${location.code})` })),
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

  const [currentPlacement, history, orgUnits, employees, locations] = await Promise.all([
    runtime.queries.resolveCurrentPlacement(runtime.context, employeeId),
    runtime.queries.resolveAssignmentHistory(runtime.context, employeeId),
    runtime.orgUnits.read.listAll(runtime.context),
    runtime.employees.listAll(runtime.context.tenantId),
    runtime.locations.read.listAll(runtime.context),
  ]);

  const orgUnitNames = new Map(orgUnits.map((unit) => [unit.id, unit.name]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.displayName]));
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const organizationPath = currentPlacement
    ? toOrganizationPathSegments(await runtime.queries.resolveOrgPath(runtime.context, currentPlacement.assignment.orgUnitId))
    : [];
  const legalEntity = currentPlacement
    ? await runtime.legalEntities.read.getById(runtime.context, currentPlacement.assignment.legalEntityId)
    : undefined;

  return {
    canManage: hasPermission(runtime.context, "organization.manage"),
    ...(currentPlacement ? { currentOrgUnitId: currentPlacement.assignment.orgUnitId } : {}),
    ...(currentPlacement?.assignment.managerId ? { currentManagerId: currentPlacement.assignment.managerId } : {}),
    ...(currentPlacement?.assignment.locationId ? { currentLocationId: currentPlacement.assignment.locationId } : {}),
    ...toEmploymentPickerOptions(orgUnits, employees, employeeId, locations),
    history: toEmploymentHistoryRows(history, orgUnitNames, employeeNames, locationNames),
    organizationPath,
    ...(legalEntity ? { legalEntity: { id: legalEntity.id, legalName: legalEntity.legalName, code: legalEntity.code } } : {}),
  };
}

export interface OrganizationPathWithLegalEntity {
  organizationPath: OrganizationPathSegment[];
  /** Same Assignment.legalEntityId loadEmploymentActionsSurface resolves — Employment and Work Information always show the same value (ADR-013 §3), never independently derived. */
  legalEntity?: EmploymentLegalEntitySummary;
}

const EMPTY_ORGANIZATION_PATH: OrganizationPathWithLegalEntity = Object.freeze({ organizationPath: [] });

/**
 * Lightweight sibling of loadEmploymentActionsSurface for screens that only
 * need the organization path and legal entity (e.g. Work Information) —
 * skips the picker options and history payload loadEmploymentActionsSurface
 * also computes. Same OrganizationQueryService, same graceful degradation.
 */
export async function loadOrganizationPathForEmployee(employeeId: string): Promise<OrganizationPathWithLegalEntity> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return EMPTY_ORGANIZATION_PATH;

  const currentPlacement = await runtime.queries.resolveCurrentPlacement(runtime.context, employeeId);
  if (!currentPlacement) return EMPTY_ORGANIZATION_PATH;

  const [path, legalEntity] = await Promise.all([
    runtime.queries.resolveOrgPath(runtime.context, currentPlacement.assignment.orgUnitId),
    runtime.legalEntities.read.getById(runtime.context, currentPlacement.assignment.legalEntityId),
  ]);
  return {
    organizationPath: toOrganizationPathSegments(path),
    ...(legalEntity ? { legalEntity: { id: legalEntity.id, legalName: legalEntity.legalName, code: legalEntity.code } } : {}),
  };
}
