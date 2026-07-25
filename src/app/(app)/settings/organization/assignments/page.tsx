import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { AssignmentAdminView } from "@/components/settings/organization/assignment-admin-view";
import { loadAssignmentsAdmin } from "@/platform/organization/admin/assignments-admin-loader";

export const metadata: Metadata = { title: "Employee assignments" };
export const dynamic = "force-dynamic";

export default async function AssignmentsAdminPage() {
  const result = await loadAssignmentsAdmin();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view employee assignments." />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee Assignments</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Who is placed where, and who reports to whom — effective-dated, one primary placement at a time.</p>
      </div>
      <AssignmentAdminView assignments={result.assignments} unassigned={result.unassigned} employees={result.employees} orgUnits={result.orgUnits} canManage={result.canManage} />
    </div>
  );
}
