"use client";

import { FileText, CalendarClock, Laptop, Contact, StickyNote } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import {
  useEmployee,
  useEmployeeDocuments,
  useEmployeeEquipment,
} from "@/lib/people/people-repository";
import {
  toDocumentView,
  isExpiringSoon,
  toAssetViews,
  isActiveAsset,
} from "@/lib/people/workspace-presentation";
import type { Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function SummaryRow({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md",
            tone === "warning" ? "bg-warning/10 text-warning" : "bg-surface-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      <span
        className={cn(
          "tabular text-sm font-semibold",
          tone === "warning" && value > 0 ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function WorkspaceSummaryCard({ employee }: { employee: Employee }) {
  const live = useEmployee(employee.id) ?? employee;
  const documents = useEmployeeDocuments(employee.id);
  const equipment = useEmployeeEquipment(employee.id);

  const docViews = documents.map(toDocumentView);
  const expiring = docViews.filter(
    (d) => d.status === "expired" || isExpiringSoon(d),
  ).length;

  const assets = toAssetViews(equipment);
  const activeAssets = assets.filter(isActiveAsset).length;

  return (
    <Card className="p-5 lg:sticky lg:top-32">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">Workspace summary</h2>
      <div className="mt-2 divide-y divide-border">
        <SummaryRow icon={FileText} label="Total documents" value={documents.length} />
        <SummaryRow icon={CalendarClock} label="Expiring documents" value={expiring} tone="warning" />
        <SummaryRow icon={Laptop} label="Active assets" value={activeAssets} />
        <SummaryRow icon={Contact} label="Emergency contacts" value={live.emergencyContacts.length} />
        <SummaryRow icon={StickyNote} label="Notes" value={live.notes.length} />
      </div>
    </Card>
  );
}