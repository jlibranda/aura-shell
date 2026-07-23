"use client";

import { Briefcase, Building2 } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { ProfileField, ProfileFieldGrid } from "@/components/people/profile/profile-field";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { CompensationSummaryCard } from "@/components/people/profile/compensation-summary-card";
import { ManagerChainCard } from "@/components/people/profile/manager-chain-card";
import { ReportingStructureCard } from "@/components/people/profile/reporting-structure-card";
import { EmploymentHistoryCard } from "@/components/people/profile/employment-history-card";
import { usePeopleRepository } from "@/lib/people/people-repository";
import {
  businessUnit,
  costCenter,
  separationDate,
} from "@/lib/people/employment-presentation";
import { employmentTypeLabel, entityLabel, longDate } from "@/lib/people/format";
import type { Employee } from "@/lib/people/people-types";

export function EmploymentTab({ employee }: { employee: Employee }) {
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);

  const department = departments.find((d) => d.id === employee.employment.departmentId);
  const team = employee.employment.teamId
    ? teams.find((t) => t.id === employee.employment.teamId)
    : undefined;
  const departmentName = department?.name ?? "—";
  const separation = separationDate(employee);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <ProfileSectionCard title="Employment information" icon={Briefcase}>
          <ProfileFieldGrid columns={3}>
            <ProfileField label="Employee number" value={employee.employeeNumber} mono />
            <ProfileField
              label="Employment type"
              value={employmentTypeLabel(employee.employment.employmentType)}
            />
            <ProfileField
              label="Employment status"
              value={<EmployeeStatusBadge status={employee.status} />}
            />
            <ProfileField label="Hire date" value={longDate(employee.employment.hireDate)} />
            <ProfileField
              label="Regularization date"
              value={longDate(employee.employment.regularizationDate)}
              missing={!employee.employment.regularizationDate}
            />
            <ProfileField
              label="Probation end date"
              value={longDate(employee.employment.probationEndDate)}
              missing={!employee.employment.probationEndDate}
            />
            {separation ? (
              <ProfileField label="Separation date" value={longDate(separation)} />
            ) : null}
          </ProfileFieldGrid>
        </ProfileSectionCard>

        <ProfileSectionCard title="Organization" icon={Building2}>
          <ProfileFieldGrid columns={3}>
            <ProfileField label="Entity" value={entityLabel(employee.employment.entityId)} />
            <ProfileField label="Business unit" value={businessUnit(employee)} />
            <ProfileField label="Department" value={department?.name} missing={!department} />
            <ProfileField label="Team" value={team?.name} missing={!team} />
            <ProfileField label="Cost center" value={costCenter(employee, departmentName)} mono />
            <ProfileField label="Work location" value={employee.employment.locationLabel} />
          </ProfileFieldGrid>
        </ProfileSectionCard>

        <ManagerChainCard employee={employee} />

        <EmploymentHistoryCard employee={employee} />
      </div>

      <div className="space-y-5">
        <ReportingStructureCard employee={employee} />
        <CompensationSummaryCard employee={employee} />
      </div>
    </div>
  );
}