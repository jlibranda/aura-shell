"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, CornerDownLeft, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Kbd } from "@/components/ui/primitives";
import { NAV_ITEMS } from "@/lib/navigation";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const open = useUIStore((s) => s.overlay === "commandPalette");
  const close = useUIStore((s) => s.closeOverlays);
  const openCopilot = useUIStore((s) => s.setCopilotOpen);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = NAV_ITEMS.map((item) => ({
      id: `nav-${item.key}`,
      label: `Go to ${item.label}`,
      group: "Navigate",
      icon: item.icon,
      keywords: item.description,
      run: () => router.push(item.href),
    }));

    const actions: Command[] = [
      {
        id: "action-copilot",
        label: "Ask Copilot",
        group: "Actions",
        icon: Sparkles,
        keywords: "ai assistant question help",
        run: () => openCopilot(true),
      },
    ];

    return [...actions, ...nav];
  }, [router, openCopilot]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      (c.label + " " + (c.keywords ?? "")).toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset transient state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const runAt = (index: number) => {
    const cmd = filtered[index];
    if (!cmd) return;
    close();
    // Defer so the modal unmounts before navigation/side effects.
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let renderIndex = -1;
  let lastGroup = "";

  return (
    <Modal open={open} onClose={close} align="top" labelledBy="cmd-title">
      <h2 id="cmd-title" className="sr-only">
        Command palette
      </h2>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search for a page or action…"
          className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          aria-label="Command palette search"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            No results for “{query}”.
          </div>
        ) : (
          filtered.map((cmd) => {
            renderIndex += 1;
            const index = renderIndex;
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const Icon = cmd.icon;
            return (
              <div key={cmd.id}>
                {showGroup ? (
                  <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {cmd.group}
                  </div>
                ) : null}
                <button
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => runAt(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                    index === active
                      ? "bg-surface-muted text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1 text-left text-foreground">
                    {cmd.label}
                  </span>
                  {index === active ? (
                    cmd.group === "Actions" ? (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    )
                  ) : null}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          to navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          to select
        </span>
      </div>
    </Modal>
  );
}
