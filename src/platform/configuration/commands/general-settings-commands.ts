import type { ApplicationCommand } from "@/platform/commands/application-command";
import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";
import { validateGeneralCompanySettings, type GeneralCompanySettingsPayload, type GeneralCompanySettingsRawInput } from "@/platform/configuration/general-company-settings";

// Deliberately no tenantId field on any command below: tenant authority is
// resolved exclusively server-side from the verified TrustedRequestContext
// inside each *DurableHandler — the browser has no way to supply, spoof, or
// override it (Scenario 4: browser-supplied tenant ID is ignored/rejected).
export type SaveGeneralSettingsDraftCommand = Readonly<ApplicationCommand<"configuration.general.save_draft"> & {
  payload: GeneralCompanySettingsRawInput;
  /** Set when editing an existing draft; omitted when creating the first draft for the definition. */
  versionId?: string;
  expectedUpdatedAt?: string;
  changeReason?: string;
}>;

export type DiscardGeneralSettingsDraftCommand = Readonly<ApplicationCommand<"configuration.general.discard_draft"> & {
  versionId: string;
  expectedUpdatedAt: string;
}>;

export type PublishGeneralSettingsCommand = Readonly<ApplicationCommand<"configuration.general.publish"> & {
  versionId: string;
  expectedUpdatedAt: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}>;

export function createSaveGeneralSettingsDraftCommand(input: Omit<SaveGeneralSettingsDraftCommand, "type">): SaveGeneralSettingsDraftCommand {
  return Object.freeze({
    type: "configuration.general.save_draft" as const,
    ...input,
    payload: { ...input.payload, ...(input.payload.workingDays ? { workingDays: [...input.payload.workingDays] } : {}) },
  });
}

export function createDiscardGeneralSettingsDraftCommand(input: Omit<DiscardGeneralSettingsDraftCommand, "type">): DiscardGeneralSettingsDraftCommand {
  return Object.freeze({ type: "configuration.general.discard_draft" as const, ...input });
}

export function createPublishGeneralSettingsCommand(input: Omit<PublishGeneralSettingsCommand, "type">): PublishGeneralSettingsCommand {
  return Object.freeze({ type: "configuration.general.publish" as const, ...input });
}

/** Delegates field-level validation to the typed General Company Settings validator. */
export function validateSaveGeneralSettingsDraftCommand(command: SaveGeneralSettingsDraftCommand): ValidationResult<GeneralCompanySettingsPayload> {
  return validateGeneralCompanySettings(command.payload);
}

export function validateDiscardGeneralSettingsDraftCommand(command: DiscardGeneralSettingsDraftCommand): ValidationResult<DiscardGeneralSettingsDraftCommand> {
  const issues = [];
  if (!command.versionId.trim()) issues.push(issue("versionId", "required", "A draft version is required."));
  if (!command.expectedUpdatedAt.trim()) issues.push(issue("expectedUpdatedAt", "required", "The draft's last-known update time is required to discard it safely."));
  return issues.length ? invalid(issues) : valid(command);
}

const isoDateOrDateTime = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/;

export function validatePublishGeneralSettingsCommand(command: PublishGeneralSettingsCommand): ValidationResult<PublishGeneralSettingsCommand> {
  const issues = [];
  if (!command.versionId.trim()) issues.push(issue("versionId", "required", "A draft version is required."));
  if (!command.expectedUpdatedAt.trim()) issues.push(issue("expectedUpdatedAt", "required", "The draft's last-known update time is required to publish it safely."));
  if (!isoDateOrDateTime.test(command.effectiveFrom) || Number.isNaN(Date.parse(command.effectiveFrom))) {
    issues.push(issue("effectiveFrom", "invalid_date", "A valid effective date is required."));
  }
  if (command.effectiveUntil !== undefined) {
    if (!isoDateOrDateTime.test(command.effectiveUntil) || Number.isNaN(Date.parse(command.effectiveUntil))) {
      issues.push(issue("effectiveUntil", "invalid_date", "The end date is invalid."));
    } else if (!Number.isNaN(Date.parse(command.effectiveFrom)) && Date.parse(command.effectiveUntil) <= Date.parse(command.effectiveFrom)) {
      issues.push(issue("effectiveUntil", "invalid_range", "The end date must be after the effective date."));
    }
  }
  return issues.length ? invalid(issues) : valid(command);
}
