import type { CommandHandler } from "@/platform/commands/application-command";
import { commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { validateCreateEmployeeCommand, type CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { EmployeeAggregate, EmployeeAggregateDraft } from "@/platform/people/persistence/employee-aggregate-repository";
import type { PrismaEmployeeTransactionRepositories } from "@/platform/people/persistence/prisma-employee-unit-of-work";
import type { AssignmentRecord } from "@/platform/organization/assignment";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork } from "@/platform/transactions/unit-of-work";

export type DurableEmployeeCreation = Readonly<{ state: "created_durably"; employee: EmployeeAggregate; assignment: AssignmentRecord; correlationId: string }>;

type PlacementCheck =
  | "legal_entity_not_found"
  | "legal_entity_archived"
  | "org_unit_not_found"
  | "org_unit_archived"
  | "org_unit_entity_mismatch"
  | "location_not_found"
  | "location_archived"
  | "manager_not_found"
  | undefined;

/**
 * Trusted-server-only authoritative handler. Transport and UI code must never
 * construct it; the durable runtime composition is its only activation path.
 *
 * Placement (orgUnitId/locationId/managerId) is validated and the employee's
 * initial primary Assignment is created in the *same* durable transaction as
 * the Employee write (Hire Placement Alignment, ADR-012) — a partially
 * placed employee can never exist. Placement is validated *before* the
 * Employee row is written, so a rejected placement leaves nothing written at
 * all; if Assignment creation itself throws after that point, the whole
 * transaction (Employee included) rolls back — Prisma's own guarantee for
 * an unhandled exception inside $transaction.
 */
export class CreateEmployeeDurableHandler implements CommandHandler<CreateEmployeeCommand, DurableEmployeeCreation> {
  readonly commandType = "people.employee.create" as const;

  constructor(private readonly unitOfWork: UnitOfWork<PrismaEmployeeTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: CreateEmployeeCommand): Promise<CommandResult<DurableEmployeeCreation>> {
    const validation = validateCreateEmployeeCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const { legalEntityId, orgUnitId, locationId, managerId } = command.employment;

    const draft: EmployeeAggregateDraft = {
      displayName: [command.personal.firstName, command.personal.middleName, command.personal.lastName].filter(Boolean).join(" "),
      personal: { ...command.personal, dateOfBirth: command.personal.dateOfBirth! },
      contact: { ...command.contact },
      employment: {
        // Legacy compatibility only (ADR-012 §7) — these columns are not
        // authoritative once the Assignment below exists. departmentId has
        // no NOT NULL-free alternative; it gets the OrgUnit id as a stable,
        // non-authoritative placeholder rather than an arbitrary string.
        departmentId: orgUnitId,
        teamId: "",
        position: command.employment.position,
        managerId: managerId,
        employmentType: command.employment.employmentType,
        hireDate: command.employment.hireDate!,
        workLocation: null,
      },
      emergencyContact: { ...command.emergencyContact },
    };

    const result = await this.unitOfWork.execute(
      {
        tenantId,
        correlationId: request.correlationId,
        requestId: request.correlationId,
        actorUserId: request.principal.userId,
        commandName: "CreateEmployee",
      },
      async ({ repositories }) => {
        const check = await this.checkPlacement(repositories, tenantId, { legalEntityId, orgUnitId, locationId, managerId });
        if (check) return check;

        const created = await repositories.employees.create({ tenantId }, draft);
        if (created.kind === "conflict") return created;

        const assignment = await repositories.assignments.create({
          tenantId,
          personId: created.employee.id,
          legalEntityId,
          orgUnitId,
          ...(managerId ? { managerId } : {}),
          ...(locationId ? { locationId } : {}),
          effectiveFrom: command.employment.hireDate!,
          createdBy: request.principal.userId,
        });
        return Object.freeze({ kind: "created" as const, employee: created.employee, assignment });
      },
    );

    if (typeof result === "string") {
      if (result === "legal_entity_not_found") return commandValidationFailure([issue("employment.legalEntityId", "not_found", "The chosen legal entity does not exist.")]);
      if (result === "legal_entity_archived") return commandValidationFailure([issue("employment.legalEntityId", "archived", "The chosen legal entity is archived and can no longer receive new hires.")]);
      if (result === "org_unit_not_found") return commandValidationFailure([issue("employment.orgUnitId", "not_found", "The chosen organization unit does not exist.")]);
      if (result === "org_unit_archived") return commandValidationFailure([issue("employment.orgUnitId", "archived", "The chosen organization unit is archived and can no longer be assigned.")]);
      if (result === "org_unit_entity_mismatch") return commandValidationFailure([issue("employment.orgUnitId", "cross_entity", "The chosen organization unit does not belong to the selected legal entity.")]);
      if (result === "location_not_found") return commandValidationFailure([issue("employment.locationId", "not_found", "The chosen location does not exist.")]);
      if (result === "location_archived") return commandValidationFailure([issue("employment.locationId", "archived", "The chosen location is archived and can no longer be assigned.")]);
      return commandValidationFailure([issue("employment.managerId", "not_found", "The chosen manager does not exist.")]); // manager_not_found
    }
    if (result.kind === "conflict") return commandConflict(result.message);
    return commandSuccess(Object.freeze({ state: "created_durably" as const, employee: result.employee, assignment: result.assignment, correlationId: request.correlationId }));
  }

  /**
   * Validates legal entity / org unit / location / manager against live data
   * *before* the employee row is written — the new hire's own id doesn't
   * exist yet, so this deliberately does not reuse AssignmentService's shared
   * checkAssignmentPlacementInputs (which requires an existing personId).
   * legalEntityId is the Hire form's own Legal Entity selection, checked
   * against the chosen OrgUnit's actual owning Legal Entity (ADR-013 §3) — a
   * stale/mismatched client-side filter is rejected here, not silently
   * accepted.
   */
  private async checkPlacement(
    repositories: PrismaEmployeeTransactionRepositories,
    tenantId: string,
    data: { legalEntityId: string; orgUnitId: string; locationId: string; managerId: string },
  ): Promise<PlacementCheck> {
    const orgUnit = await repositories.orgUnits.findById(tenantId, data.orgUnitId);
    if (!orgUnit) return "org_unit_not_found";
    if (orgUnit.status !== "ACTIVE") return "org_unit_archived";
    if (data.legalEntityId !== orgUnit.legalEntityId) return "org_unit_entity_mismatch";
    const legalEntity = await repositories.legalEntities.findById(tenantId, data.legalEntityId);
    if (!legalEntity) return "legal_entity_not_found";
    if (legalEntity.status !== "ACTIVE") return "legal_entity_archived";
    if (data.locationId) {
      const location = await repositories.locations.findById(tenantId, data.locationId);
      if (!location) return "location_not_found";
      if (location.status !== "ACTIVE") return "location_archived";
    }
    if (data.managerId && !(await repositories.people.existsById(tenantId, data.managerId))) return "manager_not_found";
    return undefined;
  }
}
