"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  LayoutGrid,
  List,
  UserPlus,
  Rows3,
  Rows4,
  ArrowUpDown,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, MenuItem, MenuLabel, Tooltip } from "@/components/ui/overlay";
import { DirectoryFilters } from "@/components/people/directory/directory-filters";
import { SavedViewsMenu } from "@/components/people/directory/saved-views-menu";
import { usePeopleDirectoryStore } from "@/stores/people-directory-store";
import { SORT_KEYS } from "@/lib/people/directory-query";
import type { DirectoryQuery, SortKey, ViewMode } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  employeeNumber: "Employee ID",
  positionTitle: "Job title",
  department: "Department",
  status: "Status",
  hireDate: "Hire date",
};

export function DirectoryToolbar({
  query,
  onChange,
  onApplyView,
}: {
  query: DirectoryQuery;
  onChange: (patch: Partial<DirectoryQuery>) => void;
  onApplyView: (patch: Partial<DirectoryQuery>) => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(query.search);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const density = usePeopleDirectoryStore((s) => s.density);
  const setDensity = usePeopleDirectoryStore((s) => s.setDensity);

  // Keep the input in sync when the query changes externally (e.g. saved view).
  useEffect(() => {
    setTerm(query.search);
  }, [query.search]);

  const onSearchChange = (value: string) => {
    setTerm(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onChange({ search: value }), 250);
  };

  const setView = (view: ViewMode) => onChange({ view });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, ID, email, or title…"
            aria-label="Search employees"
            className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          {term ? (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewsMenu query={query} onApply={onApplyView} />
          <DirectoryFilters query={query} onChange={onChange} />

          {/* Sort */}
          <DropdownMenu
            width="w-52"
            trigger={({ open, toggle }) => (
              <Button variant="outline" size="sm" onClick={toggle} aria-expanded={open}>
                <ArrowUpDown className="h-4 w-4" />
                Sort
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Sort by</MenuLabel>
                {SORT_KEYS.map((key) => (
                  <MenuItem
                    key={key}
                    onClick={() => {
                      onChange({ sortKey: key });
                      close();
                    }}
                    trailing={
                      query.sortKey === key ? (
                        <span className="text-xs text-primary">
                          {query.sortDir === "asc" ? "A–Z" : "Z–A"}
                        </span>
                      ) : null
                    }
                  >
                    {SORT_LABELS[key]}
                  </MenuItem>
                ))}
                <MenuLabel>Direction</MenuLabel>
                <MenuItem
                  onClick={() => {
                    onChange({ sortDir: "asc" });
                    close();
                  }}
                  trailing={query.sortDir === "asc" ? <span className="text-xs text-primary">✓</span> : null}
                >
                  Ascending
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onChange({ sortDir: "desc" });
                    close();
                  }}
                  trailing={query.sortDir === "desc" ? <span className="text-xs text-primary">✓</span> : null}
                >
                  Descending
                </MenuItem>
              </>
            )}
          </DropdownMenu>

          {/* Density (table only) */}
          {query.view === "table" ? (
            <Tooltip label={density === "comfortable" ? "Compact rows" : "Comfortable rows"} side="bottom">
              <IconButton
                label="Toggle row density"
                variant="outline"
                onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
              >
                {density === "comfortable" ? (
                  <Rows3 className="h-4 w-4" />
                ) : (
                  <Rows4 className="h-4 w-4" />
                )}
              </IconButton>
            </Tooltip>
          ) : null}

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              aria-pressed={query.view === "table"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:outline-none",
                query.view === "table"
                  ? "bg-surface-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("cards")}
              aria-label="Card view"
              aria-pressed={query.view === "cards"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:outline-none",
                query.view === "cards"
                  ? "bg-surface-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <Button size="sm" onClick={() => router.push("/people/new")}>
            <UserPlus className="h-4 w-4" />
            Add employee
          </Button>
        </div>
      </div>
    </div>
  );
}