"use client";

import Link from "next/link";
import { Users2, ArrowDown, UserRound } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { Avatar } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/primitives";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function PersonNode({
  employee,
  roleLabel,
  emphasis = false,
}: {
  employee: Employee;
  roleLabel: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={`/people/${employee.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none",
        emphasis
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-surface hover:bg-surface-muted",
      )}
    >
      <Avatar name={fullName(employee)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{fullName(employee)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {employee.employment.positionTitle}
        </div>
      </div>
      <Badge tone={emphasis ? "primary" : "neutral"}>{roleLabel}</Badge>
    </Link>
  );
}

function MissingNode({ roleLabel }: { roleLabel: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted/30 px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
        <UserRound className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <div className="text-sm italic text-muted-foreground/70">Not assigned</div>
      </div>
      <Badge tone="neutral">{roleLabel}</Badge>
    </div>
  );
}

export function ReportingStructureCard({ employee }: { employee: Employee }) {
  const employees = usePeopleRepository((s) => s.employees);
  const byId = (id?: string) => (id ? employees.find((e) => e.id === id) : undefined);

  const manager = byId(employee.employment.managerId);
  const skipManager = byId(manager?.employment.managerId);

  return (
    <ProfileSectionCard title="Reporting structure" icon={Users2}>
      <div className="space-y-0">
        <PersonNode employee={employee} roleLabel="Employee" emphasis />
        <div className="flex justify-center py-1.5">
          <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
        </div>
        {manager ? (
          <PersonNode employee={manager} roleLabel="Manager" />
        ) : (
          <MissingNode roleLabel="Manager" />
        )}
        <div className="flex justify-center py-1.5">
          <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
        </div>
        {skipManager ? (
          <PersonNode employee={skipManager} roleLabel="Skip-level" />
        ) : (
          <MissingNode roleLabel="Skip-level" />
        )}
      </div>
    </ProfileSectionCard>
  );
}