"use client";

import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlay";
import { fullName } from "@/lib/people/directory-query";
import type { TeamView } from "@/lib/people/org-presentation";

export function TeamDirectory({ views }: { views: TeamView[] }) {
  const router = useRouter();

  if (views.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No teams found"
        description="No teams match your current search and filters."
      />
    );
  }

  const columns: DataTableColumn<TeamView>[] = [
    {
      key: "name",
      header: "Team",
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
            <Network className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{t.name}</span>
        </div>
      ),
    },
    {
      key: "manager",
      header: "Manager",
      render: (t) =>
        t.manager ? (
          <span className="flex items-center gap-2">
            <Avatar name={fullName(t.manager)} size="sm" />
            <span className="text-foreground">{fullName(t.manager)}</span>
          </span>
        ) : (
          <span className="italic text-muted-foreground/60">Unassigned</span>
        ),
    },
    {
      key: "department",
      header: "Department",
      render: (t) => <span className="text-muted-foreground">{t.departmentName}</span>,
    },
    {
      key: "headcount",
      header: "Headcount",
      align: "right",
      render: (t) => <span className="tabular font-medium text-foreground">{t.headcount}</span>,
    },
  ];

  return (
    <DataTable<TeamView>
      columns={columns}
      data={views}
      getRowId={(t) => t.id}
      onRowClick={(t) => t.manager && router.push(`/people/${t.manager.id}`)}
    />
  );
}