import type { CommandHandler } from "@/platform/commands/application-command";
import { commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { validateCreateEmployeeCommand, type CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { EmployeeAggregate, EmployeeAggregateDraft } from "@/platform/people/persistence/employee-aggregate-repository";
import type { EmployeeTransactionRepositories } from "@/platform/people/persistence/in-memory-employee-unit-of-work";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork } from "@/platform/transactions/unit-of-work";

export type InMemoryEmployeeCreation = Readonly<{ state: "created_in_memory"; employee: EmployeeAggregate; correlationId: string }>;

/** Internal/test-only handler for the new write port. It is intentionally not wired to any browser action. */
export class CreateEmployeePersistenceHandler implements CommandHandler<CreateEmployeeCommand, InMemoryEmployeeCreation> {
  readonly commandType = "people.employee.create" as const;

  constructor(private readonly unitOfWork: UnitOfWork<EmployeeTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: CreateEmployeeCommand): Promise<CommandResult<InMemoryEmployeeCreation>> {
    const validation = validateCreateEmployeeCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const draft: EmployeeAggregateDraft = {
      displayName: [command.personal.firstName, command.personal.middleName, command.personal.lastName].filter(Boolean).join(" "),
      personal: { ...command.personal, dateOfBirth: command.personal.dateOfBirth! },
      contact: { ...command.contact },
      employment: { ...command.employment, hireDate: command.employment.hireDate! },
      emergencyContact: { ...command.emergencyContact },
    };
    const result = await this.unitOfWork.execute(
      {
        tenantId: request.principal.tenantId,
        correlationId: request.correlationId,
        requestId: request.correlationId,
        actorUserId: request.principal.userId,
        commandName: "CreateEmployee",
      },
      ({ repositories }) => repositories.employees.create({ tenantId: request.principal.tenantId }, draft),
    );
    if (result.kind === "conflict") return commandConflict(result.message);
    return commandSuccess(Object.freeze({ state: "created_in_memory" as const, employee: result.employee, correlationId: request.correlationId }));
  }
}
