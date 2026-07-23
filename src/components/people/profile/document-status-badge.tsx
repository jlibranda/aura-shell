import { CheckCircle2, AlertTriangle, CircleSlash, Clock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { DocumentStatus } from "@/lib/people/workspace-presentation";

const CONFIG: Record<DocumentStatus | "expiring", { label: string; tone: "success" | "warning" | "danger" | "neutral"; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", tone: "success", icon: CheckCircle2 },
  expiring: { label: "Expiring soon", tone: "warning", icon: Clock },
  expired: { label: "Expired", tone: "danger", icon: AlertTriangle },
  missing: { label: "Missing", tone: "neutral", icon: CircleSlash },
};

export function DocumentStatusBadge({
  status,
  expiring = false,
}: {
  status: DocumentStatus;
  expiring?: boolean;
}) {
  const key = status === "active" && expiring ? "expiring" : status;
  const { label, tone, icon: Icon } = CONFIG[key];
  return (
    <Badge tone={tone} className="gap-1.5">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}