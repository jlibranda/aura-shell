import type { TenantContext } from "@/platform/context";
import { requirePeoplePermission } from "@/platform/people/application/people-policies";
import type { OrganizationReferenceOptionDto, OrganizationReferenceType, OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";
import type { OrganizationQueryService } from "@/platform/organization/organization-query-service";
import type { OrgUnitKind, OrgUnitRecord } from "@/platform/organization/org-unit";
import type { OrganizationPlacementService } from "@/platform/people/read-models/organization-placement-service";
import type { EmployeeDisplayLookup } from "@/platform/people/read-models/employee-display-lookup";

/** The nearest ancestor (or the unit itself) of a given kind, searching from the leaf toward the root. */
function nearestByKind(path: readonly OrgUnitRecord[], kind: OrgUnitKind): OrgUnitRecord | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].kind === kind) return path[i];
  }
  return undefined;
}

/**
 * The real `OrganizationPlacementService`. Composes `OrganizationQueryService`
 * (which resolves ids only, through Assignment) with a minimal, direct
 * employee display-name lookup — the one place an Organization id becomes a
 * name for People UI. Never reads a denormalized Employee organization field
 * (ADR-012 §12 invariant #5) — resolution goes through Assignment only.
 *
 * "Department" and "team" are derived from the org path: the nearest
 * ancestor (or the assigned unit itself) of kind DEPARTMENT / TEAM. Assignment
 * names exactly one OrgUnit; department/team are read off the path to it, not
 * off separate fields, since OrgUnit is a general recursive tree, not a fixed
 * two-level department→team hierarchy.
 */
export class PrismaOrganizationPlacementService implements OrganizationPlacementService {
  constructor(
    private readonly query: OrganizationQueryService,
    private readonly employees: EmployeeDisplayLookup,
  ) {}

  async resolvePlacementSummary(context: TenantContext, personId: string): Promise<OrganizationSummaryDto> {
    requirePeoplePermission(context, "people.read");
    return this.resolveOne(context, personId, new Map());
  }

  async resolvePlacementSummaries(context: TenantContext, personIds: readonly string[]): Promise<OrganizationSummaryDto[]> {
    requirePeoplePermission(context, "people.read");
    const managerNameCache = new Map<string, Promise<string | undefined>>();
    return Promise.all(personIds.map((personId) => this.resolveOne(context, personId, managerNameCache)));
  }

  async listOptions(context: TenantContext, type: OrganizationReferenceType): Promise<OrganizationReferenceOptionDto[]> {
    requirePeoplePermission(context, "people.read");
    if (type === "manager") {
      const employees = await this.employees.listDisplays(context.tenantId);
      return employees.map((employee) => Object.freeze({ id: employee.id, displayName: employee.displayName, type: "manager" as const }));
    }
    const kind: OrgUnitKind = type === "department" ? "DEPARTMENT" : "TEAM";
    const units = await this.query.resolveOrgUnitsByKind(context, kind);
    return units.map((unit) => Object.freeze({ id: unit.id, displayName: unit.name, type, ...(unit.parentId ? { parentId: unit.parentId } : {}) }));
  }

  private async resolveOne(context: TenantContext, personId: string, managerNameCache: Map<string, Promise<string | undefined>>): Promise<OrganizationSummaryDto> {
    const placement = await this.query.resolveCurrentPlacement(context, personId);
    if (!placement) return {};

    const path = await this.query.resolveOrgPath(context, placement.orgUnit.id);
    const department = nearestByKind(path, "DEPARTMENT");
    const team = nearestByKind(path, "TEAM");

    const managerId = placement.assignment.managerId;
    const managerName = managerId ? await this.lookupManagerName(context.tenantId, managerId, managerNameCache) : undefined;

    return Object.freeze({
      ...(department ? { department: Object.freeze({ id: department.id, displayName: department.name, type: "department" as const }) } : {}),
      ...(team ? { team: Object.freeze({ id: team.id, displayName: team.name, type: "team" as const }) } : {}),
      ...(managerId && managerName ? { manager: Object.freeze({ id: managerId, displayName: managerName, type: "manager" as const }) } : {}),
    });
  }

  private lookupManagerName(tenantId: string, managerId: string, cache: Map<string, Promise<string | undefined>>): Promise<string | undefined> {
    const existing = cache.get(managerId);
    if (existing) return existing;
    const pending = this.employees.findDisplayName(tenantId, managerId);
    cache.set(managerId, pending);
    return pending;
  }
}
