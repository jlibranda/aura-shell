"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createDurableConfigurationRuntime } from "@/platform/configuration/durable-configuration-runtime";
import {
  createDiscardGeneralSettingsDraftCommand,
  createPublishGeneralSettingsCommand,
  createSaveGeneralSettingsDraftCommand,
} from "@/platform/configuration/commands/general-settings-commands";
import type { GeneralCompanySettingsRawInput } from "@/platform/configuration/general-company-settings";
import type { CommandResult } from "@/platform/commands/command-result";
import type {
  GeneralSettingsDraftDiscarded,
  GeneralSettingsDraftSaved,
  GeneralSettingsPublished,
} from "@/platform/configuration/commands/general-settings-durable-handlers";

/** The single browser-facing adapter; trusted authority (tenant/actor/permissions) is resolved server-side only. */
export async function saveGeneralSettingsDraftAction(input: {
  payload: GeneralCompanySettingsRawInput;
  versionId?: string;
  expectedUpdatedAt?: string;
  changeReason?: string;
}): Promise<CommandResult<GeneralSettingsDraftSaved>> {
  const request = await resolveRequestContext();
  const command = createSaveGeneralSettingsDraftCommand(input);
  const result = await createDurableConfigurationRuntime(request).commands.saveGeneralSettingsDraft(command);
  if (result.kind === "success") {
    revalidatePath("/settings/general");
    revalidatePath("/settings/general/edit");
    revalidatePath("/settings/general/review");
  }
  return result;
}

export async function discardGeneralSettingsDraftAction(input: { versionId: string; expectedUpdatedAt: string }): Promise<CommandResult<GeneralSettingsDraftDiscarded>> {
  const request = await resolveRequestContext();
  const command = createDiscardGeneralSettingsDraftCommand(input);
  const result = await createDurableConfigurationRuntime(request).commands.discardGeneralSettingsDraft(command);
  if (result.kind === "success") {
    revalidatePath("/settings/general");
    revalidatePath("/settings/general/history");
  }
  return result;
}

export async function publishGeneralSettingsAction(input: {
  versionId: string;
  expectedUpdatedAt: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}): Promise<CommandResult<GeneralSettingsPublished>> {
  const request = await resolveRequestContext();
  const command = createPublishGeneralSettingsCommand(input);
  const result = await createDurableConfigurationRuntime(request).commands.publishGeneralSettings(command);
  if (result.kind === "success") {
    revalidatePath("/settings");
    revalidatePath("/settings/general");
    revalidatePath("/settings/general/history");
  }
  return result;
}
