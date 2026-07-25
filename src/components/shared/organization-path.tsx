import { cn } from "@/lib/utils";

/**
 * The canonical way AURA renders "where is this person placed in the
 * organization" — anywhere it's needed (People > Employment, Work
 * Information, Settings > Assignment Diagnostics, and future Payroll,
 * Timekeeping, Leave, Benefits, approvals, Copilot explanations).
 *
 * Purely presentational: it renders exactly the path it's given, root first,
 * the assigned unit last and emphasized. It never queries a repository or
 * Prisma, never derives or re-orders the hierarchy, and never assumes a
 * Division/Department/Team shape — the Organization domain models OrgUnit as
 * a general recursive tree (ADR-012 §5), so this adapts to any depth,
 * including a single node. Callers resolve the path via the existing
 * OrganizationQueryService.resolveOrgPath and pass the result straight in.
 */
export interface OrganizationPathSegment {
  id: string;
  name: string;
}

export interface OrganizationPathProps {
  path: readonly OrganizationPathSegment[];
  emptyLabel?: string;
  className?: string;
}

export function OrganizationPath({ path, emptyLabel = "Not currently assigned", className }: OrganizationPathProps) {
  if (path.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }
  return (
    <ol className={cn("space-y-0.5", className)}>
      {path.map((segment, index) => {
        const isAssignedUnit = index === path.length - 1;
        return (
          <li key={segment.id} className={cn("text-sm", isAssignedUnit ? "font-medium text-foreground" : "text-muted-foreground")}>
            {segment.name}
          </li>
        );
      })}
    </ol>
  );
}
