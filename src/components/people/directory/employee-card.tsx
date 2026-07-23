"use client";

import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlay";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { EmployeeRowMenu } from "@/components/people/directory/employee-row-menu";
import { usePeopleDirectoryStore } from "@/stores/people-directory-store";
import { fullName } from "@/lib/people/directory-query";
import { shortDate } from "@/lib/utils";
import type { Department, Employee } from "@/lib/people/people-types";

export function EmployeeCard({
  employee,
  departmentName,
  managerName,
  selected,
  onToggle,
}: {
  employee: Employee;
  departmentName: string;
  managerName: string | null;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const name = fullName(employee);
  const href = `/people/${employee.id}`;

  return (
    <Card className="group relative flex flex-col p-4 transition-shadow duration-200 hover:shadow-sm">
      <div className="absolute left-3 top-3 z-10">
        <input
          type="checkbox"
          aria-label={`Select ${name}`}
          checked={selected}
          onChange={() => onToggle(employee.id)}
          className="h-4 w-4 rounded border-input text-primary accent-[hsl(var(--primary))] opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[checked=true]:opacity-100"
          data-checked={selected}
        />
      </div>
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <EmployeeRowMenu employee={employee} />
      </div>

      <Link href={href} className="flex flex-col items-center pt-3 text-center focus-visible:outline-none">
        <Avatar name={name} size="lg" />
        <span className="mt-3 block w-full truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        <span className="mt-0.5 block w-full truncate text-xs text-muted-foreground">
          {employee.employment.positionTitle}
        </span>
      </Link>

      <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
        <Row label="Department" value={departmentName} />
        <Row label="Manager" value={managerName ?? "—"} />
        <Row label="Hired" value={shortDate(employee.employment.hireDate)} />
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-muted-foreground">Status</span>
          <EmployeeStatusBadge status={employee.status} />
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

export function EmployeeCardGrid({
  employees,
  departmentsById,
  employeesById,
}: {
  employees: Employee[];
  departmentsById: Map<string, Department>;
  employeesById: Map<string, Employee>;
}) {
  const isSelected = usePeopleDirectoryStore((s) => s.isSelected);
  const toggleSelected = usePeopleDirectoryStore((s) => s.toggleSelected);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {employees.map((employee) => {
        const manager = employee.employment.managerId
          ? employeesById.get(employee.employment.managerId)
          : undefined;
        return (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            departmentName={departmentsById.get(employee.employment.departmentId)?.name ?? "—"}
            managerName={manager ? fullName(manager) : null}
            selected={isSelected(employee.id)}
            onToggle={toggleSelected}
          />
        );
      })}
    </div>
  );
}