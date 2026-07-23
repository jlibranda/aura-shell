import { Badge, StatusDot } from "@/components/ui/primitives";
import { getStatusMeta } from "@/lib/people/status-machine";
import type { EmployeeStatus } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";
import type { PeopleEmploymentStatus } from "@/platform/people/read-models/people-read-models";

export function EmployeeStatusBadge({
  status,
  className,
}: {
  status: EmployeeStatus | PeopleEmploymentStatus;
  className?: string;
}) {
  const meta = status === "not_available"
    ? { label: "Not available", tone: "neutral" as const }
    : getStatusMeta(status);
  return (
    <Badge tone={meta.tone} className={cn("gap-1.5", className)}>
      <StatusDot tone={meta.tone} />
      {meta.label}
    </Badge>
  );
}
