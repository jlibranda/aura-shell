import { CheckCircle2, Undo2, HelpCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { AssetStatusView } from "@/lib/people/workspace-presentation";

const CONFIG: Record<AssetStatusView, { label: string; tone: "success" | "neutral" | "danger" | "warning"; icon: typeof CheckCircle2 }> = {
  assigned: { label: "Assigned", tone: "success", icon: CheckCircle2 },
  returned: { label: "Returned", tone: "neutral", icon: Undo2 },
  lost: { label: "Lost", tone: "danger", icon: HelpCircle },
  damaged: { label: "Damaged", tone: "warning", icon: AlertTriangle },
};

export function AssetStatusBadge({ status }: { status: AssetStatusView }) {
  const { label, tone, icon: Icon } = CONFIG[status];
  return (
    <Badge tone={tone} className="gap-1.5">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}