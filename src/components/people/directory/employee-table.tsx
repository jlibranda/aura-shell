"use client";

import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PersonCell } from "@/components/people/shared/person-cell";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { EmployeeRowMenu } from "@/components/people/directory/employee-row-menu";
import { usePeopleDirectoryStore, type DirectoryColumnKey } from "@/stores/people-directory-store";
import { fullName } from "@/lib/people/directory-query";
import { shortDate } from "@/lib/utils";
import type { Department, Employee, SortDir, SortKey } from "@/lib/people/people-types";

const SORT_COLUMN_MAP: Record<string, SortKey> = {
  employee: "name",
  employeeNumber: "employeeNumber",
  positionTitle: "positionTitle",
  department: "department",
  status: "status",
  hireDate: "hireDate",
};

export function EmployeeTable({
  employees,
  departmentsById,
  employeesById,
  loading,
  sortKey,
  sortDir,
  onSortChange,
}: {
  employees: Employee[];
  departmentsById: Map<string, Department>;
  employeesById: Map<string, Employee>;
  loading: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
}) {
  const router = useRouter();
  const density = usePeopleDirectoryStore((s) => s.density);
  const hiddenColumns = usePeopleDirectoryStore((s) => s.hiddenColumns);
  const selectedIds = usePeopleDirectoryStore((s) => s.selectedIds);
  const toggleSelected = usePeopleDirectoryStore((s) => s.toggleSelected);
  const setSelected = usePeopleDirectoryStore((s) => s.setSelected);

  const columns: DataTableColumn<Employee>[] = [
    {
      key: "employee",
      header: "Name",
      sortable: true,
      width: "24%",
      render: (e) => (
        <PersonCell employee={e} href={`/people/${e.id}`} secondary="email" />
      ),
    },
    {
      key: "employeeNumber",
      header: "Employee ID",
      sortable: true,
      render: (e) => <span className="tabular text-muted-foreground">{e.employeeNumber}</span>,
    },
    {
      key: "positionTitle",
      header: "Job Title",
      sortable: true,
      render: (e) => <span className="text-foreground">{e.employment.positionTitle}</span>,
    },
    {
      key: "department",
      header: "Department",
      sortable: true,
      render: (e) => (
        <span className="text-muted-foreground">
          {departmentsById.get(e.employment.departmentId)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "manager",
      header: "Manager",
      render: (e) => {
        const mgr = e.employment.managerId ? employeesById.get(e.employment.managerId) : undefined;
        return <span className="text-muted-foreground">{mgr ? fullName(mgr) : "—"}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (e) => <EmployeeStatusBadge status={e.status} />,
    },
    {
      key: "hireDate",
      header: "Hire Date",
      sortable: true,
      align: "right",
      render: (e) => (
        <span className="tabular text-muted-foreground">{shortDate(e.employment.hireDate)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      align: "right",
      render: (e) => <EmployeeRowMenu employee={e} />,
    },
  ];

  const visibleColumns = columns.filter(
    (c) => !hiddenColumns.includes(c.key as DirectoryColumnKey),
  );

  return (
    <DataTable<Employee>
      columns={visibleColumns}
      data={employees}
      getRowId={(e) => e.id}
      loading={loading}
      density={density}
      selectable
      selectedIds={selectedIds}
      onToggleRow={toggleSelected}
      onToggleAll={(ids, allSelected) => {
        if (allSelected) {
          setSelected(selectedIds.filter((id) => !ids.includes(id)));
        } else {
          setSelected(Array.from(new Set([...selectedIds, ...ids])));
        }
      }}
      onRowClick={(e) => router.push(`/people/${e.id}`)}
      sort={{ key: sortKey, dir: sortDir }}
      onSortChange={(s) => {
        const mapped = SORT_COLUMN_MAP[s.key];
        if (mapped) onSortChange(mapped, s.dir);
      }}
    />
  );
}