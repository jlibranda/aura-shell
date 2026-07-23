"use client";

import { HireField } from "@/components/people/hire/hire-field";
import { Input, Textarea } from "@/components/ui/form";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import type { FieldErrors } from "@/lib/people/hire-types";
import { cn } from "@/lib/utils";

const invalidRing = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export function StepContact({ errors }: { errors: FieldErrors }) {
  const contact = useHireDraftStore((s) => s.draft.contact);
  const setSection = useHireDraftStore((s) => s.setSection);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <HireField label="Personal email" error={errors.personalEmail}>
        {({ id, invalid }) => (
          <Input
            id={id}
            type="email"
            value={contact.personalEmail}
            onChange={(e) => setSection("contact", { personalEmail: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="juan@gmail.com"
          />
        )}
      </HireField>

      <HireField label="Work email" required error={errors.workEmail}>
        {({ id, invalid }) => (
          <Input
            id={id}
            type="email"
            value={contact.workEmail}
            onChange={(e) => setSection("contact", { workEmail: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="juan.delacruz@northwind.ph"
          />
        )}
      </HireField>

      <HireField label="Mobile number" required error={errors.phone}>
        {({ id, invalid }) => (
          <Input
            id={id}
            value={contact.phone}
            onChange={(e) => setSection("contact", { phone: e.target.value })}
            className={cn(invalid && invalidRing)}
            placeholder="+63 917 000 0000"
          />
        )}
      </HireField>

      <HireField label="Address" error={errors.address} className="sm:col-span-2">
        {({ id }) => (
          <Textarea
            id={id}
            value={contact.address}
            onChange={(e) => setSection("contact", { address: e.target.value })}
            placeholder="Street, city, province"
            rows={3}
          />
        )}
      </HireField>
    </div>
  );
}