"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { CommandResult } from "@/platform/commands/command-result";
import type { LegalEntityArchived, LegalEntityCreated, LegalEntityUpdated } from "@/platform/organization/legal-entity-service";

function revalidateLegalEntities() {
  revalidatePath("/settings/organization");
  revalidatePath("/settings/organization/legal-entities");
  // A legal entity's active/archived status gates OrgUnit creation and Hire's picker.
  revalidatePath("/settings/organization/org-units");
}

export async function createLegalEntityAction(input: { code: string; legalName: string; countryCode: string }): Promise<CommandResult<LegalEntityCreated>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.legalEntities.service.createLegalEntity(request, input);
  if (result.kind === "success") revalidateLegalEntities();
  return result;
}

export async function updateLegalEntityAction(input: { id: string; legalName: string; countryCode: string }): Promise<CommandResult<LegalEntityUpdated>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.legalEntities.service.updateLegalEntityDetails(request, input);
  if (result.kind === "success") revalidateLegalEntities();
  return result;
}

export async function archiveLegalEntityAction(input: { id: string }): Promise<CommandResult<LegalEntityArchived>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.legalEntities.service.archiveLegalEntity(request, input);
  if (result.kind === "success") revalidateLegalEntities();
  return result;
}
