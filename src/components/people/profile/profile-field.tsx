import { cn } from "@/lib/utils";

/**
 * A single label/value pair used throughout the profile read views.
 * `missing` renders a muted "Not provided" hint so optional-info gaps read as
 * intentional rather than broken.
 */
export function ProfileField({
  label,
  value,
  mono,
  missing,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  missing?: boolean;
  className?: string;
}) {
  const isEmpty =
    missing || value === undefined || value === null || value === "" || value === "—";

  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm",
          isEmpty ? "text-muted-foreground/60 italic" : "text-foreground",
          mono && !isEmpty && "tabular font-mono",
        )}
      >
        {isEmpty ? "Not provided" : value}
      </dd>
    </div>
  );
}

/** Grid wrapper for ProfileField rows inside a section card. */
export function ProfileFieldGrid({
  columns = 2,
  children,
}: {
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const cols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";
  return <dl className={cn("grid gap-x-6 gap-y-4", cols)}>{children}</dl>;
}