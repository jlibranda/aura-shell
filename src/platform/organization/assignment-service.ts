import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { AssignmentTransactionRepositories } from "@/platform/organization/assignment-repository";
import {
  validateAssignPrimary,
  validateEndAssignment,
  validateTransfer,
  windowsOverlap,
  type AssignmentRecord,
} from "@/platform/organization/assignment";

export type AssignmentAssigned = Readonly<{ state: "assigned"; assignment: AssignmentRecord }>;
export type AssignmentTransferred = Readonly<{ state: "transferred"; previous: AssignmentRecord; assignment: AssignmentRecord }>;
export type AssignmentEnded = Readonly<{ state: "ended"; assignment: AssignmentRecord }>;

export type PlacementInputCheck =
  | "person_not_found"
  | "manager_not_found"
  | "org_unit_not_found"
  | "org_unit_archived"
  | "location_not_found"
  | "location_archived"
  | "legal_entity_not_found"
  | "legal_entity_archived"
  | "org_unit_entity_mismatch"
  | undefined;

/**
 * Cross-aggregate placement existence/eligibility checks against live data,
 * inside a write transaction — person, manager, org unit, its owning Legal
 * Entity, and (if given) location. Shared by AssignmentService and any other
 * command that opens its own placement inside the same kind of transaction
 * (e.g. the durable hire handler creating an employee's initial Assignment) —
 * one validation path, not a duplicated copy per caller.
 *
 * `data.legalEntityId`, when provided, is the caller's *asserted* Legal
 * Entity (e.g. Hire's Legal Entity picker) and is checked against the chosen
 * OrgUnit's actual owning Legal Entity (ADR-013 §3) — a mismatch is rejected
 * rather than silently resolved to the OrgUnit's real entity, so a stale
 * client-side filter can never place someone under the wrong employer of
 * record. Callers with no such picker (Settings Assignment Diagnostics) omit
 * it and simply inherit the chosen OrgUnit's Legal Entity.
 */
export async function checkAssignmentPlacementInputs(
  repositories: Pick<AssignmentTransactionRepositories, "people" | "orgUnits" | "locations" | "legalEntities">,
  tenantId: string,
  data: { personId: string; orgUnitId: string; legalEntityId?: string; managerId?: string; locationId?: string },
): Promise<PlacementInputCheck> {
  if (!(await repositories.people.existsById(tenantId, data.personId))) return "person_not_found";
  if (data.managerId && !(await repositories.people.existsById(tenantId, data.managerId))) return "manager_not_found";
  const orgUnit = await repositories.orgUnits.findById(tenantId, data.orgUnitId);
  if (!orgUnit) return "org_unit_not_found";
  if (orgUnit.status !== "ACTIVE") return "org_unit_archived";
  if (data.legalEntityId && data.legalEntityId !== orgUnit.legalEntityId) return "org_unit_entity_mismatch";
  const legalEntity = await repositories.legalEntities.findById(tenantId, orgUnit.legalEntityId);
  if (!legalEntity) return "legal_entity_not_found";
  if (legalEntity.status !== "ACTIVE") return "legal_entity_archived";
  if (data.locationId) {
    const location = await repositories.locations.findById(tenantId, data.locationId);
    if (!location) return "location_not_found";
    if (location.status !== "ACTIVE") return "location_archived";
  }
  return undefined;
}

/**
 * The single write entry point for placement. It owns the invariants that
 * must be enforced against live data *inside the write transaction* — person,
 * manager, and org unit existence, and "at most one primary assignment in
 * force per person at any instant" (ADR-012 §7, §12) — and produces audit and
 * outbox atomically through the UnitOfWork. A transfer is modeled as its own
 * command (end the current placement, open a new one, same transaction), not
 * an edit-in-place, so history is always resolvable. Every mutation requires
 * organization.manage.
 */
export class AssignmentService {
  constructor(private readonly unitOfWork: UnitOfWork<AssignmentTransactionRepositories>) {}

