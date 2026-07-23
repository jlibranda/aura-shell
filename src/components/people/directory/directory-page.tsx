"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DirectoryToolbar } from "@/components/people/directory/directory-toolbar";
import { ActiveFilterChips, activeFilterCount } from "@/components/people/directory/directory-filters";
import { EmployeeTable } from "@/components/people/directory/employee-table";
import { EmployeeCardGrid } from "@/components/people/directory/employee-card";
import { BulkActionBar } from "@/components/people/directory/bulk-action-bar";
import {
  DirectoryEmptyState,
  DirectoryNoSearchResults,
  DirectoryNoFilterResults,
} from "@/components/people/directory/directory-empty-states";
import { Pagination } from "@/components/ui/pagination";
import { useDirectoryQuery } from "@/components/people/directory/use-directory-query";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { usePeopleDirectoryStore } from "@/stores/people-directory-store";
import { applyQuery } from "@/lib/people/directory-query";
import { PAGE_SIZE_OPTIONS } from "@/lib/people/directory-query";
import type { SortDir, SortKey } from "@/lib/people/people-types";

export function DirectoryPage({ runtimeEmployeeCount }: { runtimeEmployeeCount?: number }) {
  const router = useRouter();
  const { query, update, replaceQuery, reset } = useDirectoryQuery();

  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);

  const hydrate = usePeopleDirectoryStore((s) => s.hydrate);
  const clearSelection = usePeopleDirectoryStore((s) => s.clearSelection);

  // Hydrate persisted directory prefs (density, saved views) once on mount.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Clear stale selection whenever the effective query changes.
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.search,
    query.statuses.join(","),
    query.departmentIds.join(","),
    query.teamIds.join(","),
    query.employmentTypes.join(","),
    query.managerId,
    query.entityId,
    query.missingGovId,
    query.hiredFrom,
    query.hiredTo,
    query.page,
    query.pageSize,
  ]);

  const departmentsById = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments],
  );
  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  const result = useMemo(
    () => applyQuery(employees, query, { departments }),
    [employees, query, departments],
  );

  const hasAnyEmployees = employees.length > 0;
  const hasResults = result.rows.length > 0;
  const hasFilters = activeFilterCount(query) > 0;
  const hasSearch = query.search.trim().length > 0;

  const onSortChange = (key: SortKey, dir: SortDir) => update({ sortKey: key, sortDir: dir });

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">People</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {result.filteredTotal === result.total ? (
              <span className="tabular">{runtimeEmployeeCount ?? result.total} employees</span>
            ) : (
              <span className="tabular">
                {result.filteredTotal} of {result.total} employees
              </span>
            )}
          </p>
        </div>
      </div>

      <DirectoryToolbar query={query} onChange={update} onApplyView={replaceQuery} />

      <div className="mt-3">
        <ActiveFilterChips query={query} onChange={update} />
      </div>

      <div className="mt-4">
        {!hasResults ? (
          !hasAnyEmployees ? (
            <DirectoryEmptyState />
          ) : hasSearch ? (
            <DirectoryNoSearchResults term={query.search} onClear={() => update({ search: "" })} />
          ) : hasFilters ? (
            <DirectoryNoFilterResults onClear={reset} />
          ) : (
            <DirectoryEmptyState />
          )
        ) : query.view === "table" ? (
          <EmployeeTable
            employees={result.rows}
            departmentsById={departmentsById}
            employeesById={employeesById}
            loading={false}
            sortKey={query.sortKey}
            sortDir={query.sortDir}
            onSortChange={onSortChange}
          />
        ) : (
          <EmployeeCardGrid
            employees={result.rows}
            departmentsById={departmentsById}
            employeesById={employeesById}
          />
        )}
      </div>

      {hasResults ? (
        <div className="mt-4">
          <Pagination
            page={result.page}
            pageSize={query.pageSize}
            total={result.filteredTotal}
            onPageChange={(page) => update({ page }, { resetPage: false })}
            onPageSizeChange={(size) => update({ pageSize: size })}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </div>
      ) : null}

      <BulkActionBar />
    </div>
  );
}
