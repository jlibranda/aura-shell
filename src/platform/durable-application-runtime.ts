import type { AuditCollector } from "@/platform/auditing/audit-collector";
import type { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { createApplicationRuntime, type ApplicationRuntime } from "@/platform/application-runtime";
import { PermissionAuthorizationPolicy, AURA_COMMAND_PERMISSION_REQUIREMENTS } from "@/platform/authorization/authorization-policy";
import { CommandExecutionPipeline } from "@/platform/commands/command-execution-pipeline";
import { createPlatformContainer } from "@/platform/composition-root";
import type { ServiceContainer } from "@/platform/di";
import type { DomainEventCollector } from "@/platform/events/domain-event-collector";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import type { CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { CreateEmployeeDurableHandler, type DurableEmployeeCreation } from "@/platform/people/commands/create-employee-durable-handler";
import type { EmployeeAggregateIdentifierGenerator } from "@/platform/people/persistence/prisma-employee-aggregate-repository";
import { PrismaEmployeeUnitOfWork } from "@/platform/people/persistence/prisma-employee-unit-of-work";
import type { PrismaTransactionRunner } from "@/platform/people/persistence/prisma-persistence-types";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { CommandResult } from "@/platform/commands/command-result";
import { AUDIT_COLLECTOR, AUDIT_RECORD_FACTORY, DOMAIN_EVENT_COLLECTOR } from "@/platform/tokens";

export type DurableApplicationRuntime = Omit<ApplicationRuntime, "commands"> & Readonly<{
  commands: ApplicationRuntime["commands"] & Readonly<{
    executeDurableCreateEmployee(command: CreateEmployeeCommand): Promise<CommandResult<DurableEmployeeCreation>>;
  }>;
}>;

export type DurableRuntimeDependencies = Readonly<{
  root?: ServiceContainer;
  prisma?: PrismaTransactionRunner;
  eventCollector?: DomainEventCollector;
  auditCollector?: AuditCollector;
  auditRecords?: AuditRecordFactory;
  transactionIds?: { next(): string };
  identifiers?: EmployeeAggregateIdentifierGenerator;
}>;

/**
 * Explicit trusted-server composition for durable commands. This is not the
 * browser runtime and is intentionally not imported from any route or action.
 */
export function createDurableApplicationRuntime(
  request: TrustedRequestContext,
  dependencies: DurableRuntimeDependencies = {},
): DurableApplicationRuntime {
  const root = dependencies.root ?? createPlatformContainer();
  const runtime = createApplicationRuntime(request, root);
  const scope = root.createScope();
  const unitOfWork = new PrismaEmployeeUnitOfWork(
    dependencies.prisma ?? getPrismaClient(),
    dependencies.eventCollector ?? scope.resolve(DOMAIN_EVENT_COLLECTOR),
    dependencies.auditCollector ?? scope.resolve(AUDIT_COLLECTOR),
    dependencies.auditRecords ?? scope.resolve(AUDIT_RECORD_FACTORY),
    dependencies.transactionIds,
    dependencies.identifiers,
  );
  const commands = new CommandExecutionPipeline(
    new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS),
    [new CreateEmployeeDurableHandler(unitOfWork)],
  );
  return Object.freeze({
    ...runtime,
    commands: Object.freeze({
      ...runtime.commands,
      executeDurableCreateEmployee: (command: CreateEmployeeCommand) => commands.execute<CreateEmployeeCommand, DurableEmployeeCreation>(request, command),
    }),
  });
}
