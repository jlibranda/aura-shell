"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, MapPin, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { commandErrorMessage, fieldErrorsFrom } from "@/components/shared/command-result-helpers";
import { createLocationAction, updateLocationAction, archiveLocationAction } from "@/app/(app)/settings/organization/locations/actions";
import type { AddressInput, LocationRecord } from "@/platform/organization/location";

interface LocationFormState {
  code: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
}

const EMPTY_FORM: LocationFormState = { code: "", name: "", line1: "", line2: "", city: "", region: "", postalCode: "", countryCode: "", timezone: "" };

function toAddressInput(form: LocationFormState): AddressInput {
  return { line1: form.line1, line2: form.line2 || undefined, city: form.city, region: form.region || undefined, postalCode: form.postalCode || undefined };
}

function useTimeZoneOptions(): string[] {
  return useMemo(() => {
    try {
      return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    } catch {
      return [];
    }
  }, []);
}

export function LocationAdminView({ locations, canManage }: { locations: LocationRecord[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; location: LocationRecord } | null>(null);
  const [archiving, setArchiving] = useState<LocationRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const timeZones = useTimeZoneOptions();

  function update<K extends keyof LocationFormState>(key: K, value: LocationFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setErrors({});
    setDrawer({ mode: "create" });
  }
  function openEdit(location: LocationRecord) {
    setForm({
      code: location.code,
      name: location.name,
      line1: location.address.line1,
      line2: location.address.line2 ?? "",
      city: location.address.city,
      region: location.address.region ?? "",
      postalCode: location.address.postalCode ?? "",
      countryCode: location.countryCode,
      timezone: location.timezone,
    });
    setErrors({});
    setDrawer({ mode: "edit", location });
  }

  function submit() {
    if (!drawer) return;
    startTransition(async () => {
      const address = toAddressInput(form);
      const result =
        drawer.mode === "create"
          ? await createLocationAction({ code: form.code, name: form.name, address, countryCode: form.countryCode, timezone: form.timezone })
          : await updateLocationAction({ id: drawer.location.id, name: form.name, address, countryCode: form.countryCode, timezone: form.timezone });

      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success(drawer.mode === "create" ? "Location created." : "Location updated.");
      setDrawer(null);
      router.refresh();
    });
  }

  function confirmArchive() {
    if (!archiving) return;
    const location = archiving;
    startTransition(async () => {
      const result = await archiveLocationAction({ id: location.id });
      if (result.kind !== "success") toast.error(commandErrorMessage(result));
      else toast.success("Location archived.");
      setArchiving(null);
      router.refresh();
    });
  }

  const columns: DataTableColumn<LocationRecord>[] = [
    { key: "name", header: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { key: "code", header: "Code", render: (row) => <span className="text-muted-foreground">{row.code}</span> },
    { key: "city", header: "City", render: (row) => `${row.address.city}, ${row.countryCode}` },
    { key: "timezone", header: "Time zone", render: (row) => row.timezone },
    { key: "status", header: "Status", render: (row) => <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Active" : "Archived"}</Badge> },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (row: LocationRecord) =>
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
          {locations.length} location{locations.length === 1 ? "" : "s"}
        </p>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New location
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={locations}
        getRowId={(row) => row.id}
        empty={<div className="py-10 text-center"><MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">No locations yet.</p></div>}
      />

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "create" ? "New location" : "Edit location"}
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
              {({ id }) => <Input id={id} value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="e.g. HQ" />}
            </FormField>
          ) : null}
          <FormField label="Name" error={errors.name}>
            {({ id }) => <Input id={id} value={form.name} onChange={(event) => update("name", event.target.value)} />}
          </FormField>
          <FormField label="Address line 1" error={errors["address.line1"]}>
            {({ id }) => <Input id={id} value={form.line1} onChange={(event) => update("line1", event.target.value)} />}
          </FormField>
          <FormField label="Address line 2" hint="Optional">
            {({ id }) => <Input id={id} value={form.line2} onChange={(event) => update("line2", event.target.value)} />}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="City" error={errors["address.city"]}>
              {({ id }) => <Input id={id} value={form.city} onChange={(event) => update("city", event.target.value)} />}
            </FormField>
            <FormField label="Region" hint="Optional">
              {({ id }) => <Input id={id} value={form.region} onChange={(event) => update("region", event.target.value)} />}
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Postal code" hint="Optional">
              {({ id }) => <Input id={id} value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} />}
            </FormField>
            <FormField label="Country" error={errors.countryCode}>
              {({ id }) => <Input id={id} maxLength={2} value={form.countryCode} onChange={(event) => update("countryCode", event.target.value.toUpperCase())} placeholder="e.g. PH" />}
            </FormField>
          </div>
          <FormField label="Time zone" error={errors.timezone}>
            {({ id }) => (
              <>
                <Input id={id} list="location-timezone-options" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} placeholder="e.g. Asia/Manila" />
                <datalist id="location-timezone-options">
                  {timeZones.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </>
            )}
          </FormField>
        </div>
      </Drawer>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this location?"
        description={archiving ? `"${archiving.name}" will be archived and excluded from active listings. It stays historically resolvable.` : undefined}
        confirmLabel="Archive"
        tone="danger"
        loading={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
