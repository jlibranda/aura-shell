"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly, invalidRing } from "@/components/people/actions/action-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { validatePromote, type PromoteInput } from "@/lib/people/lifecycle-actions";
import type { Employee, FieldErrors } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const JOB_LEVELS: ComboboxOption[] = [
  { value: "SG-1 · Entry", label: "SG-1 · Entry" },
  { value: "SG-2 · Associate", label: "SG-2 · Associate" },
  { value: "SG-3 · Professional", label: "SG-3 · Professional" },
  { value: "SG-4 · Professional", label: "SG-4 · Professional" },
  { value: "SG-5 · Senior", label: "SG-5 · Senior" },
  { value: "SG-6 · Leadership", label: "SG-6 · Leadership" },
  { value: "SG-7 · Executive", label: "SG-7 · Executive" },
];

const REASONS: ComboboxOption[] = [
  { value: "Performance", label: "Performance" },
  { value: "Merit", label: "Merit" },
  { value: "Role expansion", label: "Role expansion" },
  { value: "Reorganization", label: "Reorganization" },
  { value: "Other", label: "Other" },
];

export function PromoteDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);
  const employees = usePeopleRepository((s) => s.employees);
  const promote = usePeopleRepository((s) => s.promote);
  const transfer = usePeopleRepository((s) => s.transfer);
  const changeManager = usePeopleRepository((s) => s.changeManager);

  const [input, setInput] = useState<PromoteInput>({
    effectiveDate: new Date().toISOString().slice(0, 10),
    positionTitle: "",
    jobLevel: "",
    departmentId: "",
    teamId: "",
    managerId: "",
    reason: "",
    remarks: "",
  });
  const [showErrors, setShowErrors] = useState(false);

  const patch = (p: Partial<PromoteInput>) => setInput((prev) => ({ ...prev, ...p }));

  const errors: FieldErrors = useMemo(
    () => validatePromote(input, employee),
    [input, employee],
  );
  const displayErrors = showErrors ? errors : {};

  const departmentOptions: ComboboxOption[] = departments.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  const teamOptions: ComboboxOption[] = teams
    .filter((t) => (input.departmentId ? t.departmentId === input.departmentId : true))
    .map((t) => ({ value: t.id, label: t.name }));
  const managerOptions: ComboboxOption[] = employees
    .filter((e) => e.id !== employee.id)
    .map((e) => ({ value: e.id, label: fullName(e), description: e.employment.positionTitle }));

  const dirty =
    input.positionTitle !== "" ||
    input.jobLevel !== "" ||
    input.reason !== "" ||
    input.remarks !== "";

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }
    const effectiveDate = input.effectiveDate as string;

    promote(employee.id, {
      positionTitle: input.positionTitle.trim(),
      effectiveDate,
    });
    if (input.departmentId || input.teamId) {
      transfer(employee.id, {
        departmentId: input.departmentId || undefined,
        teamId: input.teamId || undefined,
        effectiveDate,
      });
    }
    if (input.managerId && input.managerId !== employee.employment.managerId) {
      const result = changeManager(employee.id, input.managerId);
      if (!result.ok) {
        toast.error("Manager not changed", { description: result.error });
      }
    }

    toast.success("Employee promoted", {
      description: `${fullName(employee)} is now ${input.positionTitle.trim()}.`,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Promote ${fullName(employee)}`}
      description="Move this employee into a new position."
      isDirty={dirty}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Promote</Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-5">
        <ActionReadonly label="Current position" value={employee.employment.positionTitle} />

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

        <ActionField label="New position" required error={displayErrors.positionTitle}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={input.positionTitle}
              onChange={(e) => patch({ positionTitle: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="Senior Software Engineer"
            />
          )}
        </ActionField>

        <ActionField label="New job level" required error={displayErrors.jobLevel}>
          {() => (
            <Combobox
              options={JOB_LEVELS}
              value={input.jobLevel || null}
              onChange={(v) => patch({ jobLevel: v ?? "" })}
              placeholder="Select job level"
            />
          )}
        </ActionField>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ActionField label="New department" hint="Optional">
            {() => (
              <Combobox
                options={departmentOptions}
                value={input.departmentId || null}
                onChange={(v) => patch({ departmentId: v ?? "", teamId: "" })}
                placeholder="Unchanged"
              />
            )}
          </ActionField>
          <ActionField label="New team" hint="Optional">
            {() => (
              <Combobox
                options={teamOptions}
                value={input.teamId || null}
                onChange={(v) => patch({ teamId: v ?? "" })}
                placeholder="Unchanged"
                disabled={!input.departmentId}
              />
            )}
          </ActionField>
        </div>

        <ActionField label="New manager" hint="Optional" error={displayErrors.managerId}>
          {() => (
            <Combobox
              options={managerOptions}
              value={input.managerId || null}
              onChange={(v) => patch({ managerId: v ?? "" })}
              placeholder="Unchanged"
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

        <ActionField label="Remarks" hint="Optional">
          {({ id }) => (
            <Textarea
              id={id}
              value={input.remarks}
              onChange={(e) => patch({ remarks: e.target.value })}
              placeholder="Additional context for this promotion"
              rows={3}
            />
          )}
        </ActionField>
      </div>
    </Drawer>
  );
}