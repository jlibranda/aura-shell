"use client";

import { HireField } from "@/components/people/hire/hire-field";
import { Input, Textarea } from "@/components/ui/form";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import type { FieldErrors } from "@/lib/people/hire-types";
import { cn } from "@/lib/utils";

const invalidRing = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export function StepEmergency({ errors }: { errors: FieldErrors }) {
  const emergency = useHireDraftStore((s) => s.draft.emergency);
  const setSection = useHireDraftStore((s) => s.setSection);

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        An emergency contact is optional, but if you start filling it in, name, relationship, and
        mobile number become required.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <HireField label="Contact name" error={errors.name}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={emergency.name}
              onChange={(e) => setSection("emergency", { name: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="Maria Dela Cruz"
            />
          )}
        </HireField>

        <HireField label="Relationship" error={errors.relationship}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={emergency.relationship}
              onChange={(e) => setSection("emergency", { relationship: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="Spouse"
            />
          )}
        </HireField>

        <HireField label="Mobile number" error={errors.phone}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={emergency.phone}
              onChange={(e) => setSection("emergency", { phone: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="+63 917 000 0000"
            />
          )}
        </HireField>

        <HireField label="Email" error={errors.email}>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="email"
              value={emergency.email}
              onChange={(e) => setSection("emergency", { email: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="Optional"
            />
          )}
        </HireField>

        <HireField label="Address" error={errors.address} className="sm:col-span-2">
          {({ id }) => (
            <Textarea
              id={id}
              value={emergency.address}
              onChange={(e) => setSection("emergency", { address: e.target.value })}
              placeholder="Optional"
              rows={2}
            />
          )}
        </HireField>
      </div>
    </div>
  );
}