import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";

/**
 * Shared scaffold for the modules that ship as placeholders this sprint.
 * Later epics replace the body while keeping the page header consistent.
 */
export function ModulePlaceholder({
  icon: Icon,
  title,
  description,
  points,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <Badge tone="neutral">Coming soon</Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>
      </div>

      <EmptyState
        icon={Icon}
        title={`${title} is being built`}
        description="This module is scaffolded in the AURA shell. Its full experience arrives in a later sprint."
        action={
          <Button variant="secondary">
            <Sparkles className="h-4 w-4" />
            Ask Copilot what&apos;s planned
          </Button>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {points.map((point) => (
          <div
            key={point}
            className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground"
          >
            {point}
          </div>
        ))}
      </div>
    </div>
  );
}
