/**
 * Maps People-scoped Copilot prompts to deterministic UI intents.
 * The AI epic replaces the matcher; the intent contract stays the same.
 * Intents are read-first — anything that would change data routes into a
 * guided action, never a silent mutation.
 */
import type { CopilotIntent, Employee } from "@/lib/people/people-types";
import { fullName } from "@/lib/people/directory-query";

/** Seeded People prompts surfaced in the dock and command palette. */
export const PEOPLE_COPILOT_PROMPTS: string[] = [
  "Show employees hired this month.",
  "Who reports to Maria?",
  "Open John's profile.",
  "Who is missing a TIN?",
];

function currentMonthRange(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

/** Resolve the best employee match for a loose name fragment. */
export function resolveEmployeeByName(
  employees: Employee[],
  fragment: string,
): Employee | undefined {
  const q = fragment.trim().toLowerCase();
  if (!q) return undefined;
  const exact = employees.find(
    (e) => fullName(e).toLowerCase() === q || e.personal.firstName.toLowerCase() === q,
  );
  if (exact) return exact;
  return employees.find((e) => {
    const name = fullName(e).toLowerCase();
    return (
      name.includes(q) ||
      e.personal.firstName.toLowerCase().startsWith(q) ||
      (e.personal.preferredName?.toLowerCase().startsWith(q) ?? false)
    );
  });
}

function extractName(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) return match[1].trim().replace(/['’]s$/i, "");
  }
  return null;
}

/**
 * Interpret a prompt into a concrete UI intent. Pure — pass the current
 * employee list so name lookups resolve against live data.
 */
export function resolveIntent(text: string, employees: Employee[]): CopilotIntent {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // "Who is missing a TIN?" (and other government IDs)
  const govMatch = lower.match(/missing (?:a |an )?(tin|sss|philhealth|pag-?ibig)/);
  if (govMatch) {
    const map: Record<string, "tin" | "sss" | "philhealth" | "pagibig"> = {
      tin: "tin",
      sss: "sss",
      philhealth: "philhealth",
      pagibig: "pagibig",
      "pag-ibig": "pagibig",
    };
    const key = map[govMatch[1].replace(/\s/g, "")] ?? "tin";
    return {
      kind: "filter",
      label: `Employees missing ${key.toUpperCase()}`,
      params: { missingGovId: key },
    };
  }

  // "Show employees hired this month."
  if (/hired this month|new hires? this month|hired recently/.test(lower)) {
    const { from, to } = currentMonthRange();
    return {
      kind: "filter",
      label: "Employees hired this month",
      params: { hiredFrom: from, hiredTo: to, sortKey: "hireDate", sortDir: "desc" },
    };
  }

  // "Open John's profile."
  const openName = extractName(raw, [
    /open (.+?)(?:'s|’s)? profile/i,
    /show me (.+?)(?:'s|’s)? profile/i,
    /go to (.+?)(?:'s|’s)? profile/i,
  ]);
  if (openName) {
    const match = resolveEmployeeByName(employees, openName);
    if (match) {
      return {
        kind: "open_profile",
        label: `Open ${fullName(match)}'s profile`,
        employeeId: match.id,
      };
    }
    return { kind: "none", label: `No employee found for “${openName}”.` };
  }

  // "Who reports to Maria?"
  const managerName = extractName(raw, [
    /who reports to (.+?)\??$/i,
    /reports to (.+?)\??$/i,
    /(.+?)(?:'s|’s) (?:team|reports|direct reports)\??$/i,
  ]);
  if (managerName) {
    const manager = resolveEmployeeByName(employees, managerName);
    if (manager) {
      return {
        kind: "navigate",
        label: `Who reports to ${fullName(manager)}`,
        href: `/people/org/chart?focus=${manager.id}`,
      };
    }
    return { kind: "none", label: `No manager found for “${managerName}”.` };
  }

  return {
    kind: "none",
    label: "Copilot can filter the directory or open a profile — try a listed prompt.",
  };
}