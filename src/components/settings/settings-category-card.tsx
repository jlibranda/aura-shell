import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";

export type SettingsCategoryCardStatus = "not_configured" | "draft_in_progress" | "configured" | "coming_soon" | "available";

const STATUS_LABEL: Record<SettingsCategoryCardStatus, string> = {
  not_configured: "Not set up yet",
  draft_in_progress: "Draft in progress",
  configured: "Configured",
  coming_soon: "Coming soon",
  available: "Available",
};

const STATUS_TONE: Record<SettingsCategoryCardStatus, "neutral" | "warning" | "success"> = {
  not_configured: "neutral",
  draft_in_progress: "warning",
  configured: "success",
  coming_soon: "neutral",
  available: "success",
};

export function SettingsCategoryCard({
  icon: Icon,
  title,
  description,
  status,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  status: SettingsCategoryCardStatus;
  /** Omit for categories not yet functional — the card renders as a non-interactive placeholder. */
  href?: string;
}) {
  const body = (
    <Card className={href ? "flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-sm" : "flex h-full flex-col gap-3 p-5 opacity-80"}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  );

  if (!href) return <div aria-disabled="true">{body}</div>;
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${title}: ${STATUS_LABEL[status]}`}>
      {body}
    </Link>
  );
}
