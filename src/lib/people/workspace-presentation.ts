/**
 * Read-only presentation helpers for the employee workspace tabs (Documents,
 * Notes, Emergency Contacts, Assets). Derives display-only fields — document
 * grouping, expiration, note visibility, asset condition — from existing
 * repository records. Deterministic projections only; no new stored state.
 */
import type {
  DocumentCategory,
  EmployeeNote,
  EquipmentItem,
  PersonDocument,
} from "@/lib/people/people-types";

/* -------------------------------- documents ------------------------------- */

export type DocumentGroupKey = "government" | "employment" | "payroll" | "company";
export type DocumentStatus = "active" | "expired" | "missing";

export interface DocumentGroupDef {
  key: DocumentGroupKey;
  label: string;
  categories: DocumentCategory[];
}

export const DOCUMENT_GROUPS: DocumentGroupDef[] = [
  { key: "government", label: "Government", categories: ["government", "identification", "medical"] },
  { key: "employment", label: "Employment", categories: ["contract", "performance"] },
  { key: "payroll", label: "Payroll", categories: ["payroll"] },
  { key: "company", label: "Company", categories: ["other"] },
];

const CATEGORY_TO_GROUP = new Map<DocumentCategory, DocumentGroupKey>();
for (const group of DOCUMENT_GROUPS) {
  for (const category of group.categories) CATEGORY_TO_GROUP.set(category, group.key);
}

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  contract: "Contract",
  government: "Government",
  identification: "Identification",
  payroll: "Payroll",
  performance: "Performance",
  medical: "Medical",
  other: "Company",
};

/** Categories that carry an expiration date (derived, display-only). */
const EXPIRING_CATEGORIES = new Set<DocumentCategory>(["identification", "medical", "contract"]);

function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DocumentView {
  id: string;
  name: string;
  category: DocumentCategory;
  categoryLabel: string;
  group: DocumentGroupKey;
  status: DocumentStatus;
  uploadedBy: string;
  uploadedAt: string;
  expiresAt: string | null;
}

export function toDocumentView(doc: PersonDocument): DocumentView {
  const current =
    doc.versions.find((v) => v.id === doc.currentVersionId) ??
    doc.versions[doc.versions.length - 1];
  const uploadedAt = current?.uploadedAt ?? new Date().toISOString();
  const uploadedDate = uploadedAt.slice(0, 10);

  let expiresAt: string | null = null;
  if (EXPIRING_CATEGORIES.has(doc.category)) {
    // Deterministic validity window (1–3 years) derived from the doc id.
    const years = 1 + (hashString(doc.id) % 3);
    expiresAt = addDays(uploadedDate, years * 365);
  }

  const today = new Date().toISOString().slice(0, 10);
  const status: DocumentStatus = expiresAt && expiresAt < today ? "expired" : "active";

  return {
    id: doc.id,
    name: doc.name,
    category: doc.category,
    categoryLabel: DOCUMENT_CATEGORY_LABEL[doc.category],
    group: CATEGORY_TO_GROUP.get(doc.category) ?? "company",
    status,
    uploadedBy: current?.uploadedBy ?? "—",
    uploadedAt: uploadedDate,
    expiresAt,
  };
}

export interface DocumentGroup {
  key: DocumentGroupKey;
  label: string;
  documents: DocumentView[];
}

export function groupDocuments(docs: PersonDocument[]): DocumentGroup[] {
  const views = docs.map(toDocumentView);
  return DOCUMENT_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    documents: views.filter((v) => v.group === group.key),
  }));
}

/** Documents expiring within the next 60 days (and not already expired). */
export function isExpiringSoon(view: DocumentView, withinDays = 60): boolean {
  if (!view.expiresAt) return false;
  const today = new Date();
  const expiry = new Date(`${view.expiresAt}T00:00:00`);
  const diffDays = (expiry.getTime() - today.getTime()) / 86_400_000;
  return diffDays >= 0 && diffDays <= withinDays;
}

/* ---------------------------------- notes --------------------------------- */

export type NoteVisibility = "hr_only" | "manager" | "public";

export interface NoteView {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  visibility: NoteVisibility;
}

export const NOTE_VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  hr_only: "HR only",
  manager: "Manager",
  public: "Public",
};

/** Derive a deterministic visibility for a mock note. */
function deriveVisibility(note: EmployeeNote): NoteVisibility {
  const order: NoteVisibility[] = ["hr_only", "manager", "public"];
  return order[hashString(note.id) % order.length];
}

export function toNoteView(note: EmployeeNote): NoteView {
  return {
    id: note.id,
    body: note.body,
    author: note.author,
    createdAt: note.updatedAt ?? note.createdAt,
    visibility: deriveVisibility(note),
  };
}

export function toNoteViews(notes: EmployeeNote[]): NoteView[] {
  return notes
    .map(toNoteView)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* --------------------------------- assets --------------------------------- */

export type AssetStatusView = "assigned" | "returned" | "lost" | "damaged";
export type AssetCondition = "excellent" | "good" | "fair" | "poor";

export interface AssetView {
  id: string;
  name: string;
  type: EquipmentItem["type"];
  typeLabel: string;
  serial: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: AssetStatusView;
  condition: AssetCondition;
}

const ASSET_TYPE_LABEL: Record<EquipmentItem["type"], string> = {
  laptop: "Laptop",
  phone: "Phone",
  monitor: "Monitor",
  peripheral: "Peripheral",
  other: "Other",
};

const CONDITIONS: AssetCondition[] = ["excellent", "good", "fair", "poor"];

export function toAssetView(item: EquipmentItem): AssetView {
  // Repository stores assigned/returned; derive lost/damaged deterministically
  // for a small subset so all badge states are represented in the read view.
  let status: AssetStatusView = item.status === "returned" ? "returned" : "assigned";
  const roll = hashString(item.id) % 10;
  if (item.status === "assigned" && roll === 0) status = "damaged";
  else if (item.status === "assigned" && roll === 1) status = "lost";

  const condition =
    status === "damaged"
      ? "poor"
      : status === "lost"
        ? "fair"
        : CONDITIONS[hashString(item.id + "c") % 2]; // excellent | good for healthy assets

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    typeLabel: ASSET_TYPE_LABEL[item.type],
    serial: item.serial ?? null,
    assignedAt: item.assignedAt.slice(0, 10),
    returnedAt: item.returnedAt ? item.returnedAt.slice(0, 10) : null,
    status,
    condition,
  };
}

export function toAssetViews(items: EquipmentItem[]): AssetView[] {
  return items
    .map(toAssetView)
    .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1));
}

export function isActiveAsset(view: AssetView): boolean {
  return view.status === "assigned" || view.status === "damaged";
}