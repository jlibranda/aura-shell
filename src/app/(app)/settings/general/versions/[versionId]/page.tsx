import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { Badge, Card } from "@/components/ui/primitives";
import { loadGeneralSettingsVersion } from "@/platform/configuration/general-settings-loader";
import { summarizeGeneralCompanySettings, type GeneralCompanySettingsPayload } from "@/platform/configuration/general-company-settings";
import { isScheduled } from "@/platform/configuration/configuration-version";

export const metadata: Metadata = { title: "Settings version" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsVersionPage({ params }: { params: { versionId: string } }) {
  const result = await loadGeneralSettingsVersion(params.versionId);
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view this version." />;
  if (result.kind === "not_found") notFound();

  const { version } = result;
  const fields = summarizeGeneralCompanySettings(version.payload as unknown as GeneralCompanySettingsPayload);
  const scheduled = isScheduled(version, new Date());
  const statusLabel = version.status === "DRAFT" ? "Draft" : version.status === "RETIRED" ? "Retired" : scheduled ? "Scheduled" : "Published";
  const statusTone = version.status === "DRAFT" ? "warning" : version.status === "RETIRED" ? "neutral" : scheduled ? "info" : "success";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Version {version.versionNumber}</h1>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      <Card className="mb-4 p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          {version.effectiveFrom ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Effective from</dt>
              <dd className="mt-0.5 text-sm text-foreground">{new Date(version.effectiveFrom).toLocaleDateString()}</dd>
            </div>
          ) : null}
          {version.effectiveUntil ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Effective until</dt>
              <dd className="mt-0.5 text-sm text-foreground">{new Date(version.effectiveUntil).toLocaleDateString()}</dd>
            </div>
          ) : null}
          {version.publishedBy ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Published by</dt>
              <dd className="mt-0.5 text-sm text-foreground">{version.publishedBy}</dd>
            </div>
          ) : null}
          {version.changeReason ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Change reason</dt>
              <dd className="mt-0.5 text-sm text-foreground">{version.changeReason}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card className="p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd className="mt-0.5 text-sm text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
