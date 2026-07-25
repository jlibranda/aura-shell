"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { CommandResult } from "@/platform/commands/command-result";
import type { OrgUnitArchived, OrgUnitCreated, OrgUnitMoved, OrgUnitRenamed } from "@/platform/organization/org-unit-service";

function revalidateOrgUnits() {
  revalidatePath("/settings/organization");
  revalidatePath("/settings/organization/org-units");
}

export async function createOrgUnitAction(input: { legalEntityId: string; code: string; name: string; kind: string; parentId?: string }): Promise<CommandResult<OrgUnitCreated>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.orgUnits.service.createOrgUnit(request, input);
  if (result.kind === "success") revalidateOrgUnits();
  return result;
}

export async function renameOrgUnitAction(input: { id: string; name: string }): Promise<CommandResult<OrgUnitRenamed>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.orgUnits.service.renameOrgUnit(request, input);
  if (result.kind === "success") revalidateOrgUnits();
  return result;
}

export async function moveOrgUnitAction(input: { id: string; parentId: string | null }): Promise<CommandResult<OrgUnitMoved>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.orgUnits.service.moveOrgUnit(request, input);
  if (result.kind === "success") revalidateOrgUnits();
  return result;
}

export async function archiveOrgUnitAction(input: { id: string }): Promise<CommandResult<OrgUnitArchived>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.orgUnits.service.archiveOrgUnit(request, input);
  if (result.kind === "success") revalidateOrgUnits();
  return result;
}
