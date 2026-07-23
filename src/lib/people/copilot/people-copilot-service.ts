/**
 * PeopleCopilotService — deterministic planner that turns an intent into a
 * grounded answer using the query engine. No AI. Swappable later for an
 * LLM-backed implementation of the same interface.
 */
import type {
  CopilotAnswer,
  CopilotContext,
  PeopleCopilotService,
} from "@/lib/people/copilot/types";
import { NOT_FOUND } from "@/lib/people/copilot/types";
import { parseIntent } from "@/lib/people/copilot/intent-parser";
import { normalizeCopilotText } from "@/lib/people/copilot/normalization";
import * as Q from "@/lib/people/copilot/query-engine";
import { fullName } from "@/lib/people/directory-query";
import { STATUS_META } from "@/lib/people/status-machine";
import type { Employee } from "@/lib/people/people-types";
import { canAccessCopilotField } from "@/lib/people/copilot/access-policy";
import { logCopilotAudit } from "@/lib/people/copilot/copilot-audit";
import { GOV_ID_LABELS, maskGovNumber, resolveGovStatus } from "@/lib/people/gov-verification";
import { resolveEmployee } from "@/lib/people/copilot/employee-resolver";

function listAnswer(headline: string, employees: Employee[], detail?: string[]): CopilotAnswer {
  if (employees.length === 0) {
    return { kind: "text", headline: NOT_FOUND, empty: true };
  }
  return { kind: "employees", headline, employees, detail };
}

function resolvePerson(ctx: CopilotContext, name: string): Employee | undefined {
  const matches = Q.findByName(ctx, name);
  if (matches.length === 0) return undefined;
  const exact = matches.find((e) => fullName(e).toLowerCase() === name.trim().toLowerCase());
  return exact ?? matches[0];
}

function reportAnswer(headline: string, employees: Employee[], emptyMessage: string): CopilotAnswer {
  return employees.length ? { kind: "employees", headline, employees } : { kind: "text", headline: emptyMessage, empty: true };
}

function resolveSingle(ctx: CopilotContext, name: string): { employee?: Employee; answer?: CopilotAnswer } {
  const result = resolveEmployee(ctx, name);
  if (result.status === "resolved") return { employee: result.employee };
  if (result.status === "ambiguous") return { answer: { kind: "employees", headline: `I found multiple employees matching '${name.trim()}'. Please select one.`, employees: result.candidates, empty: true } };
  return { answer: { kind: "text", headline: `No employee matching '${result.searchedText.trim()}' was found.`, empty: true } };
}

function permitted(ctx: CopilotContext, employee: Employee, field: "profile" | "contact" | "emergency_contact" | "government_id" | "compensation" | "documents"): boolean {
  return canAccessCopilotField(ctx.viewer, employee, ctx.employees, field);
}

function denied(): CopilotAnswer { return { kind: "text", headline: "You don't have permission to view this information.", empty: true }; }

function profileAnswer(ctx: CopilotContext, employee: Employee): CopilotAnswer {
  if (!permitted(ctx, employee, "profile")) return denied();
  logCopilotAudit(ctx.viewer, employee.id, "Employee profile", "viewed");
  const department = ctx.departments.find((item) => item.id === employee.employment.departmentId)?.name ?? "Not assigned";
  const manager = ctx.employees.find((item) => item.id === employee.employment.managerId);
  const team = ctx.teams.find((item) => item.id === employee.employment.teamId)?.name ?? "Not assigned";
  const rows = [{ label: "Employee ID", value: employee.employeeNumber }, { label: "Employment status", value: STATUS_META[employee.status].label }, { label: "Employment type", value: employee.employment.employmentType }, { label: "Position", value: employee.employment.positionTitle || "Not Available" }, { label: "Department", value: department }, { label: "Team", value: team }, { label: "Business unit", value: employee.employment.entityId || "Not Available" }, { label: "Manager", value: manager ? fullName(manager) : "Not Available" }, { label: "Work location", value: employee.employment.locationLabel || "Not Available" }, { label: "Hire date", value: employee.employment.hireDate || "Not Available" }, { label: "Regularization date", value: employee.employment.regularizationDate ?? "Not Available" }];
  if (permitted(ctx, employee, "contact")) rows.push({ label: "Work email", value: employee.personal.email }, { label: "Mobile", value: employee.personal.phone ?? "Not on file" });
  return { kind: "summary", headline: fullName(employee), employees: [employee], profile: { employee, rows } };
}

