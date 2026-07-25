import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { buildOrgUnitTree, type OrgUnitRecord, type OrgUnitTreeNode } from "@/platform/organization/org-unit";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

export type OrgUnitsAdminResult =
  | Readonly<{ kind: "ready"; context: TenantContext; tree: OrgUnitTreeNode[]; flat: OrgUnitRecord[]; legalEntities: LegalEntityRecord[]; canManage: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

export async function loadOrgUnitsAdmin(): Promise<OrgUnitsAdminResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const [flat, legalEntities] = await Promise.all([
    runtime.orgUnits.read.listAll(runtime.context),
    runtime.legalEntities.read.listActive(runtime.context),
  ]);
  return {
    kind: "ready",
    context: runtime.context,
    tree: buildOrgUnitTree(flat),
    flat,
    legalEntities,
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
