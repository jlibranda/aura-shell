import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { Card, EmptyState } from "@/components/ui/primitives";
import { FileEdit } from "lucide-react";
import { GeneralSettingsReviewActions } from "@/components/settings/general-settings-review-actions";
import { loadGeneralSettingsEdit } from "@/platform/configuration/general-settings-loader";
import { summarizeGeneralCompanySettings, warnGeneralCompanySettings, type GeneralCompanySettingsPayload } from "@/platform/configuration/general-company-settings";

export const metadata: Metadata = { title: "Review general settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsReviewPage() {
  const result = await loadGeneralSettingsEdit();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to review company settings." />;

  const { draft } = result;
  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={FileEdit} title="No draft to review" description="There are no unpublished changes right now." action={<Link href="/settings/general" className="text-sm font-medium text-primary hover:underline">Back to General settings</Link>} />
      </div>
    );
  }

  const payload = draft.payload as unknown as GeneralCompanySettingsPayload;
  const fields = summarizeGeneralCompanySettings(payload);
  const warnings = warnGeneralCompanySettings(payload);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Review and publish</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Choose when these changes take effect. Publishing does not affect anything until the effective date arrives.</p>
      </div>

      {warnings.length > 0 ? (
        <Card className="mb-4 space-y-1.5 border-warning/30 bg-warning/5 p-4">
          {warnings.map((warning) => (
            <p key={warning.code} className="text-sm text-warning">{warning.message}</p>
          ))}
        </Card>
      ) : null}

      <Card className="mb-4 p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd className="mt-0.5 text-sm text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <GeneralSettingsReviewActions versionId={draft.id} expectedUpdatedAt={draft.updatedAt} />
    </div>
  );
}
