import { History } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Timeline } from "@/components/ui/timeline";
import { toTimelineEntries } from "@/lib/people/timeline-presentation";
import type { TimelineEvent } from "@/lib/people/people-types";

/** Secondary-sidebar card showing the five most recent lifecycle events. */
export function RecentActivityCard({ events }: { events: TimelineEvent[] }) {
  const recent = [...events]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 5);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
          <History className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent activity</h2>
      </div>
      <Timeline
        items={toTimelineEntries(recent)}
        emptyLabel="No recent activity for this employee."
      />
    </Card>
  );
}