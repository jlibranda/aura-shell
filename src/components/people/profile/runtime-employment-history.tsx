import { History } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { Timeline, type TimelineEntry } from "@/components/ui/timeline";
import type { EmploymentHistoryRow } from "@/platform/people/profile-employment-actions-loader";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function locationLine(row: EmploymentHistoryRow): string | undefined {
  if (!row.locationName) return undefined;
  return row.locationChangedFrom ? `Location changed: ${row.locationChangedFrom} → ${row.locationName}` : `Location: ${row.locationName}`;
}

function toTimelineEntries(rows: readonly EmploymentHistoryRow[]): TimelineEntry[] {
  return rows.map((row) => {
    const lines = [row.managerName ? `Reporting to ${row.managerName}` : undefined, locationLine(row)].filter((line): line is string => Boolean(line));
    return {
      id: row.assignmentId,
      title: row.orgUnitName,
      description: lines.length ? lines.join(" · ") : undefined,
      meta: row.effectiveUntil ? `${formatDate(row.effectiveFrom)} – ${formatDate(row.effectiveUntil)}` : `Since ${formatDate(row.effectiveFrom)}`,
      tone: row.effectiveUntil ? "neutral" : "primary",
    };
  });
}

/** Read-only, effective-dated placement history — no write actions here. */
export function RuntimeEmploymentHistory({ history }: { history: readonly EmploymentHistoryRow[] }) {
  return (
    <ProfileSectionCard title="Employment history" icon={History}>
      <Timeline items={toTimelineEntries(history)} emptyLabel="No employment history recorded yet." />
    </ProfileSectionCard>
  );
}
