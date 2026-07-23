"use client";

import { useState } from "react";
import { Bookmark, Check, Plus, Star, Trash2, Pencil, X } from "lucide-react";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Separator } from "@/components/ui/primitives";
import { usePeopleDirectoryStore } from "@/stores/people-directory-store";
import { toast } from "@/components/ui/toast";
import type { DirectoryQuery, SavedView } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function viewMatchesQuery(view: SavedView, query: DirectoryQuery): boolean {
  return (Object.keys(view.query) as (keyof DirectoryQuery)[]).every((key) => {
    const target = view.query[key];
    const current = query[key];
    if (Array.isArray(target)) {
      const cur = Array.isArray(current) ? current : [];
      return target.length === cur.length && target.every((t) => cur.includes(t as never));
    }
    return target === current;
  });
}

export function SavedViewsMenu({
  query,
  onApply,
}: {
  query: DirectoryQuery;
  onApply: (patch: Partial<DirectoryQuery>) => void;
}) {
  const savedViews = usePeopleDirectoryStore((s) => s.savedViews);
  const addSavedView = usePeopleDirectoryStore((s) => s.addSavedView);
  const renameSavedView = usePeopleDirectoryStore((s) => s.renameSavedView);
  const removeSavedView = usePeopleDirectoryStore((s) => s.removeSavedView);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activeView = savedViews.find((v) => viewMatchesQuery(v, query));

  const captureCurrent = (): SavedView["query"] => ({
    search: query.search || undefined,
    statuses: query.statuses.length ? query.statuses : undefined,
    departmentIds: query.departmentIds.length ? query.departmentIds : undefined,
    teamIds: query.teamIds.length ? query.teamIds : undefined,
    employmentTypes: query.employmentTypes.length ? query.employmentTypes : undefined,
    managerId: query.managerId ?? undefined,
    entityId: query.entityId ?? undefined,
    missingGovId: query.missingGovId ?? undefined,
    hiredFrom: query.hiredFrom ?? undefined,
    hiredTo: query.hiredTo ?? undefined,
    sortKey: query.sortKey,
    sortDir: query.sortDir,
  });

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addSavedView(trimmed, captureCurrent());
    toast.success("View saved", { description: `“${trimmed}” is now in your saved views.` });
    setName("");
    setCreating(false);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameSavedView(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <DropdownMenu
      align="start"
      width="w-72"
      trigger={({ open, toggle }) => (
        <Button variant="outline" size="sm" onClick={toggle} aria-expanded={open}>
          <Bookmark className="h-4 w-4" />
          {activeView ? activeView.name : "Saved views"}
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Saved views</MenuLabel>
          {savedViews.map((view) =>
            renamingId === view.id ? (
              <div key={view.id} className="flex items-center gap-1.5 px-1.5 py-1">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="h-8"
                />
                <button
                  onClick={commitRename}
                  aria-label="Save name"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-surface-muted"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                key={view.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-1 transition-colors",
                  activeView?.id === view.id ? "bg-surface-muted" : "hover:bg-surface-muted",
                )}
              >
                <button
                  onClick={() => {
                    onApply(view.query);
                    close();
                  }}
                  className="flex flex-1 items-center gap-2.5 px-1.5 py-2 text-left text-sm text-foreground focus-visible:outline-none"
                >
                  {view.system ? (
                    <Star className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{view.name}</span>
                  {activeView?.id === view.id ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </button>
                {!view.system ? (
                  <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setRenamingId(view.id);
                        setRenameValue(view.name);
                      }}
                      aria-label={`Rename ${view.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        removeSavedView(view.id);
                        toast("View removed");
                      }}
                      aria-label={`Delete ${view.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : null}
              </div>
            ),
          )}

          <Separator className="my-1" />

          {creating ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Name this view"
                className="h-8"
              />
              <button
                onClick={create}
                aria-label="Save view"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-surface-muted"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCreating(false)}
                aria-label="Cancel"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <MenuItem icon={Plus} onClick={() => setCreating(true)}>
              Save current view
            </MenuItem>
          )}
        </>
      )}
    </DropdownMenu>
  );
}