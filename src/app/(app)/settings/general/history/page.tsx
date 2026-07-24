import type { Metadata } from "next";
import { History as HistoryIcon } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { GeneralSettingsHistoryTimeline } from "@/components/settings/general-settings-history-timeline";
import { loadGeneralSettingsHistory } from "@/platform/configuration/general-settings-loader";

export const metadata: Metadata = { title: "General settings history" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsHistoryPage() {
  const result = await loadGeneralSettingsHistory();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view company settings history." />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Version history</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every draft, publish, and retirement of General Company Settings.</p>
      </div>
      <GeneralSettingsHistoryTimeline versions={result.versions} />
      {result.versions.length === 0 ? (
        <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
          <HistoryIcon className="h-4 w-4" aria-hidden />
          Nothing has been saved yet.
        </div>
      ) : null}
    </div>
  );
}
