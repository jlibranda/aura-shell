"use client";

import {
  Banknote,
  Users,
  Clock,
  CalendarDays,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Activity,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { WidgetCard, StatTile, Badge, StatusDot } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  HEADCOUNT_SERIES,
  LABOR_COST_SERIES,
  COMPLIANCE_DEADLINES,
  RECENT_ACTIVITY,
  AI_INSIGHTS,
  CURRENT_USER,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/* ------------------------------- tiny charts ------------------------------ */

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 100;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark)" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="flex h-10 items-end gap-1">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/70"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
        {value}%
      </span>
    </div>
  );
}

/* -------------------------------- widgets --------------------------------- */

function UpcomingPayrollWidget() {
  return (
    <WidgetCard
      title="Upcoming Payroll"
      icon={Banknote}
      action={<Badge tone="warning">Cutoff Fri</Badge>}
    >
      <div className="space-y-4">
        <StatTile label="Est. net payout" value="₱4.21M" delta="+3.8%" deltaTone="neutral" />
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pay date</span>
            <span className="font-medium text-foreground">Jul 31, 2025</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Employees</span>
            <span className="tabular font-medium text-foreground">214</span>
          </div>
        </div>
        <Button size="sm" variant="secondary" className="w-full">
          Review pay run
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </WidgetCard>
  );
}

function HeadcountWidget() {
  return (
    <WidgetCard title="Headcount" icon={Users}>
      <div className="space-y-3">
        <StatTile label="Active employees" value="214" delta="+8 this qtr" deltaTone="positive" />
        <Sparkline data={HEADCOUNT_SERIES} />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Regular <b className="tabular text-foreground">186</b></span>
          <span>Probationary <b className="tabular text-foreground">22</b></span>
          <span>Contractual <b className="tabular text-foreground">6</b></span>
        </div>
      </div>
    </WidgetCard>
  );
}

function AttendanceWidget() {
  return (
    <WidgetCard title="Attendance" icon={Clock}>
      <div className="flex items-center gap-4">
        <Ring value={94} />
        <div className="flex-1 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <StatusDot tone="success" /> Present
            </span>
            <span className="tabular font-medium text-foreground">201</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <StatusDot tone="warning" /> Late
            </span>
            <span className="tabular font-medium text-foreground">7</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <StatusDot tone="danger" /> Absent
            </span>
            <span className="tabular font-medium text-foreground">6</span>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

function LeaveSummaryWidget() {
  const rows = [
    { label: "Vacation", used: 62, total: 100 },
    { label: "Sick", used: 28, total: 100 },
    { label: "Others", used: 12, total: 100 },
  ];
  return (
    <WidgetCard
      title="Leave Summary"
      icon={CalendarDays}
      action={<span className="text-xs text-muted-foreground">This month</span>}
    >
      <div className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="tabular font-medium text-foreground">{r.used}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${r.used}%` }}
              />
            </div>
          </div>
        ))}
        <div className="pt-1 text-xs text-muted-foreground">
          <b className="text-foreground">4</b> requests pending approval
        </div>
      </div>
    </WidgetCard>
  );
}

function LaborCostWidget() {
  return (
    <WidgetCard
      title="Labor Cost"
      icon={TrendingUp}
      action={<Badge tone="neutral">YTD</Badge>}
      span="2"
    >
      <div className="grid gap-6 sm:grid-cols-[auto,1fr] sm:items-center">
        <div className="space-y-3">
          <StatTile label="This period" value="₱3.90M" delta="+4.8%" deltaTone="neutral" />
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Base <b className="tabular text-foreground">₱3.1M</b></span>
            <span>Overtime <b className="tabular text-foreground">₱0.4M</b></span>
            <span>Statutory <b className="tabular text-foreground">₱0.4M</b></span>
          </div>
        </div>
        <MiniBars data={LABOR_COST_SERIES} />
      </div>
    </WidgetCard>
  );
}

function ComplianceDeadlinesWidget() {
  return (
    <WidgetCard title="Compliance Deadlines" icon={ShieldAlert}>
      <ul className="space-y-2.5">
        {COMPLIANCE_DEADLINES.map((d) => {
          const urgent = d.daysLeft <= 3;
          return (
            <li key={d.agency + d.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-8 w-12 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                  urgent
                    ? "bg-danger/10 text-danger"
                    : "bg-surface-muted text-muted-foreground",
                )}
              >
                {d.agency}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">{d.label}</div>
                <div className="text-xs text-muted-foreground">Due {d.due}</div>
              </div>
              <Badge tone={urgent ? "danger" : "neutral"}>
                {d.daysLeft}d
              </Badge>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

function AIInsightsWidget() {
  return (
    <WidgetCard
      title="AI Insights"
      icon={Sparkles}
      className="aura-glow"
      action={<Badge tone="primary">Copilot</Badge>}
    >
      <div className="space-y-3">
        {AI_INSIGHTS.map((insight) => (
          <div
            key={insight.title}
            className="rounded-lg border border-border/70 bg-surface/70 p-3"
          >
            <div className="flex items-start gap-2">
              <StatusDot
                tone={insight.tone === "attention" ? "warning" : "success"}
                className="mt-1.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{insight.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{insight.detail}</p>
              </div>
            </div>
          </div>
        ))}
        <button className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline">
          Ask a follow-up
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </WidgetCard>
  );
}

function RecentActivityWidget() {
  return (
    <WidgetCard title="Recent Activity" icon={Activity} span="2">
      <ul className="divide-y divide-border">
        {RECENT_ACTIVITY.map((a, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-muted-foreground">
              {a.who === "System" ? "AI" : a.who.split(" ").map((w) => w[0]).join("")}
            </span>
            <p className="flex-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{a.who}</span> {a.action}{" "}
              <span className="font-medium text-foreground">{a.target}</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground/70">{a.time}</span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* ------------------------------- dashboard -------------------------------- */

export function Dashboard() {
  const firstName = CURRENT_USER.name.split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
          Good morning, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what needs your attention across the workforce today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UpcomingPayrollWidget />
        <HeadcountWidget />
        <AttendanceWidget />
        <LaborCostWidget />
        <LeaveSummaryWidget />
        <ComplianceDeadlinesWidget />
        <AIInsightsWidget />
        <RecentActivityWidget />
      </div>
    </div>
  );
}
