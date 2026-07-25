"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowRightLeft, Building2, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField, Input, Label } from "@/components/ui/form";
import { Select } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";
import { commandErrorMessage, fieldErrorsFrom } from "@/components/shared/command-result-helpers";
import { createOrgUnitAction, renameOrgUnitAction, moveOrgUnitAction, archiveOrgUnitAction } from "@/app/(app)/settings/organization/org-units/actions";
import { ORG_UNIT_KINDS, type OrgUnitKind, type OrgUnitRecord, type OrgUnitTreeNode } from "@/platform/organization/org-unit";

const KIND_LABELS: Record<OrgUnitKind, string> = {
  DIVISION: "Division",
  BUSINESS_UNIT: "Business unit",
  DEPARTMENT: "Department",
  BRANCH: "Branch",
  TEAM: "Team",
};

type DrawerState = { mode: "create"; parentId?: string } | { mode: "rename"; unit: OrgUnitRecord } | { mode: "move"; unit: OrgUnitRecord };

/**
 * Deliberately no client-side cycle or hierarchy validation (the ticket's own
 * constraint) — the parent picker offers every unit, and an invalid move is
 * rejected server-side by OrgUnitService with a clear conflict message.
 */
export function OrgUnitAdminView({ tree, flat, canManage }: { tree: OrgUnitTreeNode[]; flat: OrgUnitRecord[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [archiving, setArchiving] = useState<OrgUnitRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flat.map((unit) => unit.id)));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("DEPARTMENT");
  const [parentId, setParentId] = useState<string | null>(null);

  function openCreate(underParentId?: string) {
    setCode("");
    setName("");
    setKind("DEPARTMENT");
    setParentId(underParentId ?? null);
    setErrors({});
    setDrawer({ mode: "create", parentId: underParentId });
  }
  function openRename(unit: OrgUnitRecord) {
    setName(unit.name);
    setErrors({});
    setDrawer({ mode: "rename", unit });
  }
  function openMove(unit: OrgUnitRecord) {
    setParentId(unit.parentId ?? null);
    setErrors({});
    setDrawer({ mode: "move", unit });
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!drawer) return;
    startTransition(async () => {
      const result =
        drawer.mode === "create"
          ? await createOrgUnitAction({ code, name, kind, parentId: parentId ?? undefined })
          : drawer.mode === "rename"
            ? await renameOrgUnitAction({ id: drawer.unit.id, name })
            : await moveOrgUnitAction({ id: drawer.unit.id, parentId });

      if (result.kind !== "success") {
        setErrors(fieldErrorsFrom(result));
        return;
      }
      toast.success(drawer.mode === "create" ? "Org unit created." : drawer.mode === "rename" ? "Org unit renamed." : "Org unit moved.");
      setDrawer(null);
      router.refresh();
    });
  }

  function confirmArchive() {
    if (!archiving) return;
    const unit = archiving;
    startTransition(async () => {
      const result = await archiveOrgUnitAction({ id: unit.id });
      if (result.kind !== "success") toast.error(commandErrorMessage(result));
      else toast.success("Org unit archived.");
      setArchiving(null);
      router.refresh();
    });
  }

  const parentOptions = flat
    .filter((unit) => !(drawer?.mode === "move" && unit.id === drawer.unit.id))
    .map((unit) => ({ value: unit.id, label: `${unit.name} (${unit.code})` }));

  function renderNode(node: OrgUnitTreeNode, depth: number): React.ReactNode {
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-muted" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {node.children.length > 0 ? (
            <button type="button" onClick={() => toggle(node.id)} aria-label={isExpanded ? "Collapse" : "Expand"} className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span className="flex-1 truncate text-sm text-foreground">
            {node.name} <span className="text-xs text-muted-foreground">· {node.code} · {KIND_LABELS[node.kind]}</span>
          </span>
          <Badge tone={node.status === "ACTIVE" ? "success" : "neutral"}>{node.status === "ACTIVE" ? "Active" : "Archived"}</Badge>
          {canManage && node.status === "ACTIVE" ? (
            <div className="flex items-center gap-1">
              <button type="button" title="Add child unit" onClick={() => openCreate(node.id)} className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Rename" onClick={() => openRename(node)} className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Move" onClick={() => openMove(node)} className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Archive" onClick={() => setArchiving(node)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                <Archive className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
        {isExpanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {flat.length} unit{flat.length === 1 ? "" : "s"}
        </p>
        {canManage ? (
          <Button onClick={() => openCreate()}>
            <Plus className="mr-1.5 h-4 w-4" />
            New root unit
          </Button>
        ) : null}
      </div>

      {tree.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organization units yet"
          description="Create the first division, business unit, or department."
          action={canManage ? <Button onClick={() => openCreate()}>Create org unit</Button> : undefined}
        />
      ) : (
        <Card className="p-2">{tree.map((node) => renderNode(node, 0))}</Card>
      )}

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "create" ? "New org unit" : drawer?.mode === "rename" ? "Rename org unit" : "Move org unit"}
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
        {drawer?.mode === "create" ? (
          <div className="space-y-4">
            <FormField label="Code" error={errors.code}>
              {({ id }) => <Input id={id} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. FIN" />}
            </FormField>
            <FormField label="Name" error={errors.name}>
              {({ id }) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
            </FormField>
            <FormField label="Kind" error={errors.kind}>
              {({ id }) => (
                <Select id={id} value={kind} onChange={(value) => setKind(value ?? "DEPARTMENT")} clearable={false} options={ORG_UNIT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
              )}
            </FormField>
            <FormField label="Parent" hint="Optional — leave empty for a root unit." error={errors.parentId}>
              {({ id }) => <Select id={id} value={parentId} onChange={setParentId} options={parentOptions} placeholder="No parent (root)" />}
            </FormField>
          </div>
        ) : drawer?.mode === "rename" ? (
          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {drawer.unit.code} · {KIND_LABELS[drawer.unit.kind]}
              </p>
            </div>
            <FormField label="Name" error={errors.name}>
              {({ id }) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
            </FormField>
          </div>
        ) : drawer?.mode === "move" ? (
          <div className="space-y-4">
            <div>
              <Label>{drawer.unit.name}</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {drawer.unit.code} · {KIND_LABELS[drawer.unit.kind]}
              </p>
            </div>
            <FormField label="New parent" hint="Leave empty to make this a root unit." error={errors.parentId}>
              {({ id }) => <Select id={id} value={parentId} onChange={setParentId} options={parentOptions} placeholder="No parent (root)" />}
            </FormField>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this org unit?"
        description={archiving ? `"${archiving.name}" will be archived. It stays historically resolvable but can no longer receive new assignments.` : undefined}
        confirmLabel="Archive"
        tone="danger"
        loading={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
