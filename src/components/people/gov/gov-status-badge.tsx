import { CircleSlash, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { GOV_STATUS_META, type GovVerificationStatus } from "@/lib/people/gov-verification";

const ICON: Record<GovVerificationStatus, typeof Clock> = {
  not_provided: CircleSlash,
  pending: Clock,
  verified: CheckCircle2,
  rejected: XCircle,
};

export function GovStatusBadge({ status }: { status: GovVerificationStatus }) {
  const meta = GOV_STATUS_META[status];
  const Icon = ICON[status];
  return (
    <Badge tone={meta.tone} className="gap-1.5">
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}