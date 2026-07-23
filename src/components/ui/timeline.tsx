"use client";

import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface TimelineEntry {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  timestamp?: string;
  icon?: LucideIcon;
  tone?: TimelineTone;
}

export interface TimelineProps {
  items: TimelineEntry[];
  className?: string;
  emptyLabel?: string;
}

const TONE_DOT: Record<TimelineTone, string> = {
  neutral: "bg-surface-muted text-muted-foreground ring-border",
  primary: "bg-primary/12 text-primary ring-primary/20",
  success: "bg-success/12 text-success ring-success/20",
  warning: "bg-warning/12 text-warning ring-warning/20",
  danger: "bg-danger/12 text-danger ring-danger/20",
  info: "bg-info/12 text-info ring-info/20",
};

/** Vertical event timeline. Consumers map their domain events to entries. */
export function Timeline({ items, className, emptyLabel = "No activity yet." }: TimelineProps) {
  if (items.length === 0) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className={cn("relative", className)}>
      {items.map((item, index) => {
        const Icon = item.icon ?? Circle;
        const tone = item.tone ?? "neutral";
        const isLast = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                TONE_DOT[tone],
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.timestamp ? (
                  <span className="text-xs text-muted-foreground/80">{item.timestamp}</span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
              ) : null}
              {item.meta ? (
                <p className="mt-0.5 text-xs text-muted-foreground/80">{item.meta}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}