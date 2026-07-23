/**
 * In-memory session repository for People. This is the session source of truth,
 * seeded from mock data. Every mutation reflects immediately in the UI and
 * writes a timeline entry where appropriate. A later data epic swaps this store
 * for real APIs without changing the views that consume it.
 */
"use client";

import { create } from "zustand";
import { CURRENT_USER } from "@/lib/mock-data";
import { createSeed } from "@/lib/people/people-data";
import { ACTION_RESULT } from "@/lib/people/status-machine";
import type {
  CompensationRecord,
  Department,
  Employee,
  EmployeeStatus,
  EmergencyContact,
  EquipmentItem,
  HireInput,
  PersonDocument,
  PayFrequency,
  Team,
  TimelineEvent,
  TimelineEventType,
} from "@/lib/people/people-types";

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function timelineEvent(
  type: TimelineEventType,
  title: string,
  description?: string,
): TimelineEvent {
  return {
    id: genId("tl"),
    type,
    title,
    description,
    timestamp: nowIso(),
    actor: CURRENT_USER.name,
  };
}

export interface UpdateEmployeePatch {
  personal?: Partial<Employee["personal"]>;
  employment?: Partial<Employee["employment"]>;
  status?: EmployeeStatus;
  timeline?: TimelineEvent[];
}

export interface ChangeManagerResult {
  ok: boolean;
  error?: string;
}

interface RepositoryState {
  employees: Employee[];
  departments: Department[];
  teams: Team[];
  documents: PersonDocument[];
  equipment: EquipmentItem[];

  reset: () => void;

  hireEmployee: (input: HireInput) => string;
  updateEmployee: (id: string, patch: UpdateEmployeePatch) => void;
  promote: (
    id: string,
    input: { positionTitle: string; effectiveDate: string; baseMonthly?: number },
  ) => void;
  transfer: (
    id: string,
    input: { departmentId?: string; teamId?: string; entityId?: string; locationLabel?: string; effectiveDate: string },
  ) => void;
  changeCompensation: (
    id: string,
    input: { baseMonthly: number; reason: string; effectiveDate: string; payFrequency?: PayFrequency },
  ) => void;
  changeManager: (id: string, managerId: string | undefined) => ChangeManagerResult;
  suspend: (id: string, input: { reason: string; startDate: string; endDate?: string }) => void;
  reactivate: (id: string, status?: EmployeeStatus) => void;
  terminate: (id: string, input: { reason: string; lastDay: string }) => void;
  offboard: (id: string) => void;
  approve: (id: string, note?: string) => void;

  addNote: (id: string, body: string) => void;
  updateNote: (id: string, noteId: string, body: string) => void;
  removeNote: (id: string, noteId: string) => void;

  addEmergencyContact: (id: string, contact: Omit<EmergencyContact, "id">) => void;
  updateEmergencyContact: (id: string, contactId: string, patch: Partial<EmergencyContact>) => void;
  removeEmergencyContact: (id: string, contactId: string) => void;

  addDocument: (input: Omit<PersonDocument, "id" | "currentVersionId" | "versions"> & { sizeLabel: string; note?: string }) => void;
  addDocumentVersion: (documentId: string, input: { sizeLabel: string; note?: string }) => void;
  removeDocument: (documentId: string) => void;

  assignEquipment: (input: Omit<EquipmentItem, "id" | "status" | "returnedAt">) => void;
  returnEquipment: (equipmentId: string) => void;
}

function isManagerCycle(
  employees: Employee[],
  employeeId: string,
  candidateManagerId: string | undefined,
): boolean {
  if (!candidateManagerId) return false;
  if (candidateManagerId === employeeId) return true;
  const byId = new Map(employees.map((e) => [e.id, e]));
  let cursor: string | undefined = candidateManagerId;
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === employeeId) return true;
    if (guard.has(cursor)) break;
    guard.add(cursor);
    cursor = byId.get(cursor)?.employment.managerId;
  }
  return false;
}

const seed = createSeed();

