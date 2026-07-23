import { RuntimeProfileField as Field } from "@/components/people/profile/runtime-profile-overview";
import type { ProfileWorkInformationViewModel } from "@/platform/people/profile-runtime-loader";

export function RuntimeProfileWorkInformation({
  workInformation,
}: {
  workInformation: ProfileWorkInformationViewModel;
}) {
  return (
    <section aria-labelledby="work-information-heading" className="rounded-xl border border-border bg-surface p-6">
      <h2 id="work-information-heading" className="text-lg font-semibold text-foreground">Work Information</h2>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Employee number" value={workInformation.employeeNumber} />
        <Field label="Position" value={workInformation.position} />
        <Field label="Employment status" value={workInformation.employmentStatus} />
        <Field label="Department" value={workInformation.department} />
        <Field label="Team" value={workInformation.team} />
        <Field label="Manager" value={workInformation.manager} />
        <Field label="Location" value={workInformation.location} />
        <Field label="Hire date" value={workInformation.hireDate} />
        <Field label="Regularization date" value={workInformation.regularizationDate} />
      </dl>
    </section>
  );
}
