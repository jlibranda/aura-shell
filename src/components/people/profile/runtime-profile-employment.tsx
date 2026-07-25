import { RuntimeProfileField as Field } from "@/components/people/profile/runtime-profile-overview";
import { EmploymentActions } from "@/components/people/profile/employment-actions";
import { RuntimeEmploymentHistory } from "@/components/people/profile/runtime-employment-history";
import { OrganizationPath } from "@/components/shared/organization-path";
import type { ProfileEmploymentViewModel } from "@/platform/people/profile-runtime-loader";
import type { EmploymentActionsViewModel } from "@/platform/people/profile-employment-actions-loader";

export function RuntimeProfileEmployment({
  employment,
  employeeId,
  employeeName,
  employmentActions,
}: {
  employment: ProfileEmploymentViewModel;
  employeeId: string;
  employeeName: string;
  employmentActions: EmploymentActionsViewModel;
}) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="employment-heading" className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 id="employment-heading" className="text-lg font-semibold text-foreground">Employment</h2>
          <EmploymentActions employeeId={employeeId} employeeName={employeeName} actions={employmentActions} />
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Employee number" value={employment.employeeNumber} />
          <Field label="Position" value={employment.position} />
          <Field label="Employment status" value={employment.employmentStatus} />
          <Field label="Legal entity" value={employmentActions.legalEntity ? `${employmentActions.legalEntity.legalName} (${employmentActions.legalEntity.code})` : undefined} />
          <Field label="Hire date" value={employment.hireDate} />
          <Field label="Regularization date" value={employment.regularizationDate} />
          <Field label="Manager" value={employment.manager} />
          <Field label="Location" value={employment.location} />
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Organization</dt>
            <dd className="mt-1">
              <OrganizationPath path={employmentActions.organizationPath} />
            </dd>
          </div>
        </dl>
      </section>

      <RuntimeEmploymentHistory history={employmentActions.history} />
    </div>
  );
}
