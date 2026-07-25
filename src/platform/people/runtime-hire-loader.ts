import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { emptyRuntimeHireReferences, type RuntimeHireReferences } from "@/platform/people/runtime-hire-view-model";

/**
 * Server-owned safe reference loader. It never forwards session or tenant
 * context to the browser. Reads directly through createOrganizationAdminRuntime
 * — the same trusted composition the Employment tab's write surface and
 * Settings > Organization admin UI already use — rather than the narrower
 * People-facing OrganizationPlacementService, because hire needs full OrgUnit
 * records (kind, parentId, status) for the hierarchical selector and full
 * Location records (code, status) for the picker, not id-to-display-name
 * lookups.
 */
export async function loadRuntimeHireReferences(): Promise<RuntimeHireReferences> {
  // Resolved outside the try/catch below so an unauthenticated production
  // request's redirect() to /login is never swallowed into empty references.
  const context = await resolveRequestContext();
  try {
    const runtime = createOrganizationAdminRuntime(context);
    const [orgUnits, locations, managers, legalEntities] = await Promise.all([
      runtime.orgUnits.read.listAll(runtime.context),
      runtime.locations.read.listAll(runtime.context),
      runtime.employees.listAll(runtime.context.tenantId),
      runtime.legalEntities.read.listActive(runtime.context),
    ]);
    return {
      orgUnits: orgUnits.filter((unit) => unit.status === "ACTIVE"),
      locations: locations.filter((location) => location.status === "ACTIVE"),
      managers,
      legalEntities,
    };
  } catch { return emptyRuntimeHireReferences(); }
}
