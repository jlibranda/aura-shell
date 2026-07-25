"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasInAppNavigationHistory } from "@/components/shell/route-history-tracker";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  /** Where to navigate when there's no in-app browser history to go back to (deep link, refresh, new tab). */
  fallbackHref: string;
  label?: string;
  /** Overrides the accessible name; defaults to "{label} to previous page". */
  ariaLabel?: string;
  className?: string;
}

/**
 * The canonical page-level back affordance. Prefers real browser history
 * (so tab-to-tab and page-to-page navigation feels like the browser back
 * button) and falls back to the route's logical parent when there's no
 * history to go back to.
 */
export function BackButton({ fallbackHref, label = "Back", ariaLabel, className }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (hasInAppNavigationHistory()) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      aria-label={ariaLabel ?? `${label} to previous page`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