export const usePeopleRepository = create<RepositoryState>((set, get) => {
  const patchEmployee = (id: string, updater: (e: Employee) => Employee) =>
    set((state) => ({
      employees: state.employees.map((e) => (e.id === id ? updater(e) : e)),
    }));

  const pushTimeline = (e: Employee, event: TimelineEvent): Employee => ({
    ...e,
    timeline: [event, ...e.timeline],
  });

  return {
    employees: seed.employees,
    departments: seed.departments,
    teams: seed.teams,
    documents: seed.documents,
    equipment: seed.equipment,

    reset: () => {
      const fresh = createSeed();
      set({
        employees: fresh.employees,
        departments: fresh.departments,
        teams: fresh.teams,
        documents: fresh.documents,
        equipment: fresh.equipment,
      });
    },

    hireEmployee: (input) => {
      const id = genId("emp");
      const number = id.slice(-6).toUpperCase();
      const status = input.status ?? ACTION_RESULT.hire.status ?? "probationary";
      const comp: CompensationRecord = {
        id: genId("comp"),
        effectiveDate: input.employment.hireDate,
        baseMonthly: input.baseMonthly,
        currency: input.currency ?? "PHP",
        payFrequency: input.payFrequency,
        reason: "Hired",
        changedBy: CURRENT_USER.name,
      };
      const employee: Employee = {
        id,
        employeeNumber: `NW-${number}`,
        status,
        personal: input.personal,
        employment: { ...input.employment },
        compensation: { current: comp, history: [comp] },
        governmentIds: {
          sss: { number: input.governmentIds?.sss ?? null, verified: false },
          philhealth: { number: input.governmentIds?.philhealth ?? null, verified: false },
          pagibig: { number: input.governmentIds?.pagibig ?? null, verified: false },
          tin: { number: input.governmentIds?.tin ?? null, verified: false },
        },
        emergencyContacts: [],
        timeline: [timelineEvent("hired", "Hired", input.employment.positionTitle)],
        notes: [],
        offboardedAt: null,
      };
      set((state) => ({ employees: [employee, ...state.employees] }));
      return id;
    },

    updateEmployee: (id, patch) =>
      patchEmployee(id, (e) => ({
        ...e,
        status: patch.status ?? e.status,
        personal: { ...e.personal, ...patch.personal },
        employment: { ...e.employment, ...patch.employment },
        timeline: patch.timeline ?? e.timeline,
      })),

    promote: (id, input) =>
      patchEmployee(id, (e) => {
        let next: Employee = {
          ...e,
          employment: { ...e.employment, positionTitle: input.positionTitle },
        };
        if (typeof input.baseMonthly === "number" && input.baseMonthly !== e.compensation.current.baseMonthly) {
          const record: CompensationRecord = {
            id: genId("comp"),
            effectiveDate: input.effectiveDate,
            baseMonthly: input.baseMonthly,
            currency: e.compensation.current.currency,
            payFrequency: e.compensation.current.payFrequency,
            reason: "Promotion",
            changedBy: CURRENT_USER.name,
          };
          next = {
            ...next,
            compensation: { current: record, history: [...e.compensation.history, record] },
          };
        }
        return pushTimeline(next, timelineEvent("promoted", "Promoted", `Now ${input.positionTitle}`));
      }),

    transfer: (id, input) =>
      patchEmployee(id, (e) =>
        pushTimeline(
          {
            ...e,
            employment: {
              ...e.employment,
              departmentId: input.departmentId ?? e.employment.departmentId,
              teamId: input.teamId ?? e.employment.teamId,
              entityId: input.entityId ?? e.employment.entityId,
              locationLabel: input.locationLabel ?? e.employment.locationLabel,
            },
          },
          timelineEvent("transferred", "Transferred", "Department, team, or location updated"),
        ),
      ),

    changeCompensation: (id, input) =>
      patchEmployee(id, (e) => {
        const record: CompensationRecord = {
          id: genId("comp"),
          effectiveDate: input.effectiveDate,
          baseMonthly: input.baseMonthly,
          currency: e.compensation.current.currency,
          payFrequency: input.payFrequency ?? e.compensation.current.payFrequency,
          reason: input.reason,
          changedBy: CURRENT_USER.name,
        };
        const delta = input.baseMonthly - e.compensation.current.baseMonthly;
        const sign = delta >= 0 ? "+" : "";
        return pushTimeline(
          {
            ...e,
            compensation: { current: record, history: [...e.compensation.history, record] },
          },
          timelineEvent(
            "salary_change",
            "Compensation changed",
            `Base ${sign}${delta.toLocaleString()} — ${input.reason}`,
          ),
        );
      }),

    changeManager: (id, managerId) => {
      if (isManagerCycle(get().employees, id, managerId)) {
        return { ok: false, error: "That change would create a reporting cycle." };
      }
      patchEmployee(id, (e) =>
        pushTimeline(
          { ...e, employment: { ...e.employment, managerId } },
          timelineEvent("manager_change", "Manager changed", "Reporting line updated"),
        ),
      );
      return { ok: true };
    },

    suspend: (id, input) =>
      patchEmployee(id, (e) =>
        pushTimeline(
          { ...e, status: "suspended" },
          timelineEvent("suspended", "Suspended", input.reason),
        ),
      ),

    reactivate: (id, status = "regular") =>
      patchEmployee(id, (e) =>
        pushTimeline({ ...e, status }, timelineEvent("reactivated", "Reactivated", "Returned to active duty")),
      ),

    terminate: (id, input) =>
      patchEmployee(id, (e) =>
        pushTimeline(
          { ...e, status: "terminated" },
          timelineEvent("terminated", "Terminated", `${input.reason} — last day ${input.lastDay}`),
        ),
      ),

    offboard: (id) =>
      patchEmployee(id, (e) =>
        pushTimeline(
          { ...e, offboardedAt: nowIso() },
          timelineEvent("offboarded", "Offboarded", "Offboarding checklist completed"),
        ),
      ),

    approve: (id, note) =>
      patchEmployee(id, (e) =>
        pushTimeline(e, timelineEvent("approved", "Approved", note ?? "Request approved")),
      ),

    addNote: (id, body) =>
      patchEmployee(id, (e) =>
        pushTimeline(
          {
            ...e,
            notes: [
              { id: genId("note"), body, author: CURRENT_USER.name, createdAt: nowIso() },
              ...e.notes,
            ],
          },
          timelineEvent("note_added", "Note added"),
        ),
      ),

    updateNote: (id, noteId, body) =>
      patchEmployee(id, (e) => ({
        ...e,
        notes: e.notes.map((n) =>
          n.id === noteId ? { ...n, body, updatedAt: nowIso() } : n,
        ),
      })),

    removeNote: (id, noteId) =>
      patchEmployee(id, (e) => ({
        ...e,
        notes: e.notes.filter((n) => n.id !== noteId),
      })),

    addEmergencyContact: (id, contact) =>
      patchEmployee(id, (e) => ({
        ...e,
        emergencyContacts: [...e.emergencyContacts, { ...contact, id: genId("ec") }],
      })),

    updateEmergencyContact: (id, contactId, patch) =>
      patchEmployee(id, (e) => ({
        ...e,
        emergencyContacts: e.emergencyContacts.map((c) =>
          c.id === contactId ? { ...c, ...patch } : c,
        ),
      })),

    removeEmergencyContact: (id, contactId) =>
      patchEmployee(id, (e) => ({
        ...e,
        emergencyContacts: e.emergencyContacts.filter((c) => c.id !== contactId),
      })),

    addDocument: (input) => {
      const versionId = genId("dv");
      const doc: PersonDocument = {
        id: genId("doc"),
        employeeId: input.employeeId,
        name: input.name,
        category: input.category,
        currentVersionId: versionId,
        versions: [
          {
            id: versionId,
            versionLabel: "v1",
            uploadedBy: CURRENT_USER.name,
            uploadedAt: nowIso(),
            sizeLabel: input.sizeLabel,
            note: input.note,
          },
        ],
      };
      set((state) => ({ documents: [doc, ...state.documents] }));
      patchEmployee(input.employeeId, (e) =>
        pushTimeline(e, timelineEvent("document_added", "Document added", input.name)),
      );
    },

    addDocumentVersion: (documentId, input) =>
      set((state) => ({
        documents: state.documents.map((d) => {
          if (d.id !== documentId) return d;
          const versionId = genId("dv");
          return {
            ...d,
            currentVersionId: versionId,
            versions: [
              ...d.versions,
              {
                id: versionId,
                versionLabel: `v${d.versions.length + 1}`,
                uploadedBy: CURRENT_USER.name,
                uploadedAt: nowIso(),
                sizeLabel: input.sizeLabel,
                note: input.note,
              },
            ],
          };
        }),
      })),

    removeDocument: (documentId) =>
      set((state) => ({
        documents: state.documents.filter((d) => d.id !== documentId),
      })),

    assignEquipment: (input) =>
      set((state) => ({
        equipment: [
          { ...input, id: genId("eq"), status: "assigned", returnedAt: null },
          ...state.equipment,
        ],
      })),

    returnEquipment: (equipmentId) =>
      set((state) => ({
        equipment: state.equipment.map((item) =>
          item.id === equipmentId
            ? { ...item, status: "returned", returnedAt: nowIso() }
            : item,
        ),
      })),
  };
});

/* --------------------------- selector conveniences ------------------------ */

export function selectEmployeeById(
  employees: Employee[],
  id: string,
): Employee | undefined {
  return employees.find((e) => e.id === id);
}

export function selectReports(employees: Employee[], managerId: string): Employee[] {
  return employees.filter((e) => e.employment.managerId === managerId);
}

export function useEmployee(id: string): Employee | undefined {
  return usePeopleRepository((s) => s.employees.find((e) => e.id === id));
}

export function useReports(managerId: string): Employee[] {
  return usePeopleRepository((s) =>
    s.employees.filter((e) => e.employment.managerId === managerId),
  );
}

export function useEmployeeDocuments(employeeId: string): PersonDocument[] {
  return usePeopleRepository((s) =>
    s.documents.filter((d) => d.employeeId === employeeId),
  );
}

export function useEmployeeEquipment(employeeId: string): EquipmentItem[] {
  return usePeopleRepository((s) =>
    s.equipment.filter((eq) => eq.employeeId === employeeId),
  );
}
