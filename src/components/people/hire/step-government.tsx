"use client";

import { HireField } from "@/components/people/hire/hire-field";
import { Input } from "@/components/ui/form";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import type { FieldErrors } from "@/lib/people/hire-types";
import { cn } from "@/lib/utils";

const invalidRing = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export function StepGovernment({ errors }: { errors: FieldErrors }) {
  const government = useHireDraftStore((s) => s.draft.government);
  const setSection = useHireDraftStore((s) => s.setSection);

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        Government IDs are optional at hiring and can be added later. If entered, they&apos;re
        checked for the correct format only — no verification happens here.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <HireField label="TIN" error={errors.tin} hint="12 digits">
          {({ id, invalid }) => (
            <Input
              id={id}
              value={government.tin}
              onChange={(e) => setSection("government", { tin: e.target.value })}
              className={cn("font-mono", invalid && invalidRing)}
              placeholder="000-000-000-000"
            />
          )}
        </HireField>

        <HireField label="SSS" error={errors.sss} hint="10 digits">
          {({ id, invalid }) => (
            <Input
              id={id}
              value={government.sss}
              onChange={(e) => setSection("government", { sss: e.target.value })}
              className={cn("font-mono", invalid && invalidRing)}
              placeholder="00-0000000-0"
            />
          )}
        </HireField>

        <HireField label="PhilHealth" error={errors.philhealth} hint="12 digits">
          {({ id, invalid }) => (
            <Input
              id={id}
              value={government.philhealth}
              onChange={(e) => setSection("government", { philhealth: e.target.value })}
              className={cn("font-mono", invalid && invalidRing)}
              placeholder="00-000000000-0"
            />
          )}
        </HireField>

        <HireField label="Pag-IBIG" error={errors.pagibig} hint="12 digits">
          {({ id, invalid }) => (
            <Input
              id={id}
              value={government.pagibig}
              onChange={(e) => setSection("government", { pagibig: e.target.value })}
              className={cn("font-mono", invalid && invalidRing)}
              placeholder="0000-0000-0000"
            />
          )}
        </HireField>
      </div>
    </div>
  );
}