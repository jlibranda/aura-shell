"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly, invalidRing } from "@/components/people/actions/action-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import {
  parseSalary,
  validateSalaryChange,
  type SalaryChangeInput,
} from "@/lib/people/lifecycle-actions";
import type { Employee, FieldErrors, PayFrequency } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const REASONS: ComboboxOption[] = [
  { value: "Annual increase", label: "Annual increase" },
  { value: "Merit increase", label: "Merit increase" },
  { value: "Promotion", label: "Promotion" },
  { value: "Market adjustment", label: "Market adjustment" },
  { value: "Correction", label: "Correction" },
  { value: "Other", label: "Other" },
];

const PAY_FREQUENCY_OPTIONS: ComboboxOption[] = [
  { value: "semi_monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function SalaryChangeDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const changeCompensation = usePeopleRepository((s) => s.changeCompensation);
  const current = employee.compensation.current;

  const [input, setInput] = useState<SalaryChangeInput>({
    effectiveDate: new Date().toISOString().slice(0, 10),
    newSalary: "",
    currency: current.currency,
    payFrequency: current.payFrequency,
    reason: "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const patch = (p: Partial<SalaryChangeInput>) => setInput((prev) => ({ ...prev, ...p }));

  const errors: FieldErrors = useMemo(
    () => validateSalaryChange(input, employee),
    [input, employee],
  );
  const displayErrors = showErrors ? errors : {};

  const parsed = parseSalary(input.newSalary);
  const validNumber = !Number.isNaN(parsed) && parsed > 0;
  const delta = validNumber ? parsed - current.baseMonthly : 0;
  const pct = validNumber && current.baseMonthly > 0 ? (delta / current.baseMonthly) * 100 : 0;

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaTone = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground";

  const dirty = input.newSalary !== "" || input.reason !== "";

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please complete the required fields");
      return;
    }
    changeCompensation(employee.id, {
      baseMonthly: parsed,
      reason: input.reason,
      effectiveDate: input.effectiveDate as string,
      payFrequency: input.payFrequency,
    });
    toast.success("Compensation updated", {
      description: `${fullName(employee)}'s base pay was changed.`,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Change salary — ${fullName(employee)}`}
      description="Record a change to base compensation."
      isDirty={dirty}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Record change</Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-5">
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

        <ActionReadonly
          label="Current salary"
          value={<span className="tabular font-mono">{formatCurrency(current.baseMonthly, current.currency)}</span>}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ActionField label="New salary" required error={displayErrors.newSalary}>
            {({ id, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                value={input.newSalary}
                onChange={(e) => patch({ newSalary: e.target.value })}
                className={cn("tabular font-mono", invalid && invalidRing)}
                placeholder="0.00"
              />
            )}
          </ActionField>
          <ActionField label="Currency">
            {({ id }) => (
              <Input
                id={id}
                value={input.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                className="font-mono uppercase"
                placeholder="PHP"
              />
            )}
          </ActionField>
        </div>

        {validNumber && delta !== 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change amount
              </div>
              <div className={cn("tabular mt-1 flex items-center gap-1.5 text-lg font-semibold", deltaTone)}>
                <DeltaIcon className="h-4 w-4" />
                {delta > 0 ? "+" : ""}
                {formatCurrency(delta, input.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change %
              </div>
              <div className={cn("tabular mt-1 flex items-center gap-1.5 text-lg font-semibold", deltaTone)}>
                <DeltaIcon className="h-4 w-4" />
                {pct > 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </div>
            </div>
          </div>
        ) : null}

        <ActionField label="Pay frequency">
          {() => (
            <Combobox
              options={PAY_FREQUENCY_OPTIONS}
              value={input.payFrequency}
              onChange={(v) => patch({ payFrequency: (v as PayFrequency) ?? "semi_monthly" })}
              placeholder="Select frequency"
              searchable={false}
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