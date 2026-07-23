"use client";

import Link from "next/link";
import { Building2, Users, Network } from "lucide-react";
import { Card, Badge } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/primitives";
import { fullName } from "@/lib/people/directory-query";
import type { DepartmentView } from "@/lib/people/org-presentation";

function DepartmentCard({ view }: { view: DepartmentView }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{view.name}</h3>
            {view.description ? (
              <p className="truncate text-xs text-muted-foreground">{view.description}</p>
            ) : null}
          </div>
        </div>
        <Badge tone="neutral" className="gap-1">
          <Users className="h-3 w-3" />
          {view.employeeCount}
        </Badge>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Head</div>
        {view.head ? (
          <Link
            href={`/people/${view.head.id}`}
            className="mt-1.5 flex items-center gap-2.5 rounded-md focus-visible:outline-none hover:underline"
          >
            <Avatar name={fullName(view.head)} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {fullName(view.head)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {view.head.employment.positionTitle}
              </span>
            </span>
          </Link>
        ) : (
          <p className="mt-1.5 text-sm italic text-muted-foreground/60">No department head</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <Stat label="Employees" value={view.employeeCount} />
        <Stat label="Active" value={view.activeCount} />
        <Stat label="Teams" value={view.teamCount} icon />
      </div>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: boolean }) {
  return (
    <div>
      <div className="tabular flex items-center justify-center gap-1 text-lg font-semibold text-foreground">
        {icon ? <Network className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function DepartmentDirectory({ views }: { views: DepartmentView[] }) {
  if (views.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No departments found"
        description="No departments match your current search and filters."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {views.map((view) => (
        <DepartmentCard key={view.id} view={view} />
      ))}
    </div>
  );
}