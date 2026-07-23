/**
 * Deterministic query engine over repository data. Pure functions only — these
 * are the "skills" the planner composes. No AI, no side effects.
 */
import type { Employee, GovIdKey } from "@/lib/people/people-types";
import type { CopilotContext } from "@/lib/people/copilot/types";
import { fullName } from "@/lib/people/directory-query";
import { GOV_ID_ORDER } from "@/lib/people/gov-verification";

export function reportsTo(ctx: CopilotContext, managerId: string): Employee[] {
  return ctx.employees.filter((e) => e.employment.managerId === managerId);
}

export function findByName(ctx: CopilotContext, fragment: string): Employee[] {
  const q = fragment.trim().toLowerCase();
  if (!q) return [];
  return ctx.employees.filter((e) => {
    const name = fullName(e).toLowerCase();
    const full = `${e.personal.firstName} ${e.personal.middleName ?? ""} ${e.personal.lastName}`.toLowerCase();
    return name.includes(q) || full.includes(q) || e.personal.email.toLowerCase().includes(q);
  });
}

export function joinedInMonth(ctx: CopilotContext, year: number, month: number): Employee[] {
  return ctx.employees.filter((e) => {
    const d = new Date(`${e.employment.hireDate}T00:00:00`);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function joinedInYear(ctx: CopilotContext, year: number): Employee[] {
  return ctx.employees.filter((e) => e.employment.hireDate.startsWith(String(year)));
}

export function recentHires(ctx: CopilotContext, limit = 10): Employee[] {
  return [...ctx.employees]
    .sort((a, b) => (a.employment.hireDate < b.employment.hireDate ? 1 : -1))
    .slice(0, limit);
}

export function byStatus(ctx: CopilotContext, status: Employee["status"]): Employee[] {
  return ctx.employees.filter((e) => e.status === status);
}

export function byDepartmentName(ctx: CopilotContext, name: string): Employee[] {
  const q = name.trim().toLowerCase();
  const dept = ctx.departments.find((d) => d.name.toLowerCase().includes(q));
  if (!dept) return [];
  return ctx.employees.filter((e) => e.employment.departmentId === dept.id);
}

export function missingGovId(ctx: CopilotContext, key: GovIdKey): Employee[] {
  return ctx.employees.filter((e) => !e.governmentIds[key].number);
}

export function incompleteGovIds(ctx: CopilotContext): Employee[] {
  return ctx.employees.filter((e) => GOV_ID_ORDER.some((k) => !e.governmentIds[k].number));
}

export function noEmergencyContact(ctx: CopilotContext): Employee[] {
  return ctx.employees.filter((e) => e.emergencyContacts.length === 0);
}

export function noManager(ctx: CopilotContext): Employee[] {
  return ctx.employees.filter((e) => !e.employment.managerId);
}

export function missingMobile(ctx: CopilotContext): Employee[] {
  return ctx.employees.filter((e) => !e.personal.phone);
}

export function countByDepartment(ctx: CopilotContext): { label: string; value: number }[] {
  return ctx.departments
    .map((d) => ({
      label: d.name,
      value: ctx.employees.filter((e) => e.employment.departmentId === d.id).length,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function duplicateEmails(ctx: CopilotContext): Employee[] {
  const seen = new Map<string, Employee[]>();
  for (const e of ctx.employees) {
    const key = e.personal.email.toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), e]);
  }
  return Array.from(seen.values())
    .filter((group) => group.length > 1)
    .flat();
}

/** Missing required record fields for an employee. */
export function missingFields(e: Employee): string[] {
  const missing: string[] = [];
  if (!e.personal.phone) missing.push("mobile number");
  if (!e.personal.dateOfBirth) missing.push("birth date");
  if (!e.personal.address) missing.push("address");
  if (!e.employment.managerId) missing.push("manager");
  if (e.emergencyContacts.length === 0) missing.push("emergency contact");
  for (const k of GOV_ID_ORDER) {
    if (!e.governmentIds[k].number) missing.push(`${k.toUpperCase()} number`);
  }
  return missing;
}

export function incompleteRecords(ctx: CopilotContext): Employee[] {
  return ctx.employees.filter((e) => missingFields(e).length > 0);
}

/** Probationary employees whose probation ends within the given month window. */
export function regularizableInMonth(
  ctx: CopilotContext,
  year: number,
  month: number,
): Employee[] {
  return ctx.employees.filter((e) => {
    if (e.status !== "probationary") return false;
    const end = e.employment.probationEndDate;
    if (!end) return false;
    const d = new Date(`${end}T00:00:00`);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}