import type { ProfileOverviewViewModel } from "@/platform/people/profile-runtime-loader";

export function RuntimeProfileOverview({
  overview,
}: {
  overview: ProfileOverviewViewModel;
}) {
  return (
    <section aria-labelledby="overview-heading" className="rounded-xl border border-border bg-surface p-6">
      <h2 id="overview-heading" className="text-lg font-semibold text-foreground">Overview</h2>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Employee number" value={overview.employeeNumber} />
        <Field label="Status" value={overview.employmentStatus} />
        <Field label="Position" value={overview.position} />
        <Field label="Location" value={overview.location} />
        <Field label="Hire date" value={overview.hireDate} />
        <Field label="Regularization date" value={overview.regularizationDate} />
      </dl>
    </section>
  );
}

export function RuntimeProfileField({ label, value }: { label: string; value?: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{value || "Not available"}</dd></div>;
}

const Field = RuntimeProfileField;
