"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/overlay";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { RuntimeDirectoryBulkToolbar, RuntimeDirectoryRowActions } from "@/components/people/directory/runtime-directory-actions";
import { RuntimeDirectoryFilters, type RuntimeDirectoryFilterValue } from "@/components/people/directory/runtime-directory-filters";
import type { PeopleDirectoryRow, RuntimeDirectoryPage as RuntimeDirectoryPageData } from "@/platform/people/directory-runtime-loader";
import { shortDate } from "@/lib/utils";

export function RuntimeDirectoryPage({ directory, view }: { directory: RuntimeDirectoryPageData; view: "table" | "cards" }) {
  const router = useRouter();
  const [query, setQuery] = useState(directory.query);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const page = Math.floor(directory.offset / directory.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(directory.total / directory.limit));
  const filters: RuntimeDirectoryFilterValue = { status: directory.status, departmentId: directory.departmentId };

  const navigate = (
    nextQuery: string,
    nextPage: number,
    nextFilters: RuntimeDirectoryFilterValue = filters,
    nextView = view,
  ) => {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    params.set("page", String(nextPage));
    params.set("view", nextView);
    if (nextFilters.status.length) params.set("status", nextFilters.status.join(","));
    if (nextFilters.departmentId) params.set("department", nextFilters.departmentId);
    router.push(`/people?${params.toString()}`);
  };

  const onFiltersChange = (patch: Partial<RuntimeDirectoryFilterValue>) =>
    navigate(query, 1, { ...filters, ...patch });

  const toggleSelected = (employeeId: string) =>
    setSelectedIds((ids) => (ids.includes(employeeId) ? ids.filter((id) => id !== employeeId) : [...ids, employeeId]));

  return (
    <div className="mx-auto max-w-[92rem]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">People</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{directory.total} employees</p>
        </div>
        {directory.canCreateEmployee ? (
          <Link
            href="/people/hire"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <UserPlus className="h-4 w-4" />
            Add employee
          </Link>
        ) : null}
      </header>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(query, 1);
        }}
      >
        <input
          aria-label="Search employees"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, ID, email, or title…"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-surface px-3 text-sm"
        />
        <button className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" type="submit">
          Search
        </button>
        <RuntimeDirectoryFilters value={filters} departmentOptions={directory.departmentOptions} onChange={onFiltersChange} />
        <button type="button" onClick={() => navigate(directory.query, 1, filters, view === "table" ? "cards" : "table")}>
          {view === "table" ? "Card view" : "Table view"}
        </button>
      </form>

      {view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Select</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Hire date</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {directory.items.map((employee) => (
                <DirectoryRow key={employee.employeeId} employee={employee} selected={selectedIds.includes(employee.employeeId)} onToggle={toggleSelected} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {directory.items.map((employee) => (
            <DirectoryCard key={employee.employeeId} employee={employee} selected={selectedIds.includes(employee.employeeId)} onToggle={toggleSelected} />
          ))}
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {directory.total === 0
            ? "0 employees"
            : `${directory.offset + 1}–${Math.min(directory.offset + directory.items.length, directory.total)} of ${directory.total}`}
        </span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => navigate(query, page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button disabled={page >= pageCount} onClick={() => navigate(query, page + 1)}>
            Next
          </button>
        </div>
      </footer>

      <RuntimeDirectoryBulkToolbar selectedCount={selectedIds.length} onClear={() => setSelectedIds([])} />
    </div>
  );
}

function DirectoryCard({ employee, selected, onToggle }: { employee: PeopleDirectoryRow; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex justify-between gap-3">
        <Link className="flex min-w-0 items-center gap-3" href={`/people/${employee.employeeId}`}>
          <Avatar name={employee.displayName} size="md" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground">{employee.displayName}</span>
            <span className="block truncate text-sm text-muted-foreground">{employee.position}</span>
          </span>
        </Link>
        <input type="checkbox" aria-label={`Select ${employee.displayName}`} checked={selected} onChange={() => onToggle(employee.employeeId)} />
      </div>
      <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
        <Field label="Employee ID" value={employee.employeeNumber} />
        <Field label="Work email" value={employee.workEmail} />
        <Field label="Department" value={employee.department} />
        <Field label="Manager" value={employee.manager} />
        <Field label="Hired" value={shortDate(employee.hireDate)} />
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <EmployeeStatusBadge status={employee.employmentStatus} />
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-border pt-2">
        <RuntimeDirectoryRowActions employeeId={employee.employeeId} />
      </div>
    </article>
  );
}

function DirectoryRow({ employee, selected, onToggle }: { employee: PeopleDirectoryRow; selected: boolean; onToggle: (id: string) => void }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3">
        <input type="checkbox" aria-label={`Select ${employee.displayName}`} checked={selected} onChange={() => onToggle(employee.employeeId)} />
      </td>
      <td className="px-4 py-3">
        <Link className="flex min-w-0 items-center gap-3" href={`/people/${employee.employeeId}`}>
          <Avatar name={employee.displayName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{employee.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">{employee.workEmail}</span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{employee.employeeNumber}</td>
      <td className="px-4 py-3 text-muted-foreground">{employee.position}</td>
      <td className="px-4 py-3 text-muted-foreground">{employee.department ?? "Not available"}</td>
      <td className="px-4 py-3 text-muted-foreground">{employee.manager ?? "Not available"}</td>
      <td className="px-4 py-3">
        <EmployeeStatusBadge status={employee.employmentStatus} />
      </td>
      <td className="px-4 py-3 text-right tabular text-muted-foreground">{shortDate(employee.hireDate)}</td>
      <td className="px-2 py-2">
        <RuntimeDirectoryRowActions employeeId={employee.employeeId} />
      </td>
    </tr>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{value ?? "Not available"}</dd>
    </div>
  );
}
