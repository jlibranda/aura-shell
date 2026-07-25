import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { AssignmentAdminView } from "@/components/settings/organization/assignment-admin-view";
import { loadAssignmentsAdmin } from "@/platform/organization/admin/assignments-admin-loader";

export const metadata: Metadata = { title: "Assignment diagnostics" };
export const dynamic = "force-dynamic";

export default async function AssignmentsAdminPage() {
  const result = await loadAssignmentsAdmin();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view assignment diagnostics." />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Assignment Diagnostics"
        description="Tenant-wide placement oversight and correction — unassigned employees, placement review, and recovery tools. Day-to-day transfers happen from an employee's own profile."
        backHref="/settings/organization"
      />
      <AssignmentAdminView assignments={result.assignments} unassigned={result.unassigned} employees={result.employees} orgUnits={result.orgUnits} canManage={result.canManage} />
    </div>
  );
}
