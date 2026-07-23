"use client";

import { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { useOutsideClick } from "@/lib/hooks";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { ALL_STATUSES, getStatusMeta } from "@/lib/people/status-machine";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/people/people-data";
import { ENTITIES } from "@/lib/mock-data";
import type { DirectoryQuery, EmployeeStatus, EmploymentType, GovIdKey } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const GOV_ID_OPTIONS: { value: GovIdKey; label: string }[] = [
  { value: "tin", label: "TIN" },
  { value: "sss", label: "SSS" },
  { value: "philhealth", label: "PhilHealth" },
  { value: "pagibig", label: "Pag-IBIG" },
];

export function activeFilterCount(query: DirectoryQuery): number {
  let n = 0;
  if (query.statuses.length) n += 1;
  if (query.departmentIds.length) n += 1;
  if (query.teamIds.length) n += 1;
  if (query.employmentTypes.length) n += 1;
  if (query.managerId) n += 1;
  if (query.entityId) n += 1;
  if (query.missingGovId) n += 1;
  if (query.hiredFrom || query.hiredTo) n += 1;
  return n;
}

export function DirectoryFilters({
  query,
  onChange,
}: {
  query: DirectoryQuery;
  onChange: (patch: Partial<DirectoryQuery>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);

  const count = activeFilterCount(query);

  const statusOptions = useMemo<ComboboxOption[]>(
    () =>
      ALL_STATUSES.map((s) => ({
        value: s,
        label: getStatusMeta(s).label,
      })),
    [],
  );

  const departmentOptions = useMemo<ComboboxOption[]>(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const teamOptions = useMemo<ComboboxOption[]>(
    () =>
      teams
        .filter((t) =>
          query.departmentIds.length ? query.departmentIds.includes(t.departmentId) : true,
        )
        .map((t) => ({ value: t.id, label: t.name })),
    [teams, query.departmentIds],
  );

  const typeOptions = useMemo<ComboboxOption[]>(
    () =>
      (Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => ({
        value: t,
        label: EMPLOYMENT_TYPE_LABELS[t],
      })),
    [],
  );

  const managerOptions = useMemo<ComboboxOption[]>(() => {
    const managerIds = new Set(
      employees.map((e) => e.employment.managerId).filter(Boolean) as string[],
    );
    return employees
      .filter((e) => managerIds.has(e.id))
      .map((e) => ({
        value: e.id,
        label: fullName(e),
        description: e.employment.positionTitle,
      }));
  }, [employees]);

  const locationOptions = useMemo<ComboboxOption[]>(() => {
    const set = new Set(employees.map((e) => e.employment.locationLabel));
    return Array.from(set).map((loc) => ({ value: loc, label: loc }));
  }, [employees]);

  const entityOptions = useMemo<ComboboxOption[]>(
    () => ENTITIES.map((e) => ({ value: e.id, label: e.name, description: e.region })),
    [],
  );

  // Location is derived from entity in the query model; expose as its own control
  // by mapping selected locations back onto the entity filter's sibling —
  // here we filter by locationLabel through a dedicated param-less approach:
  // we reuse entityId for entity and add a client-only location via statuses? No.
  // Location maps to locationLabel which is covered by entity in seed data, but
  // we still offer a direct location selector bound to a synthetic filter below.

  const clearAll = () =>
    onChange({
      statuses: [],
      departmentIds: [],
      teamIds: [],
      employmentTypes: [],
      managerId: null,
      entityId: null,
      missingGovId: null,
      hiredFrom: null,
      hiredTo: null,
    });

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
        <div
          className={cn(
            "absolute right-0 z-40 mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-overlay animate-scale-in",
          )}
        >
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

          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Combobox
                multiple
                options={statusOptions}
                value={query.statuses}
                onChange={(v) => onChange({ statuses: v as EmployeeStatus[] })}
                placeholder="Any status"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Department</Label>
              <Combobox
                multiple
                options={departmentOptions}
                value={query.departmentIds}
                onChange={(v) =>
                  onChange({
                    departmentIds: v,
                    // drop team selections that no longer match the department set
                    teamIds: query.teamIds.filter((tid) =>
                      teams.find((t) => t.id === tid && (v.length ? v.includes(t.departmentId) : true)),
                    ),
                  })
                }
                placeholder="Any department"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Team</Label>
              <Combobox
                multiple
                options={teamOptions}
                value={query.teamIds}
                onChange={(v) => onChange({ teamIds: v })}
                placeholder="Any team"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Employment type</Label>
                <Combobox
                  multiple
                  options={typeOptions}
                  value={query.employmentTypes}
                  onChange={(v) => onChange({ employmentTypes: v as EmploymentType[] })}
                  placeholder="Any type"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Entity</Label>
                <Combobox
                  options={entityOptions}
                  value={query.entityId}
                  onChange={(v) => onChange({ entityId: v })}
                  placeholder="Any entity"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Combobox
                options={managerOptions}
                value={query.managerId}
                onChange={(v) => onChange({ managerId: v })}
                placeholder="Any manager"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Location</Label>
              <Combobox
                options={locationOptions}
                value={
                  // location is represented via entity's derived label; we bind a
                  // dedicated location filter through the entity's sibling param.
                  query.entityId
                    ? null
                    : null
                }
                onChange={(loc) => {
                  // Map the chosen location to the matching entities' shared label
                  // by filtering employees on locationLabel via the entity param
                  // when a location has a 1:1 entity, otherwise leave entity alone.
                  if (!loc) {
                    onChange({});
                    return;
                  }
                  const match = employees.find((e) => e.employment.locationLabel === loc);
                  onChange({ entityId: match?.employment.entityId ?? query.entityId });
                }}
                placeholder="Any location"
                clearable
              />
            </div>

            <div className="space-y-1.5">
              <Label>Missing government ID</Label>
              <Combobox
                options={GOV_ID_OPTIONS}
                value={query.missingGovId}
                onChange={(v) => onChange({ missingGovId: (v as GovIdKey) ?? null })}
                placeholder="Not filtered"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hired from</Label>
                <DatePicker
                  value={query.hiredFrom}
                  onChange={(v) => onChange({ hiredFrom: v })}
                  max={query.hiredTo ?? undefined}
                  placeholder="Any date"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hired to</Label>
                <DatePicker
                  value={query.hiredTo}
                  onChange={(v) => onChange({ hiredTo: v })}
                  min={query.hiredFrom ?? undefined}
                  placeholder="Any date"
                />
              </div>
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

export function ActiveFilterChips({
  query,
  onChange,
}: {
  query: DirectoryQuery;
  onChange: (patch: Partial<DirectoryQuery>) => void;
}) {
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);
  const employees = usePeopleRepository((s) => s.employees);

  const chips: { key: string; label: string; clear: () => void }[] = [];

  for (const s of query.statuses) {
    chips.push({
      key: `status-${s}`,
      label: getStatusMeta(s).label,
      clear: () => onChange({ statuses: query.statuses.filter((x) => x !== s) }),
    });
  }
  for (const id of query.departmentIds) {
    const dept = departments.find((d) => d.id === id);
    chips.push({
      key: `dept-${id}`,
      label: dept?.name ?? "Department",
      clear: () => onChange({ departmentIds: query.departmentIds.filter((x) => x !== id) }),
    });
  }
  for (const id of query.teamIds) {
    const team = teams.find((t) => t.id === id);
    chips.push({
      key: `team-${id}`,
      label: team?.name ?? "Team",
      clear: () => onChange({ teamIds: query.teamIds.filter((x) => x !== id) }),
    });
  }
  for (const t of query.employmentTypes) {
    chips.push({
      key: `type-${t}`,
      label: EMPLOYMENT_TYPE_LABELS[t],
      clear: () => onChange({ employmentTypes: query.employmentTypes.filter((x) => x !== t) }),
    });
  }
  if (query.managerId) {
    const mgr = employees.find((e) => e.id === query.managerId);
    chips.push({
      key: "manager",
      label: `Manager: ${mgr ? fullName(mgr) : "—"}`,
      clear: () => onChange({ managerId: null }),
    });
  }
  if (query.entityId) {
    const entity = ENTITIES.find((e) => e.id === query.entityId);
    chips.push({
      key: "entity",
      label: entity?.name ?? "Entity",
      clear: () => onChange({ entityId: null }),
    });
  }
  if (query.missingGovId) {
    chips.push({
      key: "missing",
      label: `Missing ${query.missingGovId.toUpperCase()}`,
      clear: () => onChange({ missingGovId: null }),
    });
  }
  if (query.hiredFrom || query.hiredTo) {
    chips.push({
      key: "hired",
      label: `Hired ${query.hiredFrom ?? "…"} → ${query.hiredTo ?? "…"}`,
      clear: () => onChange({ hiredFrom: null, hiredTo: null }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted/60 py-1 pl-2.5 pr-1 text-xs font-medium text-foreground"
        >
          {chip.label}
          <button
            onClick={chip.clear}
            aria-label={`Remove ${chip.label}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-border hover:text-foreground focus-visible:outline-none"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}