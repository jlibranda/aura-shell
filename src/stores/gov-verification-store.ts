/**
 * Authoritative government-ID verification records, keyed by `${employeeId}:${idKey}`.
 * Kept parallel to the People repository so the Sprint 2.1 GovId type is
 * unchanged. Persists to localStorage so verification survives refresh in this
 * mock build. A later data epic can fold this into the real API.
 */
"use client";

import { create } from "zustand";
import { CURRENT_USER } from "@/lib/mock-data";
import { govKey } from "@/lib/people/gov-verification";
import type { GovVerificationRecord } from "@/lib/people/gov-verification";
import type { GovIdKey } from "@/lib/people/people-types";

const STORE_KEY = "aura.people.govVerification";

function readAll(): Record<string, GovVerificationRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GovVerificationRecord>) : {};
  } catch {
    return {};
  }
}

function persist(records: Record<string, GovVerificationRecord>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

function nowIso() {
  return new Date().toISOString();
}

interface GovVerificationState {
  records: Record<string, GovVerificationRecord>;
  hydrated: boolean;
  hydrate: () => void;
  get: (employeeId: string, idKey: GovIdKey) => GovVerificationRecord | undefined;
  /** Record a number edit → moves the ID into pending (unless cleared). */
  markUpdated: (employeeId: string, idKey: GovIdKey, hasNumber: boolean) => void;
  verify: (employeeId: string, idKey: GovIdKey, notes: string) => void;
  reject: (employeeId: string, idKey: GovIdKey, notes: string) => void;
}

export const useGovVerificationStore = create<GovVerificationState>((set, get) => ({
  records: {},
  hydrated: false,

  hydrate: () => set({ records: readAll(), hydrated: true }),

  get: (employeeId, idKey) => get().records[govKey(employeeId, idKey)],

  markUpdated: (employeeId, idKey, hasNumber) => {
    const key = govKey(employeeId, idKey);
    const prev = get().records[key];
    const next: GovVerificationRecord = {
      status: hasNumber ? "pending" : "not_provided",
      notes: prev?.notes ?? null,
      verifiedBy: null,
      verifiedAt: null,
      updatedBy: CURRENT_USER.name,
      updatedAt: nowIso(),
    };
    const records = { ...get().records, [key]: next };
    persist(records);
    set({ records });
  },

  verify: (employeeId, idKey, notes) => {
    const key = govKey(employeeId, idKey);
    const prev = get().records[key];
    const next: GovVerificationRecord = {
      status: "verified",
      notes: notes.trim() || null,
      verifiedBy: CURRENT_USER.name,
      verifiedAt: nowIso(),
      updatedBy: prev?.updatedBy ?? CURRENT_USER.name,
      updatedAt: prev?.updatedAt ?? nowIso(),
    };
    const records = { ...get().records, [key]: next };
    persist(records);
    set({ records });
  },

  reject: (employeeId, idKey, notes) => {
    const key = govKey(employeeId, idKey);
    const prev = get().records[key];
    const next: GovVerificationRecord = {
      status: "rejected",
      notes: notes.trim() || null,
      verifiedBy: CURRENT_USER.name,
      verifiedAt: nowIso(),
      updatedBy: prev?.updatedBy ?? CURRENT_USER.name,
      updatedAt: prev?.updatedAt ?? nowIso(),
    };
    const records = { ...get().records, [key]: next };
    persist(records);
    set({ records });
  },
}));