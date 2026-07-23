import type { CommandHandler } from "@/platform/commands/application-command";
import { commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { validateCreateEmployeeCommand, type CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { EmployeeAggregate, EmployeeAggregateDraft } from "@/platform/people/persistence/employee-aggregate-repository";
import type { PrismaEmployeeTransactionRepositories } from "@/platform/people/persistence/prisma-employee-unit-of-work";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork } from "@/platform/transactions/unit-of-work";

export type DurableEmployeeCreation = Readonly<{ state: "created_durably"; employee: EmployeeAggregate; correlationId: string }>;

/**
 * Trusted-server-only authoritative handler. Transport and UI code must never
 * construct it; the durable runtime composition is its only activation path.
 */
export class CreateEmployeeDurableHandler implements CommandHandler<CreateEmployeeCommand, DurableEmployeeCreation> {
  readonly commandType = "people.employee.create" as const;

  constructor(private readonly unitOfWork: UnitOfWork<PrismaEmployeeTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: CreateEmployeeCommand): Promise<CommandResult<DurableEmployeeCreation>> {
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
    return commandSuccess(Object.freeze({ state: "created_durably" as const, employee: result.employee, correlationId: request.correlationId }));
  }
}
