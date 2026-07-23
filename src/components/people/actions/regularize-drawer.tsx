"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly } from "@/components/people/actions/action-field";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { CURRENT_USER } from "@/lib/mock-data";
import { fullName } from "@/lib/people/directory-query";
import { longDate } from "@/lib/people/format";
import { validateRegularize, type RegularizeInput } from "@/lib/people/lifecycle-actions";
import type { Employee, FieldErrors, TimelineEvent } from "@/lib/people/people-types";

export function RegularizeDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const updateEmployee = usePeopleRepository((s) => s.updateEmployee);

  const [input, setInput] = useState<RegularizeInput>({
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const patch = (p: Partial<RegularizeInput>) => setInput((prev) => ({ ...prev, ...p }));

  const alreadyRegular = employee.status === "regular";

  const errors: FieldErrors = useMemo(
    () => validateRegularize(input, employee),
    [input, employee],
  );
  const displayErrors = showErrors ? errors : {};

  const submit = () => {
    if (alreadyRegular) {
      toast.info("Already regular", { description: `${fullName(employee)} is already a regular employee.` });
      onClose();
      return;
    }
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }

    const effectiveDate = input.effectiveDate as string;
    const event: TimelineEvent = {
      id: `tl-${employee.id}-reg-${Date.now().toString(36)}`,
      type: "regularized",
      title: "Regularized",
      description: `Effective ${longDate(effectiveDate)}${input.notes.trim() ? ` — ${input.notes.trim()}` : ""}`,
      timestamp: new Date().toISOString(),
      actor: CURRENT_USER.name,
    };

    updateEmployee(employee.id, {
      status: "regular",
      employment: {
        ...employee.employment,
        employmentType: "regular",
        regularizationDate: effectiveDate,
      },
      timeline: [event, ...employee.timeline],
    });

    toast.success("Employee regularized", {
      description: `${fullName(employee)} is now a regular employee.`,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Regularize ${fullName(employee)}`}
      description="Confirm this employee as a regular, permanent hire."
      isDirty={input.notes !== ""}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={alreadyRegular}>
            <CheckCircle2 className="h-4 w-4" />
            Regularize
          </Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Status change</span>
          <EmployeeStatusBadge status={employee.status} />
          <span className="text-muted-foreground">→</span>
          <EmployeeStatusBadge status="regular" />
        </div>

        {alreadyRegular ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-foreground">
            {fullName(employee)} is already a regular employee. No change is needed.
          </p>
        ) : null}

        <ActionReadonly
          label="Probation end date"
          value={employee.employment.probationEndDate ? longDate(employee.employment.probationEndDate) : "Not set"}
        />

        <ActionField label="Effective date" required error={displayErrors.effectiveDate}>
          {() => (
            <DatePicker
              value={input.effectiveDate}
              onChange={(v) => patch({ effectiveDate: v })}
              min={employee.employment.hireDate}
              placeholder="Select date"
            />
          )}
        </ActionField>

        <ActionField label="Confirmation notes" hint="Optional">
          {({ id }) => (
            <Textarea
              id={id}
              value={input.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Notes about this regularization"
              rows={3}
            />
          )}
        </ActionField>
      </div>
    </Drawer>
  );
}