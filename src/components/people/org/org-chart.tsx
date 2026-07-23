"use client";

import { useMemo, useState } from "react";
import { Network, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { OrgChartNode } from "@/components/people/org/org-chart-node";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { buildOrgTree } from "@/lib/people/org-presentation";

export function OrgChart() {
  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);
  const [treeKey, setTreeKey] = useState(0);
  const [allExpanded, setAllExpanded] = useState(true);

  const tree = useMemo(() => buildOrgTree(employees, departments), [employees, departments]);

  const remount = (expanded: boolean) => {
    setAllExpanded(expanded);
    setTreeKey((k) => k + 1);
  };

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No reporting structure"
        description="There are no employees to build an organization chart from yet."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Click a person to open their profile. Use the arrows to expand or collapse reports.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => remount(true)}>
            <ChevronsUpDown className="h-4 w-4" />
            Expand all
          </Button>
          <Button variant="outline" size="sm" onClick={() => remount(false)}>
            <ChevronsDownUp className="h-4 w-4" />
            Collapse all
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4">
        <div key={treeKey} className="min-w-[36rem] space-y-1">
          {tree.map((node) => (
            <OrgChartNode key={node.employee.id} node={node} defaultExpanded={allExpanded} />
          ))}
        </div>
      </div>
    </div>
  );
}