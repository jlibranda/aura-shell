/**
 * Directory UI state: row selection, display density, column visibility, and
 * saved views. Saved views + density persist to localStorage (mirroring the
 * Sprint 1 ui-store approach); selection is session-only.
 */
"use client";

import { create } from "zustand";
import { DEFAULT_SAVED_VIEWS } from "@/lib/people/people-data";
import type { SavedView } from "@/lib/people/people-types";

export type Density = "comfortable" | "compact";

export const DIRECTORY_COLUMNS = [
  "employee",
  "employeeNumber",
  "positionTitle",
  "department",
  "status",
  "hireDate",
] as const;

export type DirectoryColumnKey = (typeof DIRECTORY_COLUMNS)[number];

const VIEWS_KEY = "aura.people.savedViews";
const DENSITY_KEY = "aura.people.density";

function systemViews(): SavedView[] {
  return DEFAULT_SAVED_VIEWS.map((v) => ({
    id: v.id,
    name: v.name,
    system: v.system,
    query: { ...v.query },
  }));
}

function readUserViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed.filter((v) => !v.system) : [];
  } catch {
    return [];
  }
}

function persistUserViews(views: SavedView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views.filter((v) => !v.system)));
}

function readDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

interface DirectoryState {
  selectedIds: string[];
  density: Density;
  hiddenColumns: DirectoryColumnKey[];
  savedViews: SavedView[];

  isSelected: (id: string) => boolean;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelection: () => void;

  setDensity: (density: Density) => void;
  toggleColumn: (key: DirectoryColumnKey) => void;

  addSavedView: (name: string, query: SavedView["query"]) => void;
  renameSavedView: (id: string, name: string) => void;
  removeSavedView: (id: string) => void;

  hydrate: () => void;
}

export const usePeopleDirectoryStore = create<DirectoryState>((set, get) => ({
  selectedIds: [],
  density: "comfortable",
  hiddenColumns: [],
  savedViews: systemViews(),

  isSelected: (id) => get().selectedIds.includes(id),

  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id],
    })),

  setSelected: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),

  setDensity: (density) => {
    if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_KEY, density);
    set({ density });
  },

  toggleColumn: (key) =>
    set((state) => ({
      hiddenColumns: state.hiddenColumns.includes(key)
        ? state.hiddenColumns.filter((k) => k !== key)
        : [...state.hiddenColumns, key],
    })),

  addSavedView: (name, query) =>
    set((state) => {
      const view: SavedView = {
        id: `sv-user-${Date.now().toString(36)}`,
        name,
        query,
      };
      const next = [...state.savedViews, view];
      persistUserViews(next);
      return { savedViews: next };
    }),

  renameSavedView: (id, name) =>
    set((state) => {
      const next = state.savedViews.map((v) =>
        v.id === id && !v.system ? { ...v, name } : v,
      );
      persistUserViews(next);
      return { savedViews: next };
    }),

  removeSavedView: (id) =>
    set((state) => {
      const next = state.savedViews.filter((v) => v.id !== id || v.system);
      persistUserViews(next);
      return { savedViews: next };
    }),

  hydrate: () =>
    set({
      density: readDensity(),
      savedViews: [...systemViews(), ...readUserViews()],
    }),
}));