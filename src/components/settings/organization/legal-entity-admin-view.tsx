"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Building, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { commandErrorMessage, fieldErrorsFrom } from "@/components/shared/command-result-helpers";
import { createLegalEntityAction, updateLegalEntityAction, archiveLegalEntityAction } from "@/app/(app)/settings/organization/legal-entities/actions";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

interface LegalEntityFormState {
  code: string;
  legalName: string;
  countryCode: string;
}

const EMPTY_FORM: LegalEntityFormState = { code: "", legalName: "", countryCode: "" };

export function LegalEntityAdminView({ legalEntities, canManage }: { legalEntities: LegalEntityRecord[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; legalEntity: LegalEntityRecord } | null>(null);
  const [archiving, setArchiving] = useState<LegalEntityRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<LegalEntityFormState>(EMPTY_FORM);

  function update<K extends keyof LegalEntityFormState>(key: K, value: LegalEntityFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setErrors({});
    setDrawer({ mode: "create" });
  }
  function openEdit(legalEntity: LegalEntityRecord) {
    setForm({ code: legalEntity.code, legalName: legalEntity.legalName, countryCode: legalEntity.countryCode });
    setErrors({});
    setDrawer({ mode: "edit", legalEntity });
  }

  function submit() {
    if (!drawer) return;
    startTransition(async () => {
      const result =
        drawer.mode === "create"
          ? await createLegalEntityAction({ code: form.code, legalName: form.legalName, countryCode: form.countryCode })
          : await updateLegalEntityAction({ id: drawer.legalEntity.id, legalName: form.legalName, countryCode: form.countryCode });

      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success(drawer.mode === "create" ? "Legal entity created." : "Legal entity updated.");
      setDrawer(null);
      router.refresh();
    });
  }

  function confirmArchive() {
    if (!archiving) return;
    const legalEntity = archiving;
    startTransition(async () => {
      const result = await archiveLegalEntityAction({ id: legalEntity.id });
      if (result.kind !== "success") toast.error(commandErrorMessage(result));
      else toast.success("Legal entity archived.");
      setArchiving(null);
      router.refresh();
    });
  }

  const columns: DataTableColumn<LegalEntityRecord>[] = [
    { key: "legalName", header: "Legal name", render: (row) => <span className="font-medium text-foreground">{row.legalName}</span> },
    { key: "code", header: "Code", render: (row) => <span className="text-muted-foreground">{row.code}</span> },
    { key: "countryCode", header: "Country", render: (row) => row.countryCode },
    { key: "status", header: "Status", render: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Active" : "Archived"}</Badge> },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (row: LegalEntityRecord) =>
              row.status === "ACTIVE" ? (
                <div className="flex items-center justify-end gap-1">
                  <button type="button" title="Edit" onClick={() => openEdit(row)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Archive" onClick={() => setArchiving(row)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {legalEntities.length} legal entit{legalEntities.length === 1 ? "y" : "ies"}
        </p>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New legal entity
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={legalEntities}
        getRowId={(row) => row.id}
        empty={<div className="py-10 text-center"><Building className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">No legal entities yet.</p></div>}
      />

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "create" ? "New legal entity" : "Edit legal entity"}
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
        <div className="space-y-4">
          {drawer?.mode === "create" ? (
            <FormField label="Code" error={errors.code}>
              {({ id }) => <Input id={id} value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="e.g. CASHALO-PH" />}
            </FormField>
          ) : null}
          <FormField label="Legal name" error={errors.legalName}>
            {({ id }) => <Input id={id} value={form.legalName} onChange={(event) => update("legalName", event.target.value)} placeholder="e.g. Cashalo Financial Services Corp." />}
          </FormField>
          <FormField label="Country" error={errors.countryCode}>
            {({ id }) => <Input id={id} maxLength={2} value={form.countryCode} onChange={(event) => update("countryCode", event.target.value.toUpperCase())} placeholder="e.g. PH" />}
          </FormField>
        </div>
      </Drawer>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this legal entity?"
        description={archiving ? `"${archiving.legalName}" will be archived and excluded from Hire's legal entity picker and new organization unit creation. It stays historically resolvable.` : undefined}
        confirmLabel="Archive"
        tone="danger"
        loading={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
