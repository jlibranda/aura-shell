"use client";

import { Search, X } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { ALL_STATUSES, getStatusMeta } from "@/lib/people/status-machine";
import { ENTITIES } from "@/lib/mock-data";
import type { OrgFilter } from "@/lib/people/org-presentation";
import type { EmployeeStatus } from "@/lib/people/people-types";

export function OrgFilters({
  filter,
  onChange,
  searchPlaceholder = "Search departments, teams, managers, or employees…",
}: {
  filter: OrgFilter;
  onChange: (patch: Partial<OrgFilter>) => void;
  searchPlaceholder?: string;
}) {
  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);

  const departmentOptions: ComboboxOption[] = departments.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  const entityOptions: ComboboxOption[] = ENTITIES.map((e) => ({
    value: e.id,
    label: e.name,
    description: e.region,
  }));
  const managerIds = new Set(
    employees.map((e) => e.employment.managerId).filter(Boolean) as string[],
  );
  const managerOptions: ComboboxOption[] = employees
    .filter((e) => managerIds.has(e.id))
    .map((e) => ({ value: e.id, label: fullName(e), description: e.employment.positionTitle }));
  const statusOptions: ComboboxOption[] = ALL_STATUSES.map((s) => ({
    value: s,
    label: getStatusMeta(s).label,
  }));

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder={searchPlaceholder}
          aria-label="Search organization"
          className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        />
        {filter.search ? (
          <button
            onClick={() => onChange({ search: "" })}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          options={departmentOptions}
          value={filter.departmentId}
          onChange={(v) => onChange({ departmentId: v })}
          placeholder="Department"
          width="w-44"
        />
        <Combobox
          options={entityOptions}
          value={filter.entityId}
          onChange={(v) => onChange({ entityId: v })}
          placeholder="Entity"
          width="w-44"
        />
        <Combobox
          options={managerOptions}
          value={filter.managerId}
          onChange={(v) => onChange({ managerId: v })}
          placeholder="Manager"
          width="w-44"
        />
        <Combobox
          options={statusOptions}
          value={filter.status}
          onChange={(v) => onChange({ status: (v as EmployeeStatus) ?? null })}
          placeholder="Status"
          width="w-40"
        />
      </div>
    </div>
  );
}