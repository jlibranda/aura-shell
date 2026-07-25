import { BackButton } from "@/components/shared/back-button";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Route to fall back to when there's no browser history (see BackButton). Omit on first-level pages, which have nothing to go back to. */
  backHref?: string;
  /** Rendered inline next to the title (e.g. a status Badge). */
  adornment?: React.ReactNode;
  /** Rendered at the end of the header row (e.g. page-level action buttons). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The canonical page-level header: an optional Back button above the title,
 * then title/description/actions. Used on every second-level-and-deeper
 * page so navigation feels the same everywhere in AURA.
 */
export function PageHeader({ title, description, backHref, adornment, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {backHref ? (
        <div className="mb-2">
          <BackButton fallbackHref={backHref} />
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {adornment}
          </div>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
