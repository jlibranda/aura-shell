"use client";

import { useMemo } from "react";
import { HireField } from "@/components/people/hire/hire-field";
import { Input } from "@/components/ui/form";
import { Combobox, Select, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/people/people-data";
import { ENTITIES } from "@/lib/mock-data";
import type { EmploymentType, FieldErrors, PayFrequency } from "@/lib/people/people-types";

const EMPLOYMENT_TYPE_OPTIONS: ComboboxOption[] = (
  Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]
).map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] }));

const PAY_FREQUENCY_OPTIONS: ComboboxOption[] = [
  { value: "semi_monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

export function StepEmployment({ errors }: { errors: FieldErrors }) {
  const employment = useHireDraftStore((s) => s.draft.employment);
  const setSection = useHireDraftStore((s) => s.setSection);

  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);
  const employees = usePeopleRepository((s) => s.employees);

  const entityOptions: ComboboxOption[] = ENTITIES.map((e) => ({
    value: e.id,
    label: e.name,
    description: e.region,
  }));

  const departmentOptions: ComboboxOption[] = departments.map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const teamOptions: ComboboxOption[] = useMemo(
    () =>
      teams
        .filter((t) => (employment.departmentId ? t.departmentId === employment.departmentId : true))
        .map((t) => ({ value: t.id, label: t.name })),
    [teams, employment.departmentId],
  );

  const managerOptions: ComboboxOption[] = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: fullName(e),
        description: e.employment.positionTitle,
      })),
    [employees],
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <HireField label="Entity" required error={errors.entityId}>
        {() => (
          <Combobox
            options={entityOptions}
            value={employment.entityId || null}
            onChange={(v) => {
              const entity = ENTITIES.find((e) => e.id === v);
              setSection("employment", {
                entityId: v ?? "",
                businessUnit: entity?.name ?? employment.businessUnit,
                locationLabel: employment.locationLabel || (entity?.region ?? ""),
              });
            }}
            placeholder="Select entity"
          />
        )}
      </HireField>

      <HireField label="Business unit" error={errors.businessUnit}>
        {({ id }) => (
          <Input
            id={id}
            value={employment.businessUnit}
            onChange={(e) => setSection("employment", { businessUnit: e.target.value })}
            placeholder="Auto-filled from entity"
          />
        )}
      </HireField>

      <HireField label="Department" required error={errors.departmentId}>
        {() => (
          <Combobox
            options={departmentOptions}
            value={employment.departmentId || null}
            onChange={(v) => setSection("employment", { departmentId: v ?? "", teamId: "" })}
            placeholder="Select department"
          />
        )}
      </HireField>

      <HireField label="Team" error={errors.teamId}>
        {() => (
          <Combobox
            options={teamOptions}
            value={employment.teamId || null}
            onChange={(v) => setSection("employment", { teamId: v ?? "" })}
            placeholder={employment.departmentId ? "Select team" : "Select a department first"}
            disabled={!employment.departmentId}
          />
        )}
      </HireField>

      <HireField label="Position" required error={errors.positionTitle}>
        {({ id }) => (
          <Input
            id={id}
            value={employment.positionTitle}
            onChange={(e) => setSection("employment", { positionTitle: e.target.value })}
            placeholder="Software Engineer"
          />
        )}
      </HireField>

      <HireField label="Manager" error={errors.managerId}>
        {() => (
          <Combobox
            options={managerOptions}
            value={employment.managerId || null}
            onChange={(v) => setSection("employment", { managerId: v ?? "" })}
            placeholder="Select manager"
          />
        )}
      </HireField>

      <HireField label="Employment type" required error={errors.employmentType}>
        {() => (
          <Select
            options={EMPLOYMENT_TYPE_OPTIONS}
            value={employment.employmentType || null}
            onChange={(v) => setSection("employment", { employmentType: (v as EmploymentType) ?? "" })}
            placeholder="Select type"
          />
        )}
      </HireField>

      <HireField label="Hire date" required error={errors.hireDate}>
        {() => (
          <DatePicker
            value={employment.hireDate}
            onChange={(v) => setSection("employment", { hireDate: v })}
            placeholder="Select hire date"
          />
        )}
      </HireField>

      <HireField label="Work location" required error={errors.locationLabel}>
        {({ id }) => (
          <Input
            id={id}
            value={employment.locationLabel}
            onChange={(e) => setSection("employment", { locationLabel: e.target.value })}
            placeholder="Manila HQ"
          />
        )}
      </HireField>

      <HireField label="Pay frequency" error={errors.payFrequency}>
        {() => (
          <Select
            options={PAY_FREQUENCY_OPTIONS}
            value={employment.payFrequency}
            onChange={(v) => setSection("employment", { payFrequency: (v as PayFrequency) ?? "semi_monthly" })}
            placeholder="Select frequency"
          />
        )}
      </HireField>
    </div>
  );
}