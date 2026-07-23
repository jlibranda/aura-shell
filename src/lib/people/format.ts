/**
 * Presentation helpers shared across People profile surfaces. Pure functions
 * only — formatting, masking, and label lookups. No React, no side effects.
 */
import type {
  Employee,
  EmployeeStatus,
  EmploymentType,
  GovIdKey,
} from "@/lib/people/people-types";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/people/people-data";
import { ENTITIES } from "@/lib/mock-data";

/** Mask an identifier so only the last four characters remain visible. */
export function maskId(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/[^0-9A-Za-z]/g, "");
  if (digits.length <= 4) return digits;
  const last4 = digits.slice(-4);
  return `${"•".repeat(Math.max(4, digits.length - 4))}${last4}`;
}

export function govIdLabel(key: GovIdKey): string {
  switch (key) {
    case "sss":
      return "SSS";
    case "philhealth":
      return "PhilHealth";
    case "pagibig":
      return "Pag-IBIG";
    case "tin":
      return "TIN";
    default:
      return key;
  }
}

export function employmentTypeLabel(type: EmploymentType): string {
  return EMPLOYMENT_TYPE_LABELS[type];
}

export function entityLabel(entityId: string): string {
  return ENTITIES.find((e) => e.id === entityId)?.name ?? entityId;
}

export function entityRegion(entityId: string): string | null {
  return ENTITIES.find((e) => e.id === entityId)?.region ?? null;
}

const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export function genderLabel(value: string | undefined): string {
  if (!value) return "—";
  return GENDER_LABELS[value] ?? value;
}

const CIVIL_STATUS_LABELS: Record<string, string> = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  separated: "Separated",
};

export function civilStatusLabel(value: string | undefined): string {
  if (!value) return "—";
  return CIVIL_STATUS_LABELS[value] ?? value;
}

/** Long-form, human date (e.g. "June 15, 2020"). Falls back gracefully. */
export function longDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Relative-ish label for timeline timestamps (e.g. "3h ago", "May 4"). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Tenure in whole years/months from a hire date. */
export function tenure(hireDate: string): string {
  const start = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "—";
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return "New hire";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rem > 0) parts.push(`${rem} mo${rem > 1 ? "s" : ""}`);
  return parts.join(" ");
}

/** Personal email is derived for the mock (first.last@personal.example). */
export function personalEmail(employee: Employee): string {
  const { firstName, lastName } = employee.personal;
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;
}

export const STATUS_ORDER: EmployeeStatus[] = [
  "probationary",
  "regular",
  "active",
  "on_leave",
  "suspended",
  "resigned",
  "terminated",
  "retired",
];