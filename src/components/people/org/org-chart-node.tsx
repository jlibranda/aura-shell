"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { Avatar } from "@/components/ui/overlay";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { fullName } from "@/lib/people/directory-query";
import type { OrgNode } from "@/lib/people/org-presentation";
import { cn } from "@/lib/utils";

export function OrgChartNode({
  node,
  depth = 0,
  defaultExpanded = true,
}: {
  node: OrgNode;
  depth?: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2 ? defaultExpanded : false);
  const hasReports = node.reports.length > 0;
  const employee = node.employee;

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-muted",
          depth === 0 && "border-primary/30 bg-primary/5",
        )}
      >
        <button
          onClick={() => hasReports && setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          disabled={!hasReports}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground",
            hasReports ? "hover:bg-border hover:text-foreground" : "opacity-0",
          )}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <Link
          href={`/people/${employee.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline-none"
        >
          <Avatar name={fullName(employee)} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {fullName(employee)}
              </span>
              <EmployeeStatusBadge status={employee.status} />
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {employee.employment.positionTitle} · {node.departmentName}
            </span>
          </span>
        </Link>

        {hasReports ? (
          <span className="tabular flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Users className="h-3 w-3" />
            {node.reports.length}
          </span>
        ) : null}
      </div>

      {hasReports && expanded ? (
        <div className="ml-3 mt-1 space-y-1 border-l border-border pl-4">
          {node.reports.map((child) => (
            <OrgChartNode key={child.employee.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}