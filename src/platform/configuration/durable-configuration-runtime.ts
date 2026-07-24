import type { AuditCollector } from "@/platform/auditing/audit-collector";
import type { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { PermissionAuthorizationPolicy, AURA_COMMAND_PERMISSION_REQUIREMENTS } from "@/platform/authorization/authorization-policy";
import { CommandExecutionPipeline } from "@/platform/commands/command-execution-pipeline";
import type { CommandResult } from "@/platform/commands/command-result";
import { createPlatformContainer } from "@/platform/composition-root";
import type { ServiceContainer } from "@/platform/di";
import type { DomainEventCollector } from "@/platform/events/domain-event-collector";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import {
  DiscardGeneralSettingsDraftHandler,
  PublishGeneralSettingsHandler,
  SaveGeneralSettingsDraftHandler,
  type GeneralSettingsDraftDiscarded,
  type GeneralSettingsDraftSaved,
  type GeneralSettingsPublished,
} from "@/platform/configuration/commands/general-settings-durable-handlers";
import type {
  DiscardGeneralSettingsDraftCommand,
  PublishGeneralSettingsCommand,
  SaveGeneralSettingsDraftCommand,
} from "@/platform/configuration/commands/general-settings-commands";
import { PrismaConfigurationUnitOfWork, type PrismaConfigurationTransactionRunner } from "@/platform/configuration/prisma-configuration-unit-of-work";
import { createPrismaConfigurationReadRuntime, type PrismaConfigurationReadRuntime } from "@/platform/configuration/prisma-configuration-read-runtime";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import { AUDIT_COLLECTOR, AUDIT_RECORD_FACTORY, DOMAIN_EVENT_COLLECTOR } from "@/platform/tokens";

export type DurableConfigurationRuntime = PrismaConfigurationReadRuntime & Readonly<{
  commands: Readonly<{
    saveGeneralSettingsDraft(command: SaveGeneralSettingsDraftCommand): Promise<CommandResult<GeneralSettingsDraftSaved>>;
    discardGeneralSettingsDraft(command: DiscardGeneralSettingsDraftCommand): Promise<CommandResult<GeneralSettingsDraftDiscarded>>;
    publishGeneralSettings(command: PublishGeneralSettingsCommand): Promise<CommandResult<GeneralSettingsPublished>>;
  }>;
}>;

export type DurableConfigurationRuntimeDependencies = Readonly<{
  root?: ServiceContainer;
  prisma?: PrismaConfigurationTransactionRunner;
  eventCollector?: DomainEventCollector;
  auditCollector?: AuditCollector;
  auditRecords?: AuditRecordFactory;
  transactionIds?: { next(): string };
}>;

/**
 * Explicit trusted-server composition for the configuration platform's
 * durable commands (Settings draft/publish lifecycle). Mirrors
 * createDurableApplicationRuntime's shape; not the browser runtime and is
 * intentionally not imported from any route or action.
 */
export function createDurableConfigurationRuntime(
  request: TrustedRequestContext,
  dependencies: DurableConfigurationRuntimeDependencies = {},
): DurableConfigurationRuntime {
  const root = dependencies.root ?? createPlatformContainer();
  const scope = root.createScope();
  const readRuntime = createPrismaConfigurationReadRuntime(request);
  const unitOfWork = new PrismaConfigurationUnitOfWork(
    dependencies.prisma ?? getPrismaClient(),
    dependencies.eventCollector ?? scope.resolve(DOMAIN_EVENT_COLLECTOR),
    dependencies.auditCollector ?? scope.resolve(AUDIT_COLLECTOR),
    dependencies.auditRecords ?? scope.resolve(AUDIT_RECORD_FACTORY),
    dependencies.transactionIds,
  );
  const commands = new CommandExecutionPipeline(
    new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS),
    [new SaveGeneralSettingsDraftHandler(unitOfWork), new DiscardGeneralSettingsDraftHandler(unitOfWork), new PublishGeneralSettingsHandler(unitOfWork)],
  );

  return Object.freeze({
    ...readRuntime,
    commands: Object.freeze({
      saveGeneralSettingsDraft: (command: SaveGeneralSettingsDraftCommand) => commands.execute<SaveGeneralSettingsDraftCommand, GeneralSettingsDraftSaved>(request, command),
      discardGeneralSettingsDraft: (command: DiscardGeneralSettingsDraftCommand) => commands.execute<DiscardGeneralSettingsDraftCommand, GeneralSettingsDraftDiscarded>(request, command),
      publishGeneralSettings: (command: PublishGeneralSettingsCommand) => commands.execute<PublishGeneralSettingsCommand, GeneralSettingsPublished>(request, command),
    }),
  });
}
