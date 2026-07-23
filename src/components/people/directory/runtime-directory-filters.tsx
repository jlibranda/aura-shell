"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { useOutsideClick } from "@/lib/hooks";
import { getStatusMeta } from "@/lib/people/status-machine";
import type { OrganizationReferenceOptionDto } from "@/platform/organization/organization-reference-dtos";
import { PEOPLE_DIRECTORY_FILTERABLE_STATUSES } from "@/platform/people/read-models/people-read-models";

export interface RuntimeDirectoryFilterValue {
  status: string[];
  departmentId?: string;
}

export function activeRuntimeFilterCount(value: RuntimeDirectoryFilterValue): number {
  let count = 0;
  if (value.status.length) count += 1;
  if (value.departmentId) count += 1;
  return count;
}

export function RuntimeDirectoryFilters({
  value,
  departmentOptions,
  onChange,
}: {
  value: RuntimeDirectoryFilterValue;
  departmentOptions: OrganizationReferenceOptionDto[];
  onChange: (patch: Partial<RuntimeDirectoryFilterValue>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const count = activeRuntimeFilterCount(value);

  const statusOptions = useMemo<ComboboxOption[]>(
    () => PEOPLE_DIRECTORY_FILTERABLE_STATUSES.map((status) => ({ value: status, label: getStatusMeta(status).label })),
    [],
  );

  const departmentSelectOptions = useMemo<ComboboxOption[]>(
    () => departmentOptions.map((department) => ({ value: department.id, label: department.displayName })),
    [departmentOptions],
  );

  const clearAll = () => onChange({ status: [], departmentId: undefined });

  return (
    <div className="relative" ref={ref}>
      <Button
        variant={count > 0 ? "secondary" : "outline"}
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Filter className="h-4 w-4" />
        Filters
        {count > 0 ? (
          <span className="tabular ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
            {count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute left-0 z-40 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-overlay animate-scale-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            {count > 0 ? (
              <button
                onClick={clearAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Combobox
                multiple
                options={statusOptions}
                value={value.status}
                onChange={(v) => onChange({ status: v })}
                placeholder="Any status"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Organization unit</Label>
              <Combobox
                options={departmentSelectOptions}
                value={value.departmentId ?? null}
                onChange={(v) => onChange({ departmentId: v ?? undefined })}
                placeholder="Any department"
                clearable
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
