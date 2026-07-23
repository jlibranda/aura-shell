import { RuntimeProfileField as Field } from "@/components/people/profile/runtime-profile-overview";
import type { ProfileEmploymentViewModel } from "@/platform/people/profile-runtime-loader";

export function RuntimeProfileEmployment({ employment }: { employment: ProfileEmploymentViewModel }) {
  return (
    <section aria-labelledby="employment-heading" className="rounded-xl border border-border bg-surface p-6">
      <h2 id="employment-heading" className="text-lg font-semibold text-foreground">Employment</h2>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Employee number" value={employment.employeeNumber} />
        <Field label="Position" value={employment.position} />
        <Field label="Employment status" value={employment.employmentStatus} />
        <Field label="Hire date" value={employment.hireDate} />
        <Field label="Regularization date" value={employment.regularizationDate} />
        <Field label="Department" value={employment.department} />
        <Field label="Team" value={employment.team} />
        <Field label="Manager" value={employment.manager} />
        <Field label="Location" value={employment.location} />
      </dl>
    </section>
  );
}