function summarize(ctx: CopilotContext, employee: Employee): CopilotAnswer {
  const dept = ctx.departments.find((d) => d.id === employee.employment.departmentId)?.name ?? "—";
  const manager = employee.employment.managerId
    ? ctx.employees.find((e) => e.id === employee.employment.managerId)
    : undefined;
  const reports = Q.reportsTo(ctx, employee.id).length;
  const missing = Q.missingFields(employee);

  const detail = [
    `Position: ${employee.employment.positionTitle}`,
    `Department: ${dept}`,
    `Status: ${STATUS_META[employee.status].label}`,
    `Manager: ${manager ? fullName(manager) : "None"}`,
    `Direct reports: ${reports}`,
    `Hire date: ${employee.employment.hireDate}`,
    missing.length ? `Missing: ${missing.join(", ")}` : "Record is complete.",
  ];

  return { kind: "summary", headline: `Summary of ${fullName(employee)}`, employees: [employee], detail };
}

export class RuleBasedPeopleCopilot implements PeopleCopilotService {
  ask(question: string, context: CopilotContext): CopilotAnswer {
    const normalizedQuestion = normalizeCopilotText(question);
    // Defensive analytics gate: reports must never fall through to employee lookup or unknown intent.
    if (/who has no emergency contact|without emergency contact|missing emergency contact|walang emergency contact/.test(normalizedQuestion)) {
      return reportAnswer("Employees with no emergency contact", Q.noEmergencyContact(context), "All employees currently have an emergency contact recorded.");
    }
    if (/who can be regularized next month|who becomes regular next month|regularization next month|upcoming regularization|mareregular/.test(normalizedQuestion)) {
      const next = new Date(); next.setMonth(next.getMonth() + 1);
      const label = next.toLocaleDateString(undefined, { month: "long", year: "numeric" }); return reportAnswer(`Probationary employees who can be regularized in ${label}`, Q.regularizableInMonth(context, next.getFullYear(), next.getMonth()), `No probationary employees are scheduled for regularization in ${label}.`);
    }
    const intent = parseIntent(question, context.activeEmployeeName);
    if (process.env.NODE_ENV === "development") console.debug("[Copilot]", JSON.stringify({ rawQuestion: question, normalizedQuestion: normalizeCopilotText(question), intent: intent.kind, activeEmployee: context.activeEmployeeName }));

    switch (intent.kind) {
      case "employee_navigation": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!;
        const segments = { profile: "", "government-ids": "/government-ids", employment: "/employment", documents: "/documents", timeline: "/timeline" };
        return { kind: "text", headline: `Open ${intent.tab.replace("-", " ")} for ${fullName(employee)}`, navigation: { href: `/people/${employee.id}${segments[intent.tab]}`, label: `Open ${intent.tab.replace("-", " ")}` } };
      }
      case "employee_government_overview": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; if (!permitted(context, employee, "government_id")) return denied();
        return { kind: "text", headline: `Government IDs for ${fullName(employee)}`, navigation: { href: `/people/${employee.id}/government-ids`, label: "Open Government IDs" } };
      }
      case "employee_timeline": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; if (!permitted(context, employee, "profile")) return denied(); logCopilotAudit(context.viewer, employee.id, "Employee timeline", "viewed");
        return { kind: "summary", headline: `Timeline for ${fullName(employee)}`, employees: [employee], timeline: employee.timeline.map((event) => ({ date: event.timestamp, title: event.title, description: event.description })) };
      }
      case "navigate": return { kind: "text", headline: `Open ${intent.label}`, navigation: { href: intent.href, label: intent.label } };
      case "employee_profile": {
        const resolved = resolveSingle(context, intent.name); return resolved.answer ?? profileAnswer(context, resolved.employee!);
      }
      case "employee_manager": case "employee_department": case "employee_position": case "employee_hire_date": case "employee_team": case "employee_status": case "employee_employee_number": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; if (!permitted(context, employee, "profile")) return denied();
        const manager = context.employees.find((item) => item.id === employee.employment.managerId); const department = context.departments.find((item) => item.id === employee.employment.departmentId)?.name ?? "Not assigned"; const team = context.teams.find((item) => item.id === employee.employment.teamId)?.name ?? "Not assigned";
        const values = { employee_manager: manager ? fullName(manager) : "No manager is assigned.", employee_department: department, employee_position: employee.employment.positionTitle, employee_hire_date: employee.employment.hireDate, employee_team: team, employee_status: STATUS_META[employee.status].label, employee_employee_number: employee.employeeNumber };
        const label = intent.kind.replace("employee_", "").replaceAll("_", " "); return { kind: "summary", headline: `${label} for ${fullName(employee)}`, employees: [employee], detail: [`${label}: ${values[intent.kind]}`] };
      }
      case "employee_contact": case "employee_emergency_contact": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; const field = intent.kind === "employee_contact" ? "contact" : "emergency_contact"; if (!permitted(context, employee, field)) return denied();
        logCopilotAudit(context.viewer, employee.id, intent.kind === "employee_contact" ? intent.field : "Emergency contact", "viewed");
        if (intent.kind === "employee_contact") { const value = intent.field === "work_email" ? employee.personal.email : intent.field === "personal_email" ? "No personal email is currently on file." : employee.personal.phone ?? "No mobile number is currently on file."; return { kind: "summary", headline: `${intent.field.replace("_", " ")} for ${fullName(employee)}`, employees: [employee], detail: [value] }; }
        const contacts = employee.emergencyContacts; return contacts.length ? { kind: "summary", headline: `Emergency contact for ${fullName(employee)}`, employees: [employee], detail: contacts.map((contact) => `${contact.name} — ${contact.relationship} — ${contact.phone}`) } : { kind: "text", headline: "No emergency contact is currently on file." };
      }
      case "employee_government_id": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; if (!permitted(context, employee, "government_id")) return denied();
        const value = employee.governmentIds[intent.key].number; const label = GOV_ID_LABELS[intent.key]; if (!value) return { kind: "text", headline: `No ${label} is currently on file.` };
        const allowedFull = context.viewer.role === "hr_full" || context.viewer.role === "payroll" || context.viewer.id === employee.id; const action = intent.action === "view" ? "viewed" : intent.action === "reveal" ? "revealed" : "copied"; logCopilotAudit(context.viewer, employee.id, label, action);
        return { kind: "summary", headline: `${label} for ${fullName(employee)}`, employees: [employee], governmentId: { employeeId: employee.id, label, maskedValue: maskGovNumber(value), fullValue: allowedFull ? value : undefined, status: resolveGovStatus(employee, intent.key), canReveal: allowedFull, canCopy: allowedFull } };
      }
      case "employee_compensation": {
        const resolved = resolveSingle(context, intent.name); if (resolved.answer) return resolved.answer; const employee = resolved.employee!; if (!permitted(context, employee, "compensation")) return denied(); logCopilotAudit(context.viewer, employee.id, "Compensation", "viewed"); return { kind: "summary", headline: `Compensation for ${fullName(employee)}`, employees: [employee], detail: [`Base monthly: ${employee.compensation.current.currency} ${employee.compensation.current.baseMonthly.toLocaleString()}`, "Allowances are not implemented yet."] };
      }
      case "employee_documents": return { kind: "text", headline: "Document queries are not implemented yet." };
      case "reports_to": {
        const manager = resolvePerson(context, intent.name);
        if (!manager) return { kind: "text", headline: NOT_FOUND, empty: true };
        const reports = Q.reportsTo(context, manager.id);
        return listAnswer(`People who report to ${fullName(manager)}`, reports);
      }
      case "joined_month": {
        const list = Q.joinedInMonth(context, intent.year, intent.month);
        const monthLabel = new Date(intent.year, intent.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        return listAnswer(`Employees who joined in ${monthLabel}`, list);
      }
      case "joined_year": {
        const list = Q.joinedInYear(context, intent.year);
        return listAnswer(`Employees who joined in ${intent.year}`, list);
      }
      case "recent_hires":
        return listAnswer("Most recent hires", Q.recentHires(context));
      case "on_probation":
        return listAnswer("Employees on probation", Q.byStatus(context, "probationary"));
      case "count_status": {
        const list = Q.byStatus(context, intent.status);
        const label = STATUS_META[intent.status].label;
        return {
          kind: "counts",
          headline: `${list.length} ${label.toLowerCase()} ${list.length === 1 ? "employee" : "employees"}`,
          counts: [{ label, value: list.length }],
        };
      }
      case "count_by_department":
        return {
          kind: "counts",
          headline: "Employee count by department",
          counts: Q.countByDepartment(context),
        };
      case "department_employees": {
        const list = Q.byDepartmentName(context, intent.name);
        return listAnswer(`Employees in ${intent.name.trim()}`, list);
      }
      case "missing_gov_id":
        return listAnswer(`Employees missing a ${intent.key.toUpperCase()}`, Q.missingGovId(context, intent.key));
      case "incomplete_gov_ids":
        return listAnswer("Employees with incomplete government IDs", Q.incompleteGovIds(context));
      case "no_emergency_contact":
        return listAnswer("Employees with no emergency contact", Q.noEmergencyContact(context));
      case "no_manager":
        return listAnswer("Employees with no manager", Q.noManager(context));
      case "missing_mobile":
        return listAnswer("Employees missing a mobile number", Q.missingMobile(context));
      case "duplicate_emails":
        return listAnswer("Employees with duplicate email addresses", Q.duplicateEmails(context));
      case "incomplete_records":
        return listAnswer("Employees with incomplete records", Q.incompleteRecords(context));
      case "regularizable_next_month": {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const list = Q.regularizableInMonth(context, next.getFullYear(), next.getMonth());
        const label = next.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        return listAnswer(`Probationary employees who can be regularized in ${label}`, list);
      }
      case "summarize": {
        const person = resolvePerson(context, intent.name);
        if (!person) return { kind: "text", headline: NOT_FOUND, empty: true };
        return summarize(context, person);
      }
      case "missing_info": {
        const person = resolvePerson(context, intent.name);
        if (!person) return { kind: "text", headline: NOT_FOUND, empty: true };
        const missing = Q.missingFields(person);
        if (missing.length === 0)
          return { kind: "summary", headline: `${fullName(person)}'s record is complete`, employees: [person] };
        return {
          kind: "summary",
          headline: `Missing information for ${fullName(person)}`,
          employees: [person],
          detail: missing.map((m) => `Missing ${m}`),
        };
      }
      case "search": {
        const list = Q.findByName(context, intent.name);
        return listAnswer(`Results for “${intent.name.trim()}”`, list);
      }
      case "unknown":
      default:
        return {
          kind: "text",
          headline: NOT_FOUND,
          detail: ["Try: “Who reports to Maria Santos?”, “Who is missing a TIN?”, or “Count employees by department.”"],
          empty: true,
        };
    }
  }

  suggestions(): string[] {
    return [
      "Who is on probation?",
      "Who is missing a TIN?",
      "Count employees by department.",
      "Who has no emergency contact?",
      "Show recent hires.",
      "Who can be regularized next month?",
    ];
  }
}

/** Singleton service instance used by the People Copilot UI. */
export const peopleCopilot: PeopleCopilotService = new RuleBasedPeopleCopilot();
