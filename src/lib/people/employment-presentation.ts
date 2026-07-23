/**
 * Read-only presentation helpers for the Employment and Government IDs tabs.
 * Derives display-only fields (business unit, cost center, salary grade,
 * payroll group, verification metadata) from the existing repository records.
 * These are deterministic projections of mock data — no new stored state.
 */
import type {
  Employee,
  GovIdKey,
  PayFrequency,
} from "@/lib/people/people-types";
import { entityLabel, entityRegion } from "@/lib/people/format";

export type VerificationState = "verified" | "pending" | "missing" | "expired";

export interface GovIdView {
  key: GovIdKey;
  label: string;
  number: string | null;
  state: VerificationState;
  dateVerified: string | null;
  source: string;
  lastUpdated: string;
}

const GOV_LABELS: Record<GovIdKey, string> = {
  tin: "TIN",
  sss: "SSS",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG",
};

const GOV_SOURCE: Record<GovIdKey, string> = {
  tin: "Bureau of Internal Revenue",
  sss: "Social Security System",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG Fund",
};

/** Stable pseudo-date derived from a seed string, within the last ~2 years. */
function derivedDate(seed: string, salt: number): string {
  let hash = salt;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const daysAgo = hash % 730;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function govIdViews(employee: Employee): GovIdView[] {
  const order: GovIdKey[] = ["tin", "sss", "philhealth", "pagibig"];
  return order.map((key) => {
    const record = employee.governmentIds[key];
    let state: VerificationState;
    if (!record.number) {
      state = "missing";
    } else if (record.verified) {
      state = "verified";
    } else {
      // Deterministic split between pending and expired for unverified IDs.
      const hashChar = (employee.id.charCodeAt(employee.id.length - 1) + key.length) % 3;
      state = hashChar === 0 ? "expired" : "pending";
    }

    const dateVerified = state === "verified" ? derivedDate(employee.id + key, 7) : null;

    return {
      key,
      label: GOV_LABELS[key],
      number: record.number,
      state,
      dateVerified,
      source: GOV_SOURCE[key],
      lastUpdated: derivedDate(employee.id + key + "u", 13),
    };
  });
}

export function payFrequencyLabel(freq: PayFrequency): string {
  switch (freq) {
    case "semi_monthly":
      return "Semi-monthly";
    case "monthly":
      return "Monthly";
    default:
      return freq;
  }
}

/** Derived salary grade band (display only — no amount is exposed). */
export function salaryGrade(employee: Employee): string {
  const title = employee.employment.positionTitle.toLowerCase();
  if (title.includes("chief") || title.includes("head of")) return "SG-7 · Executive";
  if (title.includes("lead") || title.includes("manager") || title.includes("principal"))
    return "SG-6 · Leadership";
  if (title.includes("senior")) return "SG-5 · Senior";
  if (title.includes("business partner") || title.includes("specialist")) return "SG-4 · Professional";
  if (title.includes("analyst") || title.includes("engineer") || title.includes("accountant"))
    return "SG-3 · Professional";
  if (title.includes("associate") || title.includes("coordinator")) return "SG-2 · Associate";
  return "SG-1 · Entry";
}

export function payrollGroup(employee: Employee): string {
  const region = entityRegion(employee.employment.entityId);
  const cadence = payFrequencyLabel(employee.compensation.current.payFrequency);
  return `${region ?? entityLabel(employee.employment.entityId)} · ${cadence}`;
}

/** Business unit is derived from the entity (display-only grouping). */
export function businessUnit(employee: Employee): string {
  return entityLabel(employee.employment.entityId);
}

/** Cost center code derived from department + entity for display. */
export function costCenter(employee: Employee, departmentName: string): string {
  const deptCode = departmentName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  const entityCode = employee.employment.entityId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
  return `CC-${entityCode}-${deptCode || "GEN"}`;
}

/** Separation date pulled from the most relevant exit timeline event. */
export function separationDate(employee: Employee): string | null {
  const exitTypes = new Set(["resigned", "terminated", "retired", "offboarded"]);
  const exit = employee.timeline
    .filter((e) => exitTypes.has(e.type))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  return exit ? exit.timestamp.slice(0, 10) : null;
}

const EMPLOYMENT_HISTORY_TYPES = new Set([
  "hired",
  "promoted",
  "transferred",
  "regularized",
]);

/** Employment-relevant slice of the timeline for the history card. */
export function employmentHistory(employee: Employee) {
  return employee.timeline
    .filter((e) => EMPLOYMENT_HISTORY_TYPES.has(e.type))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}