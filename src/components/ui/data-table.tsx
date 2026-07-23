"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import type { SortDir } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
  headerClassName?: string;
  render: (row: T) => React.ReactNode;
}

export interface DataTableSort {
  key: string;
  dir: SortDir;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  empty?: React.ReactNode;
  density?: "comfortable" | "compact";
  stickyHeader?: boolean;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[], allSelected: boolean) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate) && !checked;
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 rounded border-input text-primary accent-[hsl(var(--primary))] focus-visible:outline-none"
    />
  );
}

function alignClass(align?: "left" | "right" | "center") {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading = false,
  skeletonRows = 8,
  empty,
  density = "comfortable",
  stickyHeader = true,
  sort,
  onSortChange,
  selectable = false,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const cellPad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const rowIds = data.map(getRowId);
  const selectedSet = new Set(selectedIds);
  const selectedOnPage = rowIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = rowIds.length > 0 && selectedOnPage === rowIds.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    const nextDir: SortDir =
      sort?.key === col.key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: col.key, dir: nextDir });
  };

  const showEmpty = !loading && data.length === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead
            className={cn(
              "bg-surface-muted/60 text-muted-foreground",
              stickyHeader && "sticky top-0 z-10",
            )}
          >
            <tr className="border-b border-border">
              {selectable ? (
                <th className={cn("w-10", cellPad)}>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => onToggleAll?.(rowIds, allSelected)}
                    label="Select all rows"
                  />
                </th>
              ) : null}
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      cellPad,
                      alignClass(col.align),
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        onClick={() => handleSort(col)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                          active && "text-foreground",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort?.dir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border last:border-0">
                    {selectable ? (
                      <td className={cellPad}>
                        <Skeleton className="h-4 w-4" />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td key={col.key} className={cellPad}>
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.map((row) => {
                  const id = getRowId(row);
                  const isSelected = selectedSet.has(id);
                  return (
                    <tr
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        onRowClick && "cursor-pointer hover:bg-surface-muted/50",
                        isSelected && "bg-primary/5",
                        rowClassName?.(row),
                      )}
                    >
                      {selectable ? (
                        <td className={cellPad}>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => onToggleRow?.(id)}
                            label={`Select row ${id}`}
                          />
                        </td>
                      ) : null}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(cellPad, alignClass(col.align), col.className)}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {showEmpty ? (
        <div className="p-6">
          {empty ?? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No records to display.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}