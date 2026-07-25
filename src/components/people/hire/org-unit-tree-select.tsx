"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { useOutsideClick } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { buildOrgUnitTree, type OrgUnitRecord, type OrgUnitTreeNode } from "@/platform/organization/org-unit";
import { organizationPathKindLabel } from "@/components/shared/organization-path";

export interface OrgUnitTreeSelectProps {
  id?: string;
  orgUnits: readonly OrgUnitRecord[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Pure: the built tree, flattened depth-first for display — root first, each node's own depth (no ancestor-forcing). */
export function flattenOrgUnitTreeForDisplay(nodes: readonly OrgUnitTreeNode[], depth = 0): { node: OrgUnitTreeNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenOrgUnitTreeForDisplay(node.children, depth + 1)]);
}

/**
 * The canonical way AURA lets someone pick an OrgUnit: a searchable tree
 * showing every node's name AND kind (never hardcoding Division/Department/
 * Team — the OrgUnit hierarchy is recursive and any-kind, per ADR-012),
 * reusing the same buildOrgUnitTree the Settings > Organization Units admin
 * view already uses. Legal Entity filtering is intentionally not part of
 * this component (deferred per ADR-012 §5) — it takes whatever OrgUnit list
 * it's given.
 */
export function OrgUnitTreeSelect({ id, orgUnits, value, onChange, placeholder = "Choose an organization unit", disabled }: OrgUnitTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const rows = useMemo(() => flattenOrgUnitTreeForDisplay(buildOrgUnitTree(orgUnits)), [orgUnits]);
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ node }) => node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q));
  }, [rows, query]);

  const selected = orgUnits.find((unit) => unit.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-ring",
        )}
      >
        <span className={cn("truncate text-left", selected ? "text-foreground" : "text-muted-foreground")}>
          {selected ? `${selected.name} (${organizationPathKindLabel(selected.kind)})` : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the popover just opened; focusing the filter is the expected keyboard-first flow */}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search organization units…"
              aria-label="Search organization units"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {value ? (
              <button type="button" onClick={() => { onChange(null); setQuery(""); }} aria-label="Clear selection" className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <ul role="listbox" aria-label="Organization units" className="max-h-64 overflow-y-auto py-1">
            {filteredRows.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No organization units found.</li>
            ) : (
              filteredRows.map(({ node, depth }) => (
                <li key={node.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={node.id === value}
                    onClick={() => { onChange(node.id); setOpen(false); setQuery(""); }}
                    style={{ paddingLeft: `${depth * 16 + 12}px` }}
                    className={cn(
                      "flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm hover:bg-surface-muted",
                      node.id === value ? "bg-primary/5 font-medium text-foreground" : "text-foreground",
                    )}
                  >
                    {depth > 0 ? <span aria-hidden="true" className="text-muted-foreground">└──</span> : null}
                    <span className="truncate">{node.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({organizationPathKindLabel(node.kind)})</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
