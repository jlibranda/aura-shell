"use client";

import { useMemo, useState } from "react";
import { Laptop, Search, X } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { AssetStatusBadge } from "@/components/people/profile/asset-status-badge";
import { WorkspaceEmpty } from "@/components/people/profile/workspace-empty";
import { WorkspaceSummaryCard } from "@/components/people/profile/workspace-summary-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useEmployeeEquipment } from "@/lib/people/people-repository";
import {
  toAssetViews,
  type AssetCondition,
  type AssetView,
} from "@/lib/people/workspace-presentation";
import { longDate } from "@/lib/people/format";
import type { Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const CONDITION_STYLE: Record<AssetCondition, string> = {
  excellent: "text-success",
  good: "text-foreground",
  fair: "text-warning",
  poor: "text-danger",
};

function ConditionLabel({ condition }: { condition: AssetCondition }) {
  return (
    <span className={cn("text-sm capitalize", CONDITION_STYLE[condition])}>{condition}</span>
  );
}

export function AssetsTab({ employee }: { employee: Employee }) {
  const equipment = useEmployeeEquipment(employee.id);
  const [term, setTerm] = useState("");

  const assets = useMemo(() => toAssetViews(equipment), [equipment]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.serial?.toLowerCase().includes(q) ?? false),
    );
  }, [assets, term]);

  const columns: DataTableColumn<AssetView>[] = [
    {
      key: "name",
      header: "Asset",
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
            <Laptop className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{a.name}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (a) => <span className="text-muted-foreground">{a.typeLabel}</span> },
    {
      key: "serial",
      header: "Serial number",
      render: (a) =>
        a.serial ? (
          <span className="tabular font-mono text-xs text-muted-foreground">{a.serial}</span>
        ) : (
          <span className="italic text-muted-foreground/60">—</span>
        ),
    },
    {
      key: "assignedAt",
      header: "Assigned",
      render: (a) => <span className="tabular text-muted-foreground">{longDate(a.assignedAt)}</span>,
    },
    { key: "status", header: "Status", render: (a) => <AssetStatusBadge status={a.status} /> },
    {
      key: "condition",
      header: "Condition",
      align: "right",
      render: (a) => <ConditionLabel condition={a.condition} />,
    },
  ];

  if (equipment.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProfileSectionCard title="Assets" icon={Laptop}>
            <WorkspaceEmpty
              icon={Laptop}
              title="No assets assigned"
              description="This employee has no company assets assigned."
            />
          </ProfileSectionCard>
        </div>
        <WorkspaceSummaryCard employee={employee} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by asset name or serial number…"
            aria-label="Search assets"
            className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          {term ? (
            <button
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <DataTable<AssetView>
          columns={columns}
          data={filtered}
          getRowId={(a) => a.id}
          empty={
            <WorkspaceEmpty
              icon={Search}
              title={`No assets match “${term}”`}
              description="Try a different asset name or serial number."
            />
          }
        />
      </div>

      <WorkspaceSummaryCard employee={employee} />
    </div>
  );
}