"use client";

import { useId } from "react";
import { Label } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export const invalidRing =
  "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

/** Labeled field with required marker + inline error for action drawers. */
export function ActionField({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (props: { id: string; invalid: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const invalid = Boolean(error);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children({ id, invalid })}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Read-only value row used to show current/unchangeable context in drawers. */
export function ActionReadonly({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/40 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  );
}