  /** A person's first primary placement, or a future non-overlapping one. */
  async assignPrimary(
    request: TrustedRequestContext,
    input: { personId: string; orgUnitId: string; legalEntityId?: string; managerId?: string; locationId?: string; effectiveFrom: string },
  ): Promise<CommandResult<AssignmentAssigned>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateAssignPrimary(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "AssignPrimary"), async ({ repositories }) => {
      const check = await this.checkPlacementInputs(repositories, tenantId, validation.data);
      if (check) return check;
      const orgUnit = await repositories.orgUnits.findById(tenantId, validation.data.orgUnitId);
      const existing = await repositories.assignments.listForPerson(tenantId, validation.data.personId);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined };
      if (existing.some((a) => a.isPrimary && windowsOverlap(a, candidate))) return "overlap" as const;
      return repositories.assignments.create({
        tenantId,
        personId: validation.data.personId,
        legalEntityId: orgUnit!.legalEntityId,
        orgUnitId: validation.data.orgUnitId,
        managerId: validation.data.managerId,
        locationId: validation.data.locationId,
        effectiveFrom: validation.data.effectiveFrom,
        createdBy: request.principal.userId,
      });
    });

    if (typeof result === "string") {
      if (result === "person_not_found") return commandValidationFailure([issue("personId", "not_found", "This person does not exist.")]);
      if (result === "manager_not_found") return commandValidationFailure([issue("managerId", "not_found", "The chosen manager does not exist.")]);
      if (result === "org_unit_not_found") return commandValidationFailure([issue("orgUnitId", "not_found", "The chosen organization unit does not exist.")]);
      if (result === "org_unit_archived") return commandValidationFailure([issue("orgUnitId", "archived", "The chosen organization unit is archived and can no longer be assigned.")]);
      if (result === "location_not_found") return commandValidationFailure([issue("locationId", "not_found", "The chosen location does not exist.")]);
      if (result === "location_archived") return commandValidationFailure([issue("locationId", "archived", "The chosen location is archived and can no longer be assigned.")]);
      if (result === "legal_entity_not_found") return commandValidationFailure([issue("legalEntityId", "not_found", "The chosen legal entity does not exist.")]);
      if (result === "legal_entity_archived") return commandValidationFailure([issue("legalEntityId", "archived", "The chosen organization unit's legal entity is archived and can no longer receive new placements.")]);
      if (result === "org_unit_entity_mismatch") return commandValidationFailure([issue("orgUnitId", "cross_entity", "The chosen organization unit does not belong to the selected legal entity.")]);
      return commandConflict("This person already has a primary placement in force for the given period."); // overlap
    }
    return commandSuccess(Object.freeze({ state: "assigned" as const, assignment: result }));
  }

  /**
   * Ends the current primary placement and opens a new one, atomically. The
   * new placement always inherits the current placement's Legal Entity
   * (ADR-013 §3/§4) — an ordinary transfer never changes employer of record;
   * only a dedicated inter-entity transfer workflow could, and this slice
   * does not build one. Transferring into an OrgUnit owned by a different
   * Legal Entity is rejected server-side (the same org_unit_entity_mismatch
   * check Hire uses), not silently reinterpreted.
   */
  async transfer(
    request: TrustedRequestContext,
    input: { personId: string; orgUnitId: string; managerId?: string; locationId?: string; effectiveFrom: string },
  ): Promise<CommandResult<AssignmentTransferred>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateTransfer(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "TransferAssignment"), async ({ repositories }) => {
      const current = await repositories.assignments.findCurrentPrimaryForPerson(tenantId, validation.data.personId);
      if (!current) return "no_current_assignment" as const;
      const check = await this.checkPlacementInputs(repositories, tenantId, { ...validation.data, legalEntityId: current.legalEntityId });
      if (check) return check;
      if (new Date(validation.data.effectiveFrom).getTime() <= new Date(current.effectiveFrom).getTime()) {
        return "invalid_transfer_date" as const;
      }
      const others = (await repositories.assignments.listForPerson(tenantId, validation.data.personId)).filter((a) => a.id !== current.id);
      const candidate = { effectiveFrom: validation.data.effectiveFrom, effectiveUntil: undefined };
      if (others.some((a) => a.isPrimary && windowsOverlap(a, candidate))) return "overlap" as const;

      const previous = await repositories.assignments.end({ tenantId, id: current.id, effectiveUntil: validation.data.effectiveFrom });
      const assignment = await repositories.assignments.create({
        tenantId,
        personId: validation.data.personId,
        legalEntityId: current.legalEntityId,
        orgUnitId: validation.data.orgUnitId,
        managerId: validation.data.managerId,
        locationId: validation.data.locationId,
        effectiveFrom: validation.data.effectiveFrom,
        createdBy: request.principal.userId,
      });
      return Object.freeze({ previous, assignment });
    });

    if (typeof result === "string") {
      if (result === "person_not_found") return commandValidationFailure([issue("personId", "not_found", "This person does not exist.")]);
      if (result === "manager_not_found") return commandValidationFailure([issue("managerId", "not_found", "The chosen manager does not exist.")]);
      if (result === "org_unit_not_found") return commandValidationFailure([issue("orgUnitId", "not_found", "The chosen organization unit does not exist.")]);
      if (result === "org_unit_archived") return commandValidationFailure([issue("orgUnitId", "archived", "The chosen organization unit is archived and can no longer be assigned.")]);
      if (result === "location_not_found") return commandValidationFailure([issue("locationId", "not_found", "The chosen location does not exist.")]);
      if (result === "location_archived") return commandValidationFailure([issue("locationId", "archived", "The chosen location is archived and can no longer be assigned.")]);
      if (result === "legal_entity_not_found") return commandValidationFailure([issue("orgUnitId", "not_found", "The chosen organization unit's legal entity does not exist.")]);
      if (result === "legal_entity_archived") return commandValidationFailure([issue("orgUnitId", "archived", "The chosen organization unit's legal entity is archived and can no longer receive placements.")]);
      if (result === "org_unit_entity_mismatch") return commandValidationFailure([issue("orgUnitId", "cross_entity", "An ordinary transfer cannot move a person to a different legal entity. The chosen organization unit belongs to a different legal entity than this person's current placement.")]);
      if (result === "no_current_assignment") return commandValidationFailure([issue("personId", "no_current_assignment", "This person has no current placement to transfer from.")]);
      if (result === "invalid_transfer_date") return commandValidationFailure([issue("effectiveFrom", "INVALID_DATE", "The transfer date must be after the current placement's start date.")]);
      return commandConflict("This transfer would overlap another primary placement for this person."); // overlap
    }
    return commandSuccess(Object.freeze({ state: "transferred" as const, previous: result.previous, assignment: result.assignment }));
  }

  /** Closes a person's current primary placement without opening a new one (e.g. offboarding). */
  async endAssignment(request: TrustedRequestContext, input: { personId: string; effectiveUntil: string }): Promise<CommandResult<AssignmentEnded>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateEndAssignment(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "EndAssignment"), async ({ repositories }) => {
      const current = await repositories.assignments.findCurrentPrimaryForPerson(tenantId, validation.data.personId);
      if (!current) return "no_current_assignment" as const;
      if (new Date(validation.data.effectiveUntil).getTime() <= new Date(current.effectiveFrom).getTime()) {
        return "invalid_end_date" as const;
      }
      return repositories.assignments.end({ tenantId, id: current.id, effectiveUntil: validation.data.effectiveUntil });
    });

    if (result === "no_current_assignment") return commandValidationFailure([issue("personId", "no_current_assignment", "This person has no current placement to end.")]);
    if (result === "invalid_end_date") return commandValidationFailure([issue("effectiveUntil", "INVALID_DATE", "The end date must be after the placement's start date.")]);
    return commandSuccess(Object.freeze({ state: "ended" as const, assignment: result }));
  }

  private checkPlacementInputs(
    repositories: AssignmentTransactionRepositories,
    tenantId: string,
    data: { personId: string; orgUnitId: string; legalEntityId?: string; managerId?: string; locationId?: string },
  ): Promise<PlacementInputCheck> {
    return checkAssignmentPlacementInputs(repositories, tenantId, data);
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "organization.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage placements.");
  }

  private context(request: TrustedRequestContext, commandName: string): UnitOfWorkContext {
    return {
      tenantId: request.principal.tenantId,
      correlationId: request.correlationId,
      requestId: request.correlationId,
      actorUserId: request.principal.userId,
      commandName,
    };
  }
}
