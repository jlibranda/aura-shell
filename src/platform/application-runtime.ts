import { createPlatformContainer } from "@/platform/composition-root";
import type { ServiceContainer } from "@/platform/di";
import type { PeopleService } from "@/platform/people/application/people-service";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import { createTenantContext } from "@/platform/runtime-context";
import { PEOPLE_SERVICE } from "@/platform/tokens";
import type { TenantContext } from "@/platform/context";
import type { OrganizationReferenceService } from "@/platform/organization/organization-reference-service";
import { ORGANIZATION_REFERENCE_SERVICE } from "@/platform/tokens";
import { CommandExecutionPipeline } from "@/platform/commands/command-execution-pipeline";
import type { CommandResult } from "@/platform/commands/command-result";
import type { CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { CreateEmployeeCommandHandler, type CreateEmployeePreparation } from "@/platform/people/commands/create-employee-command-handler";
import { CreateEmployeePersistenceHandler, type InMemoryEmployeeCreation } from "@/platform/people/commands/create-employee-persistence-handler";
import { AURA_COMMAND_PERMISSION_REQUIREMENTS, PermissionAuthorizationPolicy } from "@/platform/authorization/authorization-policy";
import { EMPLOYEE_UNIT_OF_WORK } from "@/platform/tokens";

export interface ApplicationRuntime {
  readonly context: TenantContext;
  readonly people: PeopleService;
  readonly organizationReferences: OrganizationReferenceService;
  readonly commands: Readonly<{
    executeCreateEmployee(command: CreateEmployeeCommand): Promise<CommandResult<CreateEmployeePreparation>>;
    executeInMemoryEmployeeCreate(command: CreateEmployeeCommand): Promise<CommandResult<InMemoryEmployeeCreation>>;
  }>;
}

/**
 * Creates a request-local application boundary for future API handlers and
 * server-side UI loaders. It intentionally holds no global user or tenant
 * state. The optional root parameter supports composition-root test overrides.
 */
export function createApplicationRuntime(request: TrustedRequestContext, root: ServiceContainer = createPlatformContainer()): ApplicationRuntime {
  const scope = root.createScope();
  const authorizationPolicy = new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS);
  const preparationCommands = new CommandExecutionPipeline(authorizationPolicy, [new CreateEmployeeCommandHandler()]);
  const inMemoryWriteCommands = new CommandExecutionPipeline(authorizationPolicy, [new CreateEmployeePersistenceHandler(scope.resolve(EMPLOYEE_UNIT_OF_WORK))]);

  return {
    context: createTenantContext(request),
    people: scope.resolve(PEOPLE_SERVICE),
    organizationReferences: scope.resolve(ORGANIZATION_REFERENCE_SERVICE),
    commands: Object.freeze({
      executeCreateEmployee: (command) => preparationCommands.execute<CreateEmployeeCommand, CreateEmployeePreparation>(request, command),
      executeInMemoryEmployeeCreate: (command) => inMemoryWriteCommands.execute<CreateEmployeeCommand, InMemoryEmployeeCreation>(request, command),
    }),
  };
}
