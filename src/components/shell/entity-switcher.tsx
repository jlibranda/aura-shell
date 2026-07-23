"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/overlay";
import { ENTITIES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function EntitySwitcher() {
  const [active, setActive] = useState(ENTITIES[0]);

  return (
    <DropdownMenu
      align="start"
      width="w-64"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none",
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/12 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-medium leading-tight text-foreground">
              {active.name}
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {active.region}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Entities</MenuLabel>
          {ENTITIES.map((entity) => (
            <MenuItem
              key={entity.id}
              onClick={() => {
                setActive(entity);
                close();
              }}
              trailing={
                entity.id === active.id ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null
              }
            >
              <span className="block">
                <span className="block text-sm leading-tight">{entity.name}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">
                  {entity.region}
                </span>
              </span>
            </MenuItem>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}
