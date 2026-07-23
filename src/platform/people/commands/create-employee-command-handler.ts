import type { CommandHandler } from "@/platform/commands/application-command";
import { commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { validateCreateEmployeeCommand, type CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { TrustedRequestContext } from "@/platform/runtime-context";

export type CreateEmployeePreparation = Readonly<{ state: "prepared"; command: CreateEmployeeCommand; correlationId: string }>;

/** Validates a future employee-create intent. It makes no authorization or state change. */
export class CreateEmployeeCommandHandler implements CommandHandler<CreateEmployeeCommand, CreateEmployeePreparation> {
  readonly commandType = "people.employee.create" as const;

  execute(request: TrustedRequestContext, command: CreateEmployeeCommand): CommandResult<CreateEmployeePreparation> {
    const validation = validateCreateEmployeeCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);
    return commandSuccess(Object.freeze({ state: "prepared" as const, command: validation.data, correlationId: request.correlationId }));
  }
}
