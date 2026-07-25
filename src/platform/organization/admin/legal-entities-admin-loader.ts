import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

export type LegalEntitiesAdminResult =
  | Readonly<{ kind: "ready"; context: TenantContext; legalEntities: LegalEntityRecord[]; canManage: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

export async function loadLegalEntitiesAdmin(): Promise<LegalEntitiesAdminResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const legalEntities = await runtime.legalEntities.read.listAll(runtime.context);
  return {
    kind: "ready",
    context: runtime.context,
    legalEntities: [...legalEntities].sort((a, b) => a.legalName.localeCompare(b.legalName)),
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
