"use client";

import { CheckCircle2, Circle, FileEdit, XCircle } from "lucide-react";
import { Timeline, type TimelineEntry, type TimelineTone } from "@/components/ui/timeline";
import { isScheduled, type ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";

function describe(version: ConfigurationVersionRecord): { title: string; tone: TimelineTone; icon: typeof CheckCircle2 } {
  if (version.status === "DRAFT") return { title: "Draft", tone: "warning", icon: FileEdit };
  if (version.status === "RETIRED") return { title: "Retired", tone: "neutral", icon: XCircle };
  if (isScheduled(version, new Date())) return { title: "Scheduled", tone: "info", icon: Circle };
  return { title: "Published", tone: "success", icon: CheckCircle2 };
}

/**
 * Client component so icon components (functions) never have to cross the
 * server/client boundary as props — React Server Components cannot pass
 * function references to a "use client" component.
 */
export function GeneralSettingsHistoryTimeline({ versions }: { versions: readonly ConfigurationVersionRecord[] }) {
  const items: TimelineEntry[] = versions.map((version) => {
    const { title, tone, icon } = describe(version);
    const range = version.effectiveFrom
      ? `Effective ${new Date(version.effectiveFrom).toLocaleDateString()}${version.effectiveUntil ? ` – ${new Date(version.effectiveUntil).toLocaleDateString()}` : ""}`
      : undefined;
    return {
      id: version.id,
      title: `Version ${version.versionNumber} — ${title}`,
      description: version.changeReason,
      meta: range,
      timestamp: new Date(version.updatedAt).toLocaleString(),
      tone,
      icon,
    };
  });

  return <Timeline items={items} emptyLabel="No versions yet." />;
}
