import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { LocationRecord } from "@/platform/organization/location";

export type LocationsAdminResult =
  | Readonly<{ kind: "ready"; context: TenantContext; locations: LocationRecord[]; canManage: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

export async function loadLocationsAdmin(): Promise<LocationsAdminResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const locations = await runtime.locations.read.listAll(runtime.context);
  return {
    kind: "ready",
    context: runtime.context,
    locations: [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
