"use client";

import Link from "next/link";
import { User, Contact, Briefcase, IdCard } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { ProfileField, ProfileFieldGrid } from "@/components/people/profile/profile-field";
import { RecentActivityCard } from "@/components/people/profile/recent-activity-card";
import { StatusDot } from "@/components/ui/primitives";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import {
  civilStatusLabel,
  employmentTypeLabel,
  entityLabel,
  genderLabel,
  govIdLabel,
  longDate,
  maskId,
  personalEmail,
} from "@/lib/people/format";
import type { Employee, GovIdKey } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const GOV_ORDER: GovIdKey[] = ["tin", "sss", "philhealth", "pagibig"];

function GovIdRow({
  label,
  value,
  verified,
}: {
  label: string;
  value: string | null;
  verified: boolean;
}) {
  const present = Boolean(value);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-0.5 text-sm",
            present ? "tabular font-mono text-foreground" : "italic text-muted-foreground/60",
          )}
        >
          {present ? maskId(value) : "Missing"}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        <StatusDot tone={!present ? "danger" : verified ? "success" : "warning"} />
        <span className="text-muted-foreground">
          {!present ? "Missing" : verified ? "Verified" : "Unverified"}
        </span>
      </span>
    </div>
  );
}

export function OverviewTab({ employee }: { employee: Employee }) {
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);
  const manager = usePeopleRepository((s) =>
    employee.employment.managerId
      ? s.employees.find((e) => e.id === employee.employment.managerId)
      : undefined,
  );

  const department = departments.find((d) => d.id === employee.employment.departmentId);
  const team = employee.employment.teamId
    ? teams.find((t) => t.id === employee.employment.teamId)
    : undefined;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <ProfileSectionCard title="Personal information" icon={User}>
          <ProfileFieldGrid columns={3}>
            <ProfileField label="Full name" value={`${employee.personal.firstName} ${employee.personal.middleName ? employee.personal.middleName + " " : ""}${employee.personal.lastName}`} />
            <ProfileField
              label="Preferred name"
              value={employee.personal.preferredName}
              missing={!employee.personal.preferredName}
            />
            <ProfileField label="Birth date" value={longDate(employee.personal.dateOfBirth)} missing={!employee.personal.dateOfBirth} />
            <ProfileField label="Gender" value={genderLabel(employee.personal.gender)} missing={!employee.personal.gender} />
            <ProfileField label="Civil status" value={civilStatusLabel(employee.personal.maritalStatus)} missing={!employee.personal.maritalStatus} />
            <ProfileField label="Nationality" value="Filipino" />
          </ProfileFieldGrid>
        </ProfileSectionCard>

        <ProfileSectionCard title="Contact information" icon={Contact}>
          <ProfileFieldGrid columns={2}>
            <ProfileField label="Personal email" value={personalEmail(employee)} />
            <ProfileField label="Work email" value={employee.personal.email} />
            <ProfileField label="Mobile" value={employee.personal.phone} missing={!employee.personal.phone} />
            <ProfileField label="Address" value={employee.personal.address} missing={!employee.personal.address} />
          </ProfileFieldGrid>
        </ProfileSectionCard>

        <ProfileSectionCard title="Employment summary" icon={Briefcase}>
          <ProfileFieldGrid columns={3}>
            <ProfileField label="Employee ID" value={employee.employeeNumber} mono />
            <ProfileField label="Position" value={employee.employment.positionTitle} />
            <ProfileField label="Department" value={department?.name} missing={!department} />
            <ProfileField
              label="Team"
              value={team?.name}
              missing={!team}
            />
            <ProfileField
              label="Manager"
              value={
                manager ? (
                  <Link href={`/people/${manager.id}`} className="text-foreground hover:underline">
                    {fullName(manager)}
                  </Link>
                ) : undefined
              }
              missing={!manager}
            />
            <ProfileField label="Employment type" value={employmentTypeLabel(employee.employment.employmentType)} />
            <ProfileField label="Entity" value={entityLabel(employee.employment.entityId)} />
            <ProfileField label="Hire date" value={longDate(employee.employment.hireDate)} />
            <ProfileField
              label="Probation end date"
              value={longDate(employee.employment.probationEndDate)}
              missing={!employee.employment.probationEndDate}
            />
          </ProfileFieldGrid>
        </ProfileSectionCard>
      </div>

      <div className="space-y-5">
        <ProfileSectionCard title="Government summary" icon={IdCard}>
          <div className="space-y-2">
            {GOV_ORDER.map((key) => (
              <GovIdRow
                key={key}
                label={govIdLabel(key)}
                value={employee.governmentIds[key].number}
                verified={employee.governmentIds[key].verified}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            IDs are masked, showing only the last four digits.
          </p>
        </ProfileSectionCard>

        <RecentActivityCard events={employee.timeline} />
      </div>
    </div>
  );
}