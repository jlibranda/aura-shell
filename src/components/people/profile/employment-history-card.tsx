import { History } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { Timeline } from "@/components/ui/timeline";
import { toTimelineEntries } from "@/lib/people/timeline-presentation";
import { employmentHistory } from "@/lib/people/employment-presentation";
import type { Employee } from "@/lib/people/people-types";

export function EmploymentHistoryCard({ employee }: { employee: Employee }) {
  const history = employmentHistory(employee);

  return (
    <ProfileSectionCard title="Employment history" icon={History}>
      <Timeline
        items={toTimelineEntries(history)}
        emptyLabel="No employment history recorded yet."
      />
    </ProfileSectionCard>
  );
}