/**
 * Coordinates People lifecycle-action surfaces (drawers/dialogs). Only one
 * action is open at a time, and opening one closes the shell's transient
 * overlays (command palette / search / notifications) to honor the Sprint 1
 * single-overlay discipline.
 */
"use client";

import { create } from "zustand";
import { useUIStore } from "@/stores/ui-store";
import type { ActionType } from "@/lib/people/people-types";

export interface ActiveAction {
  action: ActionType;
  targetIds: string[];
}

interface ActionStoreState {
  active: ActiveAction | null;
  open: (action: ActionType, targetIds: string | string[]) => void;
  close: () => void;
  isOpen: (action: ActionType) => boolean;
}

export const usePeopleActionStore = create<ActionStoreState>((set, get) => ({
  active: null,

  open: (action, targetIds) => {
    useUIStore.getState().closeOverlays();
    set({
      active: {
        action,
        targetIds: Array.isArray(targetIds) ? targetIds : [targetIds],
      },
    });
  },

  close: () => set({ active: null }),

  isOpen: (action) => get().active?.action === action,
}));