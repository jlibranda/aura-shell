"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  size?: "sm" | "md";
}

/** Horizontal, scrollable underline tab bar. Consumers render the panels. */
export function Tabs({ items, value, onChange, className, size = "md" }: TabsProps) {
  const height = size === "sm" ? "h-9" : "h-11";
  return (
    <div className={cn("relative border-b border-border", className)}>
      <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist">
        {items.map((item) => {
          const active = item.key === value;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors focus-visible:outline-none",
                height,
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                item.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {item.label}
              {typeof item.count === "number" ? (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                    active
                      ? "bg-primary/12 text-primary"
                      : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
