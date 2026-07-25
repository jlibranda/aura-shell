import type { TenantContext } from "@/platform/context";
import type { AssignmentReadRepository } from "@/platform/organization/assignment-repository";
import type { OrgUnitReadRepository } from "@/platform/organization/org-unit-repository";
import type { LocationReadRepository } from "@/platform/organization/location-repository";
import { collectDescendantIds, type OrgUnitKind, type OrgUnitRecord } from "@/platform/organization/org-unit";
import { primaryAsOf, type AssignmentRecord } from "@/platform/organization/assignment";
import type { LocationRecord } from "@/platform/organization/location";

/** A person's current primary placement: the Assignment and the OrgUnit it names. */
export interface CurrentPlacement {
  assignment: AssignmentRecord;
  orgUnit: OrgUnitRecord;
}

/**
 * The read-only query surface over the Organization domain (ADR-012). It
 * composes the three existing read repositories (Assignment, OrgUnit,
 * Location) and never mutates an aggregate, never touches Prisma directly,
 * and never reads a denormalized Employee organization field — every
 * placement question resolves through Assignment, as ADR-012 §12 requires.
 *
 * This is deliberately ID-level only: it has no knowledge of Employee display
 * names. Turning an id into a name for UI display is a People-domain concern
 * (see `@/platform/people/read-models/organization-placement-service.ts`).
 *
 * Location has no linkage to Assignment yet (Assignment carries no
 * `locationId` — that was explicitly deferred in Epic 7B.2/7B.3, and adding
 * it is a write-side aggregate change out of this slice's read-only scope).
 * `resolveLocationById`/`resolveLocationByCode` are therefore standalone
 * lookups, not part of `resolveCurrentPlacement`.
 */
export class OrganizationQueryService {
  constructor(
    private readonly assignments: AssignmentReadRepository,
    private readonly orgUnits: OrgUnitReadRepository,
    private readonly locations: LocationReadRepository,
  ) {}

  /** The currently open primary assignment for a person, if any. */
  resolveCurrentAssignment(context: TenantContext, personId: string): Promise<AssignmentRecord | undefined> {
    return this.assignments.getCurrentForPerson(context, personId);
  }

  /** The primary assignment in force for a person at a given instant, resolved from their full history. */
  async resolveAssignmentAsOf(context: TenantContext, personId: string, asOf: Date): Promise<AssignmentRecord | undefined> {
    const history = await this.assignments.listHistoryForPerson(context, personId);
    return primaryAsOf(history, asOf);
  }

  /** A person's full placement history, ascending by effectiveFrom. */
  resolveAssignmentHistory(context: TenantContext, personId: string): Promise<AssignmentRecord[]> {
    return this.assignments.listHistoryForPerson(context, personId);
  }

  /** The current manager's person id, if the person has a current assignment with a manager. */
  async resolveManager(context: TenantContext, personId: string): Promise<string | undefined> {
    const current = await this.assignments.getCurrentForPerson(context, personId);
    return current?.managerId;
  }

  /** Every currently open primary assignment reporting to this manager. */
  resolveReports(context: TenantContext, managerId: string): Promise<AssignmentRecord[]> {
    return this.assignments.listCurrentByManager(context, managerId);
  }

  /** A person's current assignment together with the OrgUnit it names, or undefined if the person has none. */
  async resolveCurrentPlacement(context: TenantContext, personId: string): Promise<CurrentPlacement | undefined> {
    const assignment = await this.assignments.getCurrentForPerson(context, personId);
    if (!assignment) return undefined;
    const orgUnit = await this.orgUnits.getById(context, assignment.orgUnitId);
    if (!orgUnit) return undefined;
    return Object.freeze({ assignment, orgUnit });
  }

  /**
   * The ancestor chain from the tree root down to (and including) the given
   * unit. Walks `parentId` one level at a time rather than loading the whole
   * tenant tree — cheaper for a single path query at large tenant scale
   * (ADR-012 §10: adjacency today, measure before adding a closure table).
   * Defensively bounded against a pre-existing cycle in stored data.
   */
  async resolveOrgPath(context: TenantContext, orgUnitId: string): Promise<OrgUnitRecord[]> {
    const path: OrgUnitRecord[] = [];
    const seen = new Set<string>();
    let current = await this.orgUnits.getById(context, orgUnitId);
    while (current && !seen.has(current.id)) {
      path.unshift(current);
      seen.add(current.id);
      if (!current.parentId) break;
      current = await this.orgUnits.getById(context, current.parentId);
    }
    return path;
  }

  /** Every OrgUnit strictly below the given unit in the tree. */
  async resolveDescendants(context: TenantContext, orgUnitId: string): Promise<OrgUnitRecord[]> {
    const all = await this.orgUnits.listAll(context);
    const descendantIds = collectDescendantIds(all, orgUnitId);
    return all.filter((unit) => descendantIds.has(unit.id));
  }

  /** Every OrgUnit of a given kind — e.g. every DEPARTMENT or TEAM, for a picker or a filter. */
  async resolveOrgUnitsByKind(context: TenantContext, kind: OrgUnitKind): Promise<OrgUnitRecord[]> {
    const all = await this.orgUnits.listAll(context);
    return all.filter((unit) => unit.kind === kind);
  }

  /** Standalone Location lookup — not resolvable via Assignment yet (see class doc). */
  resolveLocationById(context: TenantContext, id: string): Promise<LocationRecord | undefined> {
    return this.locations.getById(context, id);
  }

  /** Standalone Location lookup — not resolvable via Assignment yet (see class doc). */
  resolveLocationByCode(context: TenantContext, code: string): Promise<LocationRecord | undefined> {
    return this.locations.getByCode(context, code);
  }
}
