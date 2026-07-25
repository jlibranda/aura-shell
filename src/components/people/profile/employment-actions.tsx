"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, UserCog, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Select } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, ActionReadonly } from "@/components/people/actions/action-field";
import { fieldErrorsFrom } from "@/components/shared/command-result-helpers";
import { transferEmployeeAction, changeManagerAction, endPlacementAction } from "@/app/(app)/people/[employeeId]/employment/actions";
import type { EmploymentActionsViewModel } from "@/platform/people/profile-employment-actions-loader";

type DrawerState =
  | { mode: "transfer"; orgUnitId: string | null; managerId: string | null; effectiveFrom: string | null }
  | { mode: "change-manager"; managerId: string | null; effectiveFrom: string | null }
  | { mode: "end"; effectiveUntil: string | null };

/**
 * Everyday HR movement, in HR's own language — "Transfer Employee," "Change
 * Manager," "End Placement," never "Assignment." Every command here is the
 * exact AssignmentService.transfer/assignPrimary/endAssignment already built
 * for Settings > Organization > Assignment Diagnostics; this is a second
 * entry point to the same domain operations, not a new one.
 */
export function EmploymentActions({
  employeeId,
  employeeName,
  actions,
}: {
  employeeId: string;
  employeeName: string;
  actions: EmploymentActionsViewModel;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!actions.canManage) return null;

  const hasCurrentPlacement = Boolean(actions.currentOrgUnitId);
  const currentOrgUnitLabel = actions.orgUnitOptions.find((option) => option.id === actions.currentOrgUnitId)?.label;
  const orgUnitSelectOptions = actions.orgUnitOptions.map((option) => ({ value: option.id, label: option.label }));
  const managerSelectOptions = actions.managerOptions.map((option) => ({ value: option.id, label: option.label }));

  function openTransfer() {
    setErrors({});
    setDrawer({ mode: "transfer", orgUnitId: actions.currentOrgUnitId ?? null, managerId: actions.currentManagerId ?? null, effectiveFrom: null });
  }
  function openChangeManager() {
    setErrors({});
    setDrawer({ mode: "change-manager", managerId: actions.currentManagerId ?? null, effectiveFrom: null });
  }
  function openEnd() {
    setErrors({});
    setDrawer({ mode: "end", effectiveUntil: null });
  }

  function submit() {
    if (!drawer) return;
    startTransition(async () => {
      const result =
        drawer.mode === "transfer"
          ? await transferEmployeeAction({ employeeId, orgUnitId: drawer.orgUnitId ?? "", managerId: drawer.managerId ?? undefined, effectiveFrom: drawer.effectiveFrom ?? "" })
          : drawer.mode === "change-manager"
            ? await changeManagerAction({ employeeId, managerId: drawer.managerId ?? undefined, effectiveFrom: drawer.effectiveFrom ?? "" })
            : await endPlacementAction({ employeeId, effectiveUntil: drawer.effectiveUntil ?? "" });

      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success(drawer.mode === "transfer" ? "Employee transferred." : drawer.mode === "change-manager" ? "Manager changed." : "Placement ended.");
      setDrawer(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={openTransfer}>
        <ArrowRightLeft className="mr-1.5 h-4 w-4" />
        Transfer Employee
      </Button>
      {hasCurrentPlacement ? (
        <Button variant="outline" onClick={openChangeManager}>
          <UserCog className="mr-1.5 h-4 w-4" />
          Change Manager
        </Button>
      ) : null}
      {hasCurrentPlacement ? (
        <Button variant="outline" onClick={openEnd}>
          <UserX className="mr-1.5 h-4 w-4" />
          End Placement
        </Button>
      ) : null}

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "transfer" ? "Transfer employee" : drawer?.mode === "change-manager" ? "Change manager" : "End placement"}
        description={employeeName}
        isDirty={drawer !== null}
        footer={
          <DrawerFooterActions>
            <Button variant="outline" onClick={() => setDrawer(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DrawerFooterActions>
        }
      >
        {errors._form ? (
          <div role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {errors._form}
          </div>
        ) : null}

        {drawer?.mode === "transfer" ? (
          <div className="space-y-4">
            <ActionField label="Organization unit" required error={errors.orgUnitId}>
              {({ id }) => (
                <Select id={id} value={drawer.orgUnitId} onChange={(value) => setDrawer({ ...drawer, orgUnitId: value })} options={orgUnitSelectOptions} placeholder="Choose an organization unit" />
              )}
            </ActionField>
            <ActionField label="Reporting manager" hint="Optional" error={errors.managerId}>
              {({ id }) => <Select id={id} value={drawer.managerId} onChange={(value) => setDrawer({ ...drawer, managerId: value })} options={managerSelectOptions} placeholder="No manager" />}
            </ActionField>
            <ActionField label="Effective from" required error={errors.effectiveFrom}>
              {({ id }) => <DatePicker id={id} value={drawer.effectiveFrom} onChange={(value) => setDrawer({ ...drawer, effectiveFrom: value })} />}
            </ActionField>
          </div>
        ) : drawer?.mode === "change-manager" ? (
          <div className="space-y-4">
            {currentOrgUnitLabel ? <ActionReadonly label="Current organization" value={currentOrgUnitLabel} /> : null}
            <ActionField label="New reporting manager" hint="Optional — clear to remove the manager" error={errors.managerId}>
              {({ id }) => <Select id={id} value={drawer.managerId} onChange={(value) => setDrawer({ ...drawer, managerId: value })} options={managerSelectOptions} placeholder="No manager" />}
            </ActionField>
            <ActionField label="Effective from" required error={errors.effectiveFrom}>
              {({ id }) => <DatePicker id={id} value={drawer.effectiveFrom} onChange={(value) => setDrawer({ ...drawer, effectiveFrom: value })} />}
            </ActionField>
          </div>
        ) : drawer?.mode === "end" ? (
          <div className="space-y-4">
            {currentOrgUnitLabel ? <ActionReadonly label="Current organization" value={currentOrgUnitLabel} /> : null}
            <ActionField label="Effective until" required error={errors.effectiveUntil}>
              {({ id }) => <DatePicker id={id} value={drawer.effectiveUntil} onChange={(value) => setDrawer({ ...drawer, effectiveUntil: value })} />}
            </ActionField>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
