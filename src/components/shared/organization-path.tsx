import type { OrgUnitKind } from "@/platform/organization/org-unit";
import { cn } from "@/lib/utils";

/**
 * The canonical way AURA renders "where is this person placed in the
 * organization" — anywhere it's needed (People > Employment, Work
 * Information, Settings > Assignment Diagnostics, and future Payroll,
 * Timekeeping, Leave, Benefits, approvals, Copilot explanations).
 *
 * Purely presentational: it renders exactly the path it's given, root first,
 * the assigned unit last and emphasized, each node labeled with its own
 * OrgUnit kind. It never queries a repository or Prisma, never derives kind
 * from depth/position, and never assumes a Division/Department/Team shape —
 * the Organization domain models OrgUnit as a general recursive tree
 * (ADR-012 §5), so this adapts to any depth, including a single node.
 * Callers resolve the path via the existing
 * OrganizationQueryService.resolveOrgPath and pass the result straight in.
 */
export interface OrganizationPathSegment {
  id: string;
  name: string;
  kind: OrgUnitKind;
}

export interface OrganizationPathProps {
  path: readonly OrganizationPathSegment[];
  emptyLabel?: string;
  className?: string;
}

const ORG_UNIT_KIND_LABELS: Record<OrgUnitKind, string> = {
  DIVISION: "Division",
  BUSINESS_UNIT: "Business Unit",
  DEPARTMENT: "Department",
  BRANCH: "Branch",
  TEAM: "Team",
};

/** The OrgUnit kind enum is the source of truth; this only relabels it for display. */
export function organizationPathKindLabel(kind: OrgUnitKind): string {
  return ORG_UNIT_KIND_LABELS[kind];
}

export interface OrganizationPathNode {
  id: string;
  name: string;
  kindLabel: string;
  /** Position in the already-ordered path (0 = root) — display indentation only, never a hierarchy derivation. */
  depth: number;
  isAssignedUnit: boolean;
}

/** Pure: path segments -> render-ready nodes. No hierarchy derivation — depth is just the segment's index in the path resolveOrgPath already ordered root-first. */
export function toOrganizationPathNodes(path: readonly OrganizationPathSegment[]): OrganizationPathNode[] {
  return path.map((segment, index) => ({
    id: segment.id,
    name: segment.name,
    kindLabel: organizationPathKindLabel(segment.kind),
    depth: index,
    isAssignedUnit: index === path.length - 1,
  }));
}

export function OrganizationPath({ path, emptyLabel = "Not currently assigned", className }: OrganizationPathProps) {
  const nodes = toOrganizationPathNodes(path);
  if (nodes.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }
  return (
    <ol className={cn("space-y-0.5", className)} aria-label={`Organization path: ${nodes.map((node) => node.name).join(" > ")}`}>
      {nodes.map((node) => (
        <li key={node.id} style={{ paddingLeft: node.depth * 16 }} className="flex items-baseline gap-1.5 text-sm">
          {node.depth > 0 ? (
            <span aria-hidden="true" className="text-muted-foreground">
              └──
            </span>
          ) : null}
          <span className={node.isAssignedUnit ? "font-medium text-foreground" : "text-muted-foreground"}>{node.name}</span>
          <span className="text-xs text-muted-foreground">({node.kindLabel})</span>
        </li>
      ))}
    </ol>
  );
}
