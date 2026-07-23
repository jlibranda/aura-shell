"use client";

import { create } from "zustand";
import { CURRENT_USER, type MockUser } from "@/lib/mock-data";

/**
 * MOCK authentication for the shell only. There is no backend, no real
 * credential check, and no security here. This entire store is a temporary
 * stand-in that a real authentication epic replaces wholesale.
 *
 * TODO(auth-epic): replace with real session handling.
 */
interface AuthState {
  hydrated: boolean;
  isAuthenticated: boolean;
  user: MockUser | null;
  hydrate: () => void;
  signIn: () => void;
  signOut: () => void;
}

const AUTH_KEY = "aura.mock.authenticated";

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  isAuthenticated: false,
  user: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const flag = window.localStorage.getItem(AUTH_KEY) === "true";
    set({
      hydrated: true,
      isAuthenticated: flag,
      user: flag ? CURRENT_USER : null,
    });
  },

  signIn: () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_KEY, "true");
    }
    set({ isAuthenticated: true, user: CURRENT_USER });
  },

  signOut: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_KEY);
    }
    set({ isAuthenticated: false, user: null });
  },
}));
