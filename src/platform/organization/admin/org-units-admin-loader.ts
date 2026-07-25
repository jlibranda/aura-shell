import { hasPermission, type TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { buildOrgUnitTree, type OrgUnitRecord, type OrgUnitTreeNode } from "@/platform/organization/org-unit";

export type OrgUnitsAdminResult =
  | Readonly<{ kind: "ready"; context: TenantContext; tree: OrgUnitTreeNode[]; flat: OrgUnitRecord[]; canManage: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

export async function loadOrgUnitsAdmin(): Promise<OrgUnitsAdminResult> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  if (!hasPermission(runtime.context, "organization.view")) return { kind: "unauthorized" };

  const flat = await runtime.orgUnits.read.listAll(runtime.context);
  return {
    kind: "ready",
    context: runtime.context,
    tree: buildOrgUnitTree(flat),
    flat,
    canManage: hasPermission(runtime.context, "organization.manage"),
  };
}
