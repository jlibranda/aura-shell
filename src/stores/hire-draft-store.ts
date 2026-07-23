/**
 * Persists the in-progress hire draft to localStorage so it survives refresh
 * and can be resumed. Session-only working state — the created employee lands
 * in the People repository on submit; the draft is cleared afterward.
 */
"use client";

import { create } from "zustand";
import { emptyDraft, type HireDraft } from "@/lib/people/hire-types";

const DRAFT_KEY = "aura.people.hireDraft";

function readDraft(): HireDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HireDraft;
  } catch {
    return null;
  }
}

function persist(draft: HireDraft | null) {
  if (typeof window === "undefined") return;
  if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  else window.localStorage.removeItem(DRAFT_KEY);
}

interface HireDraftState {
  draft: HireDraft;
  hasSavedDraft: boolean;
  hydrated: boolean;
  hydrate: () => void;
  setSection: <K extends keyof HireDraft>(section: K, value: Partial<HireDraft[K]>) => void;
  resumeSaved: () => void;
  discard: () => void;
  clear: () => void;
}

export const useHireDraftStore = create<HireDraftState>((set, get) => ({
  draft: emptyDraft(),
  hasSavedDraft: false,
  hydrated: false,

  hydrate: () => {
    const saved = readDraft();
    set({ hasSavedDraft: Boolean(saved), hydrated: true });
  },

  setSection: (section, value) => {
    const current = get().draft;
    const next: HireDraft = {
      ...current,
      [section]: { ...(current[section] as object), ...(value as object) },
      updatedAt: new Date().toISOString(),
    };
    persist(next);
    set({ draft: next, hasSavedDraft: true });
  },

  resumeSaved: () => {
    const saved = readDraft();
    if (saved) set({ draft: saved, hasSavedDraft: true });
  },

  discard: () => {
    persist(null);
    set({ draft: emptyDraft(), hasSavedDraft: false });
  },

  clear: () => {
    persist(null);
    set({ draft: emptyDraft(), hasSavedDraft: false });
  },
}));