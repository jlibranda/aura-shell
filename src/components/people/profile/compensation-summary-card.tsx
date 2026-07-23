import { Banknote, Lock } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { ProfileField, ProfileFieldGrid } from "@/components/people/profile/profile-field";
import {
  payFrequencyLabel,
  payrollGroup,
  salaryGrade,
} from "@/lib/people/employment-presentation";
import type { Employee } from "@/lib/people/people-types";

/**
 * Read-only compensation summary. Deliberately excludes the salary amount —
 * amounts belong to a future milestone.
 */
export function CompensationSummaryCard({ employee }: { employee: Employee }) {
  const comp = employee.compensation.current;

  return (
    <ProfileSectionCard title="Compensation" icon={Banknote}>
      <ProfileFieldGrid columns={2}>
        <ProfileField label="Salary grade" value={salaryGrade(employee)} />
        <ProfileField label="Pay frequency" value={payFrequencyLabel(comp.payFrequency)} />
        <ProfileField label="Currency" value={comp.currency} mono />
        <ProfileField label="Payroll group" value={payrollGroup(employee)} />
      </ProfileFieldGrid>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Salary amounts are shown in the Compensation tab, available in a later milestone.
      </div>
    </ProfileSectionCard>
  );
}