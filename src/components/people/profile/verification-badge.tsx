import { CheckCircle2, Clock, AlertTriangle, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { VerificationState } from "@/lib/people/employment-presentation";

const CONFIG: Record<VerificationState, { label: string; tone: "success" | "warning" | "danger" | "neutral"; icon: typeof CheckCircle2 }> = {
  verified: { label: "Verified", tone: "success", icon: CheckCircle2 },
  pending: { label: "Pending", tone: "warning", icon: Clock },
  expired: { label: "Expired", tone: "danger", icon: AlertTriangle },
  missing: { label: "Missing", tone: "neutral", icon: CircleSlash },
};

export function VerificationBadge({ state }: { state: VerificationState }) {
  const { label, tone, icon: Icon } = CONFIG[state];
  return (
    <Badge tone={tone} className="gap-1.5">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}