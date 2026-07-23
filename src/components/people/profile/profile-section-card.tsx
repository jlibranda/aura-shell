import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Titled card used for each grouped section of the profile. */
export function ProfileSectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}