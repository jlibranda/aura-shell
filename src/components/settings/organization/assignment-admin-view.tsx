"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, UserCog, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { FormField } from "@/components/ui/form";
import { Select } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { fieldErrorsFrom } from "@/components/settings/organization/command-result-helpers";
import { assignOrTransferAction, endAssignmentAction } from "@/app/(app)/settings/organization/assignments/actions";
import type { AssignmentAdminRow } from "@/platform/organization/organization-admin-dtos";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";
import type { OrganizationEmployeeDirectoryEntry } from "@/platform/organization/organization-employee-directory";

type DrawerState =
  | { mode: "place"; intent: "assign" | "transfer"; personId: string; personLocked: boolean; personLabel: string; orgUnitId: string | null; managerId: string | null; effectiveFrom: string | null }
  | { mode: "end"; row: AssignmentAdminRow; effectiveUntil: string | null };

export function AssignmentAdminView({
  assignments,
  unassigned,
  employees,
  orgUnits,
  canManage,
}: {
  assignments: AssignmentAdminRow[];
  unassigned: OrganizationEmployeeDirectoryEntry[];
  employees: OrganizationEmployeeDirectoryEntry[];
  orgUnits: OrgUnitRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: employee.displayName }));
  const orgUnitOptions = orgUnits.map((unit) => ({ value: unit.id, label: `${unit.name} (${unit.code})` }));

  function openAssign(personId?: string) {
    setErrors({});
    const label = personId ? (employees.find((e) => e.id === personId)?.displayName ?? "") : "";
    setDrawer({ mode: "place", intent: "assign", personId: personId ?? "", personLocked: Boolean(personId), personLabel: label, orgUnitId: null, managerId: null, effectiveFrom: null });
  }

  function openTransfer(row: AssignmentAdminRow) {
    setErrors({});
    setDrawer({ mode: "place", intent: "transfer", personId: row.personId, personLocked: true, personLabel: row.personName, orgUnitId: row.orgUnitId, managerId: row.managerId ?? null, effectiveFrom: null });
  }

  function openEnd(row: AssignmentAdminRow) {
    setErrors({});
    setDrawer({ mode: "end", row, effectiveUntil: null });
  }

  function submitPlace(state: Extract<DrawerState, { mode: "place" }>) {
    startTransition(async () => {
      const result = await assignOrTransferAction({
        personId: state.personId,
        orgUnitId: state.orgUnitId ?? "",
        managerId: state.managerId ?? undefined,
        effectiveFrom: state.effectiveFrom ?? "",
      });
      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success(result.value.state === "assigned" ? "Employee assigned." : "Employee transferred.");
      setDrawer(null);
      router.refresh();
    });
  }

  function submitEnd(state: Extract<DrawerState, { mode: "end" }>) {
    startTransition(async () => {
      const result = await endAssignmentAction({ personId: state.row.personId, effectiveUntil: state.effectiveUntil ?? "" });
      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success("Assignment ended.");
      setDrawer(null);
      router.refresh();
    });
  }

  const columns: DataTableColumn<AssignmentAdminRow>[] = [
    { key: "personName", header: "Employee", render: (row) => <span className="font-medium text-foreground">{row.personName}</span> },
    { key: "orgUnitName", header: "Org unit", render: (row) => row.orgUnitName },
    { key: "managerName", header: "Manager", render: (row) => row.managerName ?? <span className="text-muted-foreground">—</span> },
    { key: "effectiveFrom", header: "Since", render: (row) => new Date(row.effectiveFrom).toLocaleDateString() },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (row: AssignmentAdminRow) => (
              <div className="flex items-center justify-end gap-1">
                <button type="button" title="Transfer" onClick={() => openTransfer(row)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="End assignment" onClick={() => openEnd(row)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                  <UserX className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {assignments.length} current assignment{assignments.length === 1 ? "" : "s"}
          </p>
          {canManage ? (
            <Button onClick={() => openAssign()}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              New assignment
            </Button>
          ) : null}
        </div>
        <DataTable
          columns={columns}
          data={assignments}
          getRowId={(row) => row.assignmentId}
          empty={
            <div className="py-10 text-center">
              <UserCog className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No employees have a current placement yet.</p>
            </div>
          }
        />
      </div>

      {unassigned.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Not yet assigned ({unassigned.length})</h2>
          <p className="mb-3 text-xs text-muted-foreground">These employees have no current placement. Nothing assigns them automatically — place them explicitly when ready.</p>
          <Card className="divide-y divide-border p-0">
            {unassigned.map((employee) => (
              <div key={employee.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-foreground">{employee.displayName}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">Unassigned</Badge>
                  {canManage ? (
                    <button type="button" onClick={() => openAssign(employee.id)} className="text-xs font-medium text-primary hover:underline">
                      Assign
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "end" ? "End assignment" : drawer?.mode === "place" && drawer.intent === "transfer" ? "Transfer assignment" : "New assignment"}
        isDirty={drawer !== null}
        footer={
          <DrawerFooterActions>
            <Button variant="outline" onClick={() => setDrawer(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() => (drawer?.mode === "place" ? submitPlace(drawer) : drawer?.mode === "end" ? submitEnd(drawer) : undefined)}
              disabled={pending}
            >
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
        {drawer?.mode === "place" ? (
          <div className="space-y-4">
            <FormField label="Employee" error={errors.personId}>
              {({ id }) =>
                drawer.personLocked ? (
                  <p id={id} className="flex h-10 items-center rounded-md border border-border bg-surface-muted px-3 text-sm text-foreground">
                    {drawer.personLabel}
                  </p>
                ) : (
                  <Select id={id} value={drawer.personId || null} onChange={(value) => setDrawer({ ...drawer, personId: value ?? "" })} options={employeeOptions} placeholder="Choose an employee" />
                )
              }
            </FormField>
            <FormField label="Organization unit" error={errors.orgUnitId}>
              {({ id }) => <Select id={id} value={drawer.orgUnitId} onChange={(value) => setDrawer({ ...drawer, orgUnitId: value })} options={orgUnitOptions} placeholder="Choose an org unit" />}
            </FormField>
            <FormField label="Manager" hint="Optional" error={errors.managerId}>
              {({ id }) => (
                <Select id={id} value={drawer.managerId} onChange={(value) => setDrawer({ ...drawer, managerId: value })} options={employeeOptions.filter((o) => o.value !== drawer.personId)} placeholder="No manager" />
              )}
            </FormField>
            <FormField label="Effective from" error={errors.effectiveFrom}>
              {({ id }) => <DatePicker id={id} value={drawer.effectiveFrom} onChange={(value) => setDrawer({ ...drawer, effectiveFrom: value })} />}
            </FormField>
          </div>
        ) : drawer?.mode === "end" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-foreground">{drawer.row.personName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Currently placed in {drawer.row.orgUnitName}.</p>
            </div>
            <FormField label="Effective until" error={errors.effectiveUntil}>
              {({ id }) => <DatePicker id={id} value={drawer.effectiveUntil} onChange={(value) => setDrawer({ ...drawer, effectiveUntil: value })} />}
            </FormField>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
