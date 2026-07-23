"use client";

import { useState } from "react";
import { X, Download, UserCog, Sparkles } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { usePeopleDirectoryStore } from "@/stores/people-directory-store";
import { useUIStore } from "@/stores/ui-store";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";

/**
 * Appears when rows are selected. Lifecycle mutations belong to a later
 * milestone; in-scope bulk operations are export (session CSV) and Copilot
 * hand-off. Actions that would mutate records are surfaced but clearly routed
 * to the (not-yet-built) guided flows via an informative toast.
 */
export function BulkActionBar() {
  const selectedIds = usePeopleDirectoryStore((s) => s.selectedIds);
  const clearSelection = usePeopleDirectoryStore((s) => s.clearSelection);
  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen);
  const [exporting, setExporting] = useState(false);

  if (selectedIds.length === 0) return null;

  const selectedSet = new Set(selectedIds);
  const selected = employees.filter((e) => selectedSet.has(e.id));
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "";

  const exportCsv = () => {
    setExporting(true);
    try {
      const header = ["Employee ID", "Name", "Email", "Job Title", "Department", "Status", "Hire Date"];
      const rows = selected.map((e) => [
        e.employeeNumber,
        fullName(e),
        e.personal.email,
        e.employment.positionTitle,
        deptName(e.employment.departmentId),
        e.status,
        e.employment.hireDate,
      ]);
      const csv = [header, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aura-people-${selected.length}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selected.length} ${selected.length === 1 ? "record" : "records"}`);
    } catch {
      toast.error("Export failed", { description: "Couldn't generate the file." });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-surface/95 p-2 pl-3 shadow-overlay backdrop-blur-md animate-scale-in">
        <span className="tabular flex h-7 items-center rounded-md bg-primary/10 px-2.5 text-sm font-medium text-primary">
          {selectedIds.length} selected
        </span>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4" />
          Export
        </Button>

        <DropdownMenu
          width="w-56"
          trigger={({ toggle }) => (
            <Button variant="ghost" size="sm" onClick={toggle}>
              <UserCog className="h-4 w-4" />
              Manage
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuLabel>Bulk actions</MenuLabel>
              <MenuItem
                onClick={() => {
                  close();
                  toast("Guided bulk changes are coming soon", {
                    description: "Status, manager, and team changes will run through guided flows in a later update.",
                  });
                }}
              >
                Change status
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  toast("Guided bulk changes are coming soon", {
                    description: "Reassigning managers in bulk arrives with lifecycle actions.",
                  });
                }}
              >
                Assign manager
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  toast("Guided bulk changes are coming soon", {
                    description: "Adding people to teams in bulk arrives with lifecycle actions.",
                  });
                }}
              >
                Add to team
              </MenuItem>
            </>
          )}
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCopilotOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          Ask Copilot
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <IconButton label="Clear selection" onClick={clearSelection}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}