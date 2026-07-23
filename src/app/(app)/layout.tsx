"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, SidebarContent } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalSearch } from "@/components/shell/global-search";
import { CopilotDock } from "@/components/shell/copilot-dock";
import { Sheet } from "@/components/ui/overlay";
import { useUIStore, hydrateUIPreferences } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useHotkey } from "@/lib/hooks";

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const openSearch = useUIStore((s) => s.openSearch);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);

  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  // Hydrate persisted client state once on mount.
  useEffect(() => {
    hydrateUIPreferences();
    hydrateAuth();
  }, [hydrateAuth]);

  // Client-side route guard (mock auth) — development only. In production,
  // middleware and the server loaders are the authoritative guard; this
  // localStorage flag is never set there, so it must not gate real sessions.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  // Global shortcuts.
  useHotkey("mod+k", (e) => {
    e.preventDefault();
    openCommandPalette();
  });
  useHotkey("/", (e) => {
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    openSearch();
  });
  useHotkey("mod+j", (e) => {
    e.preventDefault();
    toggleCopilot();
  });

  // Avoid flashing protected content before the auth check resolves —
  // development only; production trusts the server-side guard instead.
  if (process.env.NODE_ENV !== "production" && (!hydrated || !isAuthenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Mobile navigation drawer */}
      <Sheet
        open={mobileNavOpen}
        onClose={closeMobileNav}
        side="left"
        labelledBy="mobile-nav-title"
      >
        <h2 id="mobile-nav-title" className="sr-only">
          Navigation
        </h2>
        <SidebarContent collapsed={false} onNavigate={closeMobileNav} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main className="flex-1 overflow-y-auto">
          {/* Breadcrumbs region — visible on small screens where the top bar hides them */}
          <div className="border-b border-border px-4 py-2.5 lg:hidden">
            <Breadcrumbs />
          </div>
          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      {/* Global overlays live at the layout level so they're reachable everywhere */}
      <CopilotDock />
      <CommandPalette />
      <GlobalSearch />
    </div>
  );
}
