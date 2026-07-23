"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, User, FileText } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Kbd } from "@/components/ui/primitives";
import { SEARCH_PLACEHOLDER_RESULTS } from "@/lib/mock-data";
import { useUIStore } from "@/stores/ui-store";

export function GlobalSearch() {
  const open = useUIStore((s) => s.overlay === "search");
  const close = useUIStore((s) => s.closeOverlays);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_PLACEHOLDER_RESULTS;
    return SEARCH_PLACEHOLDER_RESULTS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.subtitle.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <Modal open={open} onClose={close} align="top" labelledBy="search-title">
      <h2 id="search-title" className="sr-only">
        Search AURA
      </h2>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, pages, and records…"
          className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          aria-label="Search"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            No matches yet. Search is a placeholder in this build.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = group.label === "People" ? User : FileText;
                return (
                  <button
                    key={item.id}
                    onClick={close}
                    className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-foreground">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
