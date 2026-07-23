"use client";

import { HireField } from "@/components/people/hire/hire-field";
import { Input } from "@/components/ui/form";
import { Select } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import type { FieldErrors } from "@/lib/people/hire-types";
import { cn } from "@/lib/utils";

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const CIVIL_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
];

const invalidRing = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export function StepPersonal({ errors }: { errors: FieldErrors }) {
  const personal = useHireDraftStore((s) => s.draft.personal);
  const setSection = useHireDraftStore((s) => s.setSection);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <HireField label="First name" required error={errors.firstName}>
        {({ id, invalid }) => (
          <Input
            id={id}
            value={personal.firstName}
            onChange={(e) => setSection("personal", { firstName: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="Juan"
          />
        )}
      </HireField>

      <HireField label="Middle name" error={errors.middleName}>
        {({ id }) => (
          <Input
            id={id}
            value={personal.middleName}
            onChange={(e) => setSection("personal", { middleName: e.target.value })}
            placeholder="Optional"
          />
        )}
      </HireField>

      <HireField label="Last name" required error={errors.lastName}>
        {({ id, invalid }) => (
          <Input
            id={id}
            value={personal.lastName}
            onChange={(e) => setSection("personal", { lastName: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="Dela Cruz"
          />
        )}
      </HireField>

      <HireField label="Preferred name" error={errors.preferredName}>
        {({ id }) => (
          <Input
            id={id}
            value={personal.preferredName}
            onChange={(e) => setSection("personal", { preferredName: e.target.value })}
            placeholder="Optional"
          />
        )}
      </HireField>

      <HireField label="Birth date" required error={errors.dateOfBirth}>
        {() => (
          <DatePicker
            value={personal.dateOfBirth}
            onChange={(v) => setSection("personal", { dateOfBirth: v })}
            max={today}
            placeholder="Select birth date"
          />
        )}
      </HireField>

      <HireField label="Gender" required error={errors.gender}>
        {() => (
          <Select
            options={GENDER_OPTIONS}
            value={personal.gender || null}
            onChange={(v) => setSection("personal", { gender: v ?? "" })}
            placeholder="Select gender"
          />
        )}
      </HireField>

      <HireField label="Civil status" required error={errors.maritalStatus}>
        {() => (
          <Select
            options={CIVIL_OPTIONS}
            value={personal.maritalStatus || null}
            onChange={(v) => setSection("personal", { maritalStatus: v ?? "" })}
            placeholder="Select civil status"
          />
        )}
      </HireField>

      <HireField label="Nationality" required error={errors.nationality}>
        {({ id, invalid }) => (
          <Input
            id={id}
            value={personal.nationality}
            onChange={(e) => setSection("personal", { nationality: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="Filipino"
          />
        )}
      </HireField>
    </div>
  );
}