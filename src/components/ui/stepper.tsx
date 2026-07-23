"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: Step[];
  current: number; // 0-based index of the active step
  onStepClick?: (index: number) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

/**
 * Progress indicator for multi-step flows (e.g. the hire wizard). Completed
 * steps are optionally navigable; upcoming steps are not.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
  className,
  orientation = "horizontal",
}: StepperProps) {
  const vertical = orientation === "vertical";

  return (
    <ol
      className={cn(
        "flex",
        vertical ? "flex-col gap-4" : "items-center gap-2",
        className,
      )}
    >
      {steps.map((step, index) => {
        const completed = index < current;
        const active = index === current;
        const clickable = Boolean(onStepClick) && completed;
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.key}
            className={cn(
              "flex",
              vertical ? "items-start gap-3" : "flex-1 items-center gap-2",
            )}
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(index)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 text-left focus-visible:outline-none",
                clickable && "cursor-pointer",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  completed && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !completed && !active && "border-border text-muted-foreground",
                )}
              >
                {completed ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    active || completed ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.description ? (
                  <span className="block text-xs text-muted-foreground">
                    {step.description}
                  </span>
                ) : null}
              </span>
            </button>

            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  vertical ? "ml-3.5 h-4 w-px" : "h-px flex-1",
                  index < current ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}