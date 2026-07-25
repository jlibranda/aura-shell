import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { OrgUnitAdminView } from "@/components/settings/organization/org-unit-admin-view";
import { loadOrgUnitsAdmin } from "@/platform/organization/admin/org-units-admin-loader";

export const metadata: Metadata = { title: "Organization units" };
export const dynamic = "force-dynamic";

export default async function OrgUnitsAdminPage() {
  const result = await loadOrgUnitsAdmin();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view organization units." />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Organization Units</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">The recursive tree of divisions, business units, departments, branches, and teams.</p>
      </div>
      <OrgUnitAdminView tree={result.tree} flat={result.flat} canManage={result.canManage} />
    </div>
  );
}
