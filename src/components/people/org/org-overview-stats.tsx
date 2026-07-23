import { Users, UserCheck, UserCog, Building2, Network, Briefcase } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { OrgSummary } from "@/lib/people/org-presentation";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="tabular text-xl font-semibold tracking-tight text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

export function OrgOverviewStats({ summary }: { summary: OrgSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard icon={Users} label="Total employees" value={summary.totalEmployees} />
      <StatCard icon={UserCheck} label="Active employees" value={summary.activeEmployees} />
      <StatCard icon={UserCog} label="Managers" value={summary.managers} />
      <StatCard icon={Building2} label="Departments" value={summary.departments} />
      <StatCard icon={Network} label="Teams" value={summary.teams} />
      <StatCard icon={Briefcase} label="Open positions" value={summary.openPositions} />
    </div>
  );
}