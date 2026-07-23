"use client";

import { create } from "zustand";

/**
 * One small store coordinates all shell chrome so overlays never fight
 * (Risk R2 in the plan). Opening any modal-class overlay closes the others.
 */
type Overlay = "commandPalette" | "search" | "notifications" | null;

interface UIState {
  // Persistent chrome
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  copilotOpen: boolean;

  // Mutually-exclusive transient overlays
  overlay: Overlay;

  // Sidebar
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  openMobileNav: () => void;
  closeMobileNav: () => void;

  // Copilot dock (can coexist with the sidebar; closes transient overlays)
  toggleCopilot: () => void;
  setCopilotOpen: (v: boolean) => void;

  // Transient overlays
  openCommandPalette: () => void;
  openSearch: () => void;
  openNotifications: () => void;
  closeOverlays: () => void;
}

const SIDEBAR_KEY = "aura.sidebar.collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_KEY) === "true";
}

function persistCollapsed(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_KEY, String(v));
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  copilotOpen: false,
  overlay: null,

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    persistCollapsed(next);
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed: (v) => {
    persistCollapsed(v);
    set({ sidebarCollapsed: v });
  },
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),

  toggleCopilot: () => set({ copilotOpen: !get().copilotOpen, overlay: null }),
  setCopilotOpen: (v) => set({ copilotOpen: v }),

  openCommandPalette: () => set({ overlay: "commandPalette" }),
  openSearch: () => set({ overlay: "search" }),
  openNotifications: () =>
    set({ overlay: get().overlay === "notifications" ? null : "notifications" }),
  closeOverlays: () => set({ overlay: null }),
}));

/** Hydrate persisted sidebar preference on the client after mount. */
export function hydrateUIPreferences() {
  useUIStore.setState({ sidebarCollapsed: readCollapsed() });
}
