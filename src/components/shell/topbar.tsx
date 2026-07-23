"use client";

import { Search, Sparkles, Menu } from "lucide-react";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { EntitySwitcher } from "@/components/shell/entity-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Notifications } from "@/components/shell/notifications";
import { UserMenu } from "@/components/shell/user-menu";
import { IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { useUIStore } from "@/stores/ui-store";

export function TopBar() {
  const openSearch = useUIStore((s) => s.openSearch);
  const openPalette = useUIStore((s) => s.openCommandPalette);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);
  const openMobileNav = useUIStore((s) => s.openMobileNav);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      {/* Left: mobile menu + breadcrumbs + entity */}
      <div className="flex items-center gap-2">
        <button
          onClick={openMobileNav}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden lg:block">
          <Breadcrumbs />
        </div>
      </div>

      <div className="hidden md:block lg:ml-2">
        <EntitySwitcher />
      </div>

      {/* Center: search */}
      <div className="flex flex-1 justify-center px-2">
        <button
          onClick={openSearch}
          className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-md border border-border bg-surface-muted/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:border-ring"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search people, pages, records…</span>
          <Kbd>/</Kbd>
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={openPalette}
          className="hidden h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none sm:flex"
          aria-label="Open command palette"
        >
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>

        <IconButton label="Ask Copilot" onClick={toggleCopilot}>
          <Sparkles className="h-[18px] w-[18px]" />
        </IconButton>

        <Notifications />
        <ThemeToggle />

        <div className="mx-1 h-6 w-px bg-border" />

        <UserMenu />
      </div>
    </header>
  );
}
