"use client";

import { useId } from "react";
import { Label } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Labeled field wrapper with required marker and inline error for the wizard. */
export function HireField({
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