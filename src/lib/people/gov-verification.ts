/**
 * Government-ID verification model (Sprint 3.2.1). The Sprint 2.1 GovId type
 * only stores { number, verified }, so this adds a parallel, authoritative
 * four-state verification record with audit metadata WITHOUT changing the
 * repository types. Display resolves: stored override → else derived fallback.
 * Pure types + helpers only.
 */
import type { Employee, GovIdKey } from "@/lib/people/people-types";

export type GovVerificationStatus =
  | "not_provided"
  | "pending"
  | "verified"
  | "rejected";

export interface GovVerificationRecord {
  status: GovVerificationStatus;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null; // ISO datetime
  updatedBy: string | null;
  updatedAt: string | null; // ISO datetime
}

/** Key used to store a verification record: `${employeeId}:${idKey}`. */
export function govKey(employeeId: string, idKey: GovIdKey): string {
  return `${employeeId}:${idKey}`;
}

export const GOV_STATUS_META: Record<GovVerificationStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  not_provided: { label: "Not provided", tone: "neutral" },
  pending: { label: "Pending verification", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const GOV_ID_LABELS: Record<GovIdKey, string> = {
  tin: "TIN",
  sss: "SSS",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG",
};

export const GOV_ID_ORDER: GovIdKey[] = ["tin", "sss", "philhealth", "pagibig"];

/**
 * Resolve the effective status for an employee's ID given any stored override.
 * Falls back to the base record: a present number is "pending", absent is
 * "not_provided", and an already-verified boolean maps to "verified".
 */
export function resolveGovStatus(
  employee: Employee,
  idKey: GovIdKey,
  override?: GovVerificationRecord,
): GovVerificationStatus {
  if (override) return override.status;
  const record = employee.governmentIds[idKey];
  if (!record.number) return "not_provided";
  return record.verified ? "verified" : "pending";
}

/** A blank editable record seeded from current employee state. */
export function seedRecord(
  employee: Employee,
  idKey: GovIdKey,
  override?: GovVerificationRecord,
): GovVerificationRecord {
  if (override) return override;
  const status = resolveGovStatus(employee, idKey);
  return {
    status,
    notes: null,
    verifiedBy: null,
    verifiedAt: null,
    updatedBy: null,
    updatedAt: null,
  };
}

/** Mask an ID number, revealing only the last four characters. */
export function maskGovNumber(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/[^0-9A-Za-z]/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

/** Government-ID completeness: every ID has a number and none are rejected. */
export function isGovComplete(
  employee: Employee,
  overrides: Record<string, GovVerificationRecord>,
): boolean {
  return GOV_ID_ORDER.every((key) => {
    const hasNumber = Boolean(employee.governmentIds[key].number);
    const status = resolveGovStatus(employee, key, overrides[govKey(employee.id, key)]);
    return hasNumber && status !== "rejected";
  });
}