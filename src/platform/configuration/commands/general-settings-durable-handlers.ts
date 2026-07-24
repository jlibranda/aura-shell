import type { CommandHandler } from "@/platform/commands/application-command";
import { commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import {
  validateDiscardGeneralSettingsDraftCommand,
  validatePublishGeneralSettingsCommand,
  validateSaveGeneralSettingsDraftCommand,
  type DiscardGeneralSettingsDraftCommand,
  type PublishGeneralSettingsCommand,
  type SaveGeneralSettingsDraftCommand,
} from "@/platform/configuration/commands/general-settings-commands";
import {
  GENERAL_COMPANY_SETTINGS_CODE,
  GENERAL_COMPANY_SETTINGS_SCHEMA_VERSION,
  GENERAL_COMPANY_SETTINGS_TYPE,
  warnGeneralCompanySettings,
  type ConfigurationWarning,
} from "@/platform/configuration/general-company-settings";
import type { ConfigurationTransactionRepositories } from "@/platform/configuration/configuration-repository";
import type { ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork } from "@/platform/transactions/unit-of-work";

export type GeneralSettingsDraftSaved = Readonly<{ state: "draft_saved"; version: ConfigurationVersionRecord; warnings: readonly ConfigurationWarning[] }>;
export type GeneralSettingsDraftDiscarded = Readonly<{ state: "draft_discarded"; versionId: string }>;
export type GeneralSettingsPublished = Readonly<{ state: "published"; version: ConfigurationVersionRecord }>;

async function requireGeneralDefinition(
  repositories: ConfigurationTransactionRepositories,
  tenantId: string,
  actorUserId: string,
): Promise<{ id: string }> {
  const existing = await repositories.configuration.findDefinitionByCode(tenantId, GENERAL_COMPANY_SETTINGS_CODE);
  if (existing) return existing;
  return repositories.configuration.createDefinition({
    tenantId,
    type: GENERAL_COMPANY_SETTINGS_TYPE,
    code: GENERAL_COMPANY_SETTINGS_CODE,
    name: "General Company Settings",
    createdBy: actorUserId,
  });
}

/**
 * Trusted-server-only authoritative handler. Creates the tenant's first
 * General Company Settings draft, or edits the existing one — a tenant may
 * only ever have one draft per definition (enforced by the DB's partial
 * unique index as well as this handler's lookup-before-write check).
 */
export class SaveGeneralSettingsDraftHandler implements CommandHandler<SaveGeneralSettingsDraftCommand, GeneralSettingsDraftSaved> {
  readonly commandType = "configuration.general.save_draft" as const;

  constructor(private readonly unitOfWork: UnitOfWork<ConfigurationTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: SaveGeneralSettingsDraftCommand): Promise<CommandResult<GeneralSettingsDraftSaved>> {
    const validation = validateSaveGeneralSettingsDraftCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const warnings = warnGeneralCompanySettings(validation.data);
    const tenantId = request.principal.tenantId;
    const actorUserId = request.principal.userId;

    const result = await this.unitOfWork.execute(
      { tenantId, correlationId: request.correlationId, requestId: request.correlationId, actorUserId, commandName: "SaveGeneralSettingsDraft" },
      async ({ repositories }) => {
        const definition = await requireGeneralDefinition(repositories, tenantId, actorUserId);
        const existingDraft = await repositories.configuration.findDraftVersion(tenantId, definition.id);
        const payload: Readonly<Record<string, unknown>> = { ...validation.data };

        if (command.versionId) {
          if (!existingDraft || existingDraft.id !== command.versionId) return "not_found" as const;
          return repositories.configuration.updateDraftVersion({
            versionId: command.versionId,
            tenantId,
            expectedUpdatedAt: command.expectedUpdatedAt ?? existingDraft.updatedAt,
            payload,
            changeReason: command.changeReason,
          });
        }

        if (existingDraft) return "conflict_existing_draft" as const;
        const versionNumber = await repositories.configuration.nextVersionNumber(tenantId, definition.id);
        return repositories.configuration.createDraftVersion({
          definitionId: definition.id,
          tenantId,
          versionNumber,
          payload,
          schemaVersion: GENERAL_COMPANY_SETTINGS_SCHEMA_VERSION,
          changeReason: command.changeReason,
          createdBy: actorUserId,
        });
      },
    );

    if (result === "not_found") return commandValidationFailure([issue("versionId", "not_found", "This draft no longer exists. Reload the page and try again.")]);
    if (result === "conflict_existing_draft") return commandConflict("A draft already exists for General Company Settings. Edit or discard it before starting a new one.");
    if (result === "stale") return commandConflict("This draft was changed elsewhere. Reload the page to see the latest version before saving again.");
    return commandSuccess(Object.freeze({ state: "draft_saved" as const, version: result, warnings: Object.freeze(warnings) }));
  }
}

/** Trusted-server-only authoritative handler. Deletes a DRAFT version outright; PUBLISHED/RETIRED versions are immutable and cannot be discarded. */
export class DiscardGeneralSettingsDraftHandler implements CommandHandler<DiscardGeneralSettingsDraftCommand, GeneralSettingsDraftDiscarded> {
  readonly commandType = "configuration.general.discard_draft" as const;

  constructor(private readonly unitOfWork: UnitOfWork<ConfigurationTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: DiscardGeneralSettingsDraftCommand): Promise<CommandResult<GeneralSettingsDraftDiscarded>> {
    const validation = validateDiscardGeneralSettingsDraftCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const tenantId = request.principal.tenantId;

    const result = await this.unitOfWork.execute(
      { tenantId, correlationId: request.correlationId, requestId: request.correlationId, actorUserId: request.principal.userId, commandName: "DiscardGeneralSettingsDraft" },
      ({ repositories }) => repositories.configuration.discardDraftVersion(tenantId, command.versionId, command.expectedUpdatedAt),
    );

    if (result === "not_found") return commandValidationFailure([issue("versionId", "not_found", "This draft no longer exists.")]);
    if (result === "stale") return commandConflict("This draft was changed elsewhere. Reload the page before discarding it.");
    return commandSuccess(Object.freeze({ state: "draft_discarded" as const, versionId: command.versionId }));
  }
}

/** Trusted-server-only authoritative handler. Publishing is the only path that ever moves a version out of DRAFT. */
export class PublishGeneralSettingsHandler implements CommandHandler<PublishGeneralSettingsCommand, GeneralSettingsPublished> {
  readonly commandType = "configuration.general.publish" as const;

  constructor(private readonly unitOfWork: UnitOfWork<ConfigurationTransactionRepositories>) {}

  async execute(request: TrustedRequestContext, command: PublishGeneralSettingsCommand): Promise<CommandResult<GeneralSettingsPublished>> {
    const validation = validatePublishGeneralSettingsCommand(command);
    if (!validation.success) return commandValidationFailure(validation.issues);
    const tenantId = request.principal.tenantId;

    const result = await this.unitOfWork.execute(
      { tenantId, correlationId: request.correlationId, requestId: request.correlationId, actorUserId: request.principal.userId, commandName: "PublishGeneralSettings" },
      ({ repositories }) => repositories.configuration.publishVersion({
        versionId: command.versionId,
        tenantId,
        expectedUpdatedAt: command.expectedUpdatedAt,
        effectiveFrom: command.effectiveFrom,
        effectiveUntil: command.effectiveUntil,
        publishedBy: request.principal.userId,
      }),
    );

    if (result === "not_found") return commandValidationFailure([issue("versionId", "not_found", "This draft no longer exists.")]);
    if (result === "stale") return commandConflict("This draft was changed elsewhere. Reload the page before publishing.");
    return commandSuccess(Object.freeze({ state: "published" as const, version: result }));
  }
}
