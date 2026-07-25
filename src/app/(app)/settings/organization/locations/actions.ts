"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { CommandResult } from "@/platform/commands/command-result";
import type { AddressInput } from "@/platform/organization/location";
import type { LocationArchived, LocationCreated, LocationUpdated } from "@/platform/organization/location-service";

function revalidateLocations() {
  revalidatePath("/settings/organization");
  revalidatePath("/settings/organization/locations");
}

export async function createLocationAction(input: {
  code: string;
  name: string;
  address: AddressInput;
  countryCode: string;
  timezone: string;
}): Promise<CommandResult<LocationCreated>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.locations.service.createLocation(request, input);
  if (result.kind === "success") revalidateLocations();
  return result;
}

export async function updateLocationAction(input: {
  id: string;
  name: string;
  address: AddressInput;
  countryCode: string;
  timezone: string;
}): Promise<CommandResult<LocationUpdated>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.locations.service.updateLocationDetails(request, input);
  if (result.kind === "success") revalidateLocations();
  return result;
}

export async function archiveLocationAction(input: { id: string }): Promise<CommandResult<LocationArchived>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.locations.service.archiveLocation(request, input);
  if (result.kind === "success") revalidateLocations();
  return result;
}
