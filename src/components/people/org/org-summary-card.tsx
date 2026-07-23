import { Users, UserCog, Building2, Network, Gauge } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { OrgSummary } from "@/lib/people/org-presentation";
import { cn } from "@/lib/utils";

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      <span className="tabular text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function OrgSummaryCard({ summary, className }: { summary: OrgSummary; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">Organization summary</h2>
      <div className="mt-2 divide-y divide-border">
        <SummaryRow icon={Users} label="Total employees" value={summary.totalEmployees} />
        <SummaryRow icon={UserCog} label="Managers" value={summary.managers} />
        <SummaryRow icon={Building2} label="Departments" value={summary.departments} />
        <SummaryRow icon={Network} label="Teams" value={summary.teams} />
        <SummaryRow icon={Gauge} label="Average team size" value={summary.averageTeamSize} />
      </div>
    </Card>
  );
}