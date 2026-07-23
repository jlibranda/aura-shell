"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly, invalidRing } from "@/components/people/actions/action-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import { entityLabel } from "@/lib/people/format";
import { ENTITIES } from "@/lib/mock-data";
import { validateTransfer, type TransferInput } from "@/lib/people/lifecycle-actions";
import type { Employee, FieldErrors } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const REASONS: ComboboxOption[] = [
  { value: "Reorganization", label: "Reorganization" },
  { value: "Business need", label: "Business need" },
  { value: "Employee request", label: "Employee request" },
  { value: "Relocation", label: "Relocation" },
  { value: "Other", label: "Other" },
];

export function TransferDrawer({
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
  const transfer = usePeopleRepository((s) => s.transfer);
  const changeManager = usePeopleRepository((s) => s.changeManager);

  const [input, setInput] = useState<TransferInput>({
    effectiveDate: new Date().toISOString().slice(0, 10),
    entityId: employee.employment.entityId,
    businessUnit: entityLabel(employee.employment.entityId),
    departmentId: "",
    teamId: "",
    managerId: "",
    locationLabel: employee.employment.locationLabel,
    reason: "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const patch = (p: Partial<TransferInput>) => setInput((prev) => ({ ...prev, ...p }));

  const errors: FieldErrors = useMemo(
    () => validateTransfer(input, employee),
    [input, employee],
  );
  const displayErrors = showErrors ? errors : {};

  const entityOptions: ComboboxOption[] = ENTITIES.map((e) => ({
    value: e.id,
    label: e.name,
    description: e.region,
  }));
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

  const dirty = input.departmentId !== "" || input.reason !== "";

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }
    const effectiveDate = input.effectiveDate as string;

    transfer(employee.id, {
      entityId: input.entityId,
      departmentId: input.departmentId,
      teamId: input.teamId || undefined,
      locationLabel: input.locationLabel.trim(),
      effectiveDate,
    });
    if (input.managerId && input.managerId !== employee.employment.managerId) {
      const result = changeManager(employee.id, input.managerId);
      if (!result.ok) toast.error("Manager not changed", { description: result.error });
    }

    toast.success("Employee transferred", {
      description: `${fullName(employee)}'s assignment was updated.`,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Transfer ${fullName(employee)}`}
      description="Move this employee to a new department, entity, or location."
      isDirty={dirty}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Transfer</Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionReadonly label="Current department" value={departments.find((d) => d.id === employee.employment.departmentId)?.name ?? "—"} />
          <ActionReadonly label="Current location" value={employee.employment.locationLabel} />
        </div>

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

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ActionField label="New entity" required error={displayErrors.entityId}>
            {() => (
              <Combobox
                options={entityOptions}
                value={input.entityId || null}
                onChange={(v) => {
                  const entity = ENTITIES.find((e) => e.id === v);
                  patch({ entityId: v ?? "", businessUnit: entity?.name ?? input.businessUnit });
                }}
                placeholder="Select entity"
              />
            )}
          </ActionField>
          <ActionField label="New business unit">
            {({ id }) => (
              <Input
                id={id}
                value={input.businessUnit}
                onChange={(e) => patch({ businessUnit: e.target.value })}
                placeholder="Business unit"
              />
            )}
          </ActionField>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ActionField label="New department" required error={displayErrors.departmentId}>
            {() => (
              <Combobox
                options={departmentOptions}
                value={input.departmentId || null}
                onChange={(v) => patch({ departmentId: v ?? "", teamId: "" })}
                placeholder="Select department"
              />
            )}
          </ActionField>
          <ActionField label="New team" hint="Optional">
            {() => (
              <Combobox
                options={teamOptions}
                value={input.teamId || null}
                onChange={(v) => patch({ teamId: v ?? "" })}
                placeholder="Select team"
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

        <ActionField label="Work location" required error={displayErrors.locationLabel}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={input.locationLabel}
              onChange={(e) => patch({ locationLabel: e.target.value })}
              className={cn(invalid && invalidRing)}
              placeholder="Manila HQ"
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