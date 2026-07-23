"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly } from "@/components/people/actions/action-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { validateChangeManager, type ChangeManagerInput } from "@/lib/people/lifecycle-actions";
import type { Employee, FieldErrors } from "@/lib/people/people-types";

const REASONS: ComboboxOption[] = [
  { value: "Reorganization", label: "Reorganization" },
  { value: "Manager departure", label: "Manager departure" },
  { value: "Team change", label: "Team change" },
  { value: "Employee request", label: "Employee request" },
  { value: "Other", label: "Other" },
];

export function ChangeManagerDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const employees = usePeopleRepository((s) => s.employees);
  const changeManager = usePeopleRepository((s) => s.changeManager);

  const currentManager = employees.find((e) => e.id === employee.employment.managerId);

  const [input, setInput] = useState<ChangeManagerInput>({
    effectiveDate: new Date().toISOString().slice(0, 10),
    managerId: "",
    reason: "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const patch = (p: Partial<ChangeManagerInput>) => setInput((prev) => ({ ...prev, ...p }));

  const errors: FieldErrors = useMemo(
    () => validateChangeManager(input, employee),
    [input, employee],
  );
  const displayErrors = showErrors ? errors : {};

  const managerOptions: ComboboxOption[] = employees
    .filter((e) => e.id !== employee.id && e.id !== employee.employment.managerId)
    .map((e) => ({ value: e.id, label: fullName(e), description: e.employment.positionTitle }));

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }
    const result = changeManager(employee.id, input.managerId);
    if (!result.ok) {
      toast.error("Manager not changed", { description: result.error });
      return;
    }
    const newManager = employees.find((e) => e.id === input.managerId);
    toast.success("Manager changed", {
      description: newManager ? `${fullName(employee)} now reports to ${fullName(newManager)}.` : undefined,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Change manager — ${fullName(employee)}`}
      description="Reassign this employee's reporting manager."
      isDirty={input.managerId !== "" || input.reason !== ""}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Reassign</Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-5">
        <ActionReadonly
          label="Current manager"
          value={currentManager ? fullName(currentManager) : "No manager assigned"}
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

        <ActionField label="New manager" required error={displayErrors.managerId}>
          {() => (
            <Combobox
              options={managerOptions}
              value={input.managerId || null}
              onChange={(v) => patch({ managerId: v ?? "" })}
              placeholder="Select new manager"
            />
          )}
        </ActionField>

        <ActionField label="Reason" required error={displayErrors.reason}>
          {() => (
            <Combobox
              options={REASONS}
              value={input.reason || null}
              onChange={(v) => patch({ reason: v ?? "" })}
              placeholder="Select a reason"
            />
          )}
        </ActionField>
      </div>
    </Drawer>
  );
}