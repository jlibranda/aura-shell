"use client";

import { User, Contact, Briefcase, IdCard, Phone, Pencil } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/people/people-data";
import { ENTITIES } from "@/lib/mock-data";
import { longDate, genderLabel, civilStatusLabel } from "@/lib/people/format";
import type { HireStepKey } from "@/lib/people/hire-types";
import type { EmploymentType } from "@/lib/people/people-types";

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  const empty = !value;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={empty ? "text-sm italic text-muted-foreground/60" : "text-sm font-medium text-foreground"}>
        {empty ? "Not provided" : value}
      </span>
    </div>
  );
}

function ReviewSection({
  title,
  icon: Icon,
  step,
  onEdit,
  children,
}: {
  title: string;
  icon: typeof User;
  step: HireStepKey;
  onEdit: (step: HireStepKey) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <button
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

export function StepReview({ onEdit }: { onEdit: (step: HireStepKey) => void }) {
  const draft = useHireDraftStore((s) => s.draft);
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);
  const employees = usePeopleRepository((s) => s.employees);

  const { personal, contact, employment, government, emergency } = draft;
  const department = departments.find((d) => d.id === employment.departmentId);
  const team = teams.find((t) => t.id === employment.teamId);
  const manager = employees.find((e) => e.id === employment.managerId);
  const entity = ENTITIES.find((e) => e.id === employment.entityId);

  const displayName = [personal.firstName, personal.middleName, personal.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <ReviewSection title="Personal information" icon={User} step="personal" onEdit={onEdit}>
        <ReviewRow label="Full name" value={displayName} />
        <ReviewRow label="Preferred name" value={personal.preferredName} />
        <ReviewRow label="Birth date" value={personal.dateOfBirth ? longDate(personal.dateOfBirth) : null} />
        <ReviewRow label="Gender" value={personal.gender ? genderLabel(personal.gender) : null} />
        <ReviewRow label="Civil status" value={personal.maritalStatus ? civilStatusLabel(personal.maritalStatus) : null} />
        <ReviewRow label="Nationality" value={personal.nationality} />
      </ReviewSection>

      <ReviewSection title="Contact information" icon={Contact} step="contact" onEdit={onEdit}>
        <ReviewRow label="Personal email" value={contact.personalEmail} />
        <ReviewRow label="Work email" value={contact.workEmail} />
        <ReviewRow label="Mobile number" value={contact.phone} />
        <ReviewRow label="Address" value={contact.address} />
      </ReviewSection>

      <ReviewSection title="Employment" icon={Briefcase} step="employment" onEdit={onEdit}>
        <ReviewRow label="Entity" value={entity?.name} />
        <ReviewRow label="Business unit" value={employment.businessUnit} />
        <ReviewRow label="Department" value={department?.name} />
        <ReviewRow label="Team" value={team?.name} />
        <ReviewRow label="Position" value={employment.positionTitle} />
        <ReviewRow label="Manager" value={manager ? fullName(manager) : null} />
        <ReviewRow
          label="Employment type"
          value={employment.employmentType ? EMPLOYMENT_TYPE_LABELS[employment.employmentType as EmploymentType] : null}
        />
        <ReviewRow label="Hire date" value={employment.hireDate ? longDate(employment.hireDate) : null} />
        <ReviewRow label="Work location" value={employment.locationLabel} />
      </ReviewSection>

      <ReviewSection title="Government IDs" icon={IdCard} step="government" onEdit={onEdit}>
        <ReviewRow label="TIN" value={government.tin} />
        <ReviewRow label="SSS" value={government.sss} />
        <ReviewRow label="PhilHealth" value={government.philhealth} />
        <ReviewRow label="Pag-IBIG" value={government.pagibig} />
      </ReviewSection>

      <ReviewSection title="Emergency contact" icon={Phone} step="emergency" onEdit={onEdit}>
        <ReviewRow label="Contact name" value={emergency.name} />
        <ReviewRow label="Relationship" value={emergency.relationship} />
        <ReviewRow label="Mobile number" value={emergency.phone} />
        <ReviewRow label="Email" value={emergency.email} />
        <ReviewRow label="Address" value={emergency.address} />
      </ReviewSection>
    </div>
  );
}