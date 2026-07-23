import { ProfileShell } from "@/components/people/profile/profile-shell";
import { RuntimeProfileContactInformation } from "@/components/people/profile/runtime-profile-contact-information";
import { RuntimeProfileOverview } from "@/components/people/profile/runtime-profile-overview";
import { RuntimeProfileWorkInformation } from "@/components/people/profile/runtime-profile-work-information";
import { RuntimeProfileEmployment } from "@/components/people/profile/runtime-profile-employment";
import { RuntimeProfileDeferredTab } from "@/components/people/profile/runtime-profile-deferred-tab";
import type { RuntimeProfilePageResult } from "@/platform/people/profile-runtime-loader";

export type RuntimeProfileActiveTab =
  | "overview"
  | "employment"
  | "work-information"
  | "contact-information"
  | "compensation"
  | "government-ids"
  | "documents"
  | "timeline"
  | "notes"
  | "emergency-contacts"
  | "assets";

export function RuntimeProfilePage({
  result,
  activeTab,
}: {
  result: RuntimeProfilePageResult;
  activeTab: RuntimeProfileActiveTab;
}) {
  if (result.kind !== "ready") return <ProfilePageState kind={result.kind} />;
  return (
    <ProfileShell overview={result.overview}>
      {activeTab === "overview" ? <RuntimeProfileOverview overview={result.overview} /> : null}
      {activeTab === "employment" ? <RuntimeProfileEmployment employment={result.employment} /> : null}
      {activeTab === "work-information" ? <RuntimeProfileWorkInformation workInformation={result.workInformation} /> : null}
      {activeTab === "contact-information" ? <RuntimeProfileContactInformation contactInformation={result.contactInformation} /> : null}
      {isDeferredTab(activeTab) ? <RuntimeProfileDeferredTab title={deferredTabTitle(activeTab)} /> : null}
    </ProfileShell>
  );
}

function isDeferredTab(tab: RuntimeProfileActiveTab): tab is Exclude<RuntimeProfileActiveTab, "overview" | "employment" | "work-information" | "contact-information"> {
  return !["overview", "employment", "work-information", "contact-information"].includes(tab);
}

function deferredTabTitle(tab: Exclude<RuntimeProfileActiveTab, "overview" | "employment" | "work-information" | "contact-information">) {
  return {
    "compensation": "Compensation",
    "government-ids": "Government IDs",
    documents: "Documents",
    timeline: "Timeline",
    notes: "Notes",
    "emergency-contacts": "Emergency Contacts",
    assets: "Assets",
  }[tab];
}

function ProfilePageState({ kind }: { kind: Exclude<RuntimeProfilePageResult["kind"], "ready"> }) {
  const message = kind === "not_found"
    ? "Employee not found."
    : kind === "unauthorized"
      ? "You are not authorized to view this employee."
      : "This profile is temporarily unavailable.";
  return <div className="mx-auto max-w-5xl rounded-xl border border-border bg-surface p-6"><h1 className="text-lg font-semibold text-foreground">Employee profile</h1><p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p></div>;
}
