import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Settings2 } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { loadGeneralSettingsView } from "@/platform/configuration/general-settings-loader";
import { summarizeGeneralCompanySettings, type GeneralCompanySettingsPayload } from "@/platform/configuration/general-company-settings";

export const metadata: Metadata = { title: "General settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const result = await loadGeneralSettingsView();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view company settings." />;

  const { effective, draft, nextScheduled, canManage } = result;
  const fields = effective ? summarizeGeneralCompanySettings(effective.payload as unknown as GeneralCompanySettingsPayload) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">General Company Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">The tenant-level defaults future policies (Timekeeping, Payroll, Leave) will inherit from.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/general/history" className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-muted">
            Version history
          </Link>
          {canManage ? (
            <Button asChild>
              <Link href="/settings/general/edit">{draft ? "Continue editing" : effective ? "Edit" : "Start setup"}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {draft ? (
        <Card className="mb-4 flex items-center justify-between gap-3 border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-3">
            <Settings2 className="h-4 w-4 text-warning" aria-hidden />
            <p className="text-sm text-foreground">You have unpublished changes.</p>
          </div>
          {canManage ? (
            <Link href="/settings/general/review" className="text-sm font-medium text-primary hover:underline">
              Review and publish
            </Link>
          ) : null}
        </Card>
      ) : null}

      {nextScheduled ? (
        <Card className="mb-4 flex items-center gap-3 border-info/30 bg-info/5 p-4">
          <CalendarClock className="h-4 w-4 text-info" aria-hidden />
          <p className="text-sm text-foreground">
            A new version is scheduled to take effect on{" "}
            {new Date(nextScheduled.effectiveFrom!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
          </p>
        </Card>
      ) : null}

      {effective ? (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="success">Currently effective</Badge>
            <span className="text-xs text-muted-foreground">
              since {new Date(effective.effectiveFrom!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
                <dd className="mt-0.5 text-sm text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : !draft ? (
        <EmptyState
          icon={Settings2}
          title="No published settings yet"
          description="Complete your company's basic settings before configuring timekeeping and payroll."
          action={canManage ? <Button asChild><Link href="/settings/general/edit">Start setup</Link></Button> : undefined}
        />
      ) : (
        <EmptyState icon={Settings2} title="Nothing published yet" description="Your draft hasn't been published. Review and publish it to make it effective." />
      )}
    </div>
  );
}
