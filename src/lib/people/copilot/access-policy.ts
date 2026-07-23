import { CURRENT_USER } from "@/lib/mock-data";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";

export type CopilotAccessRole = "hr_full" | "payroll" | "manager" | "employee" | "restricted";
export type CopilotField = "profile" | "contact" | "emergency_contact" | "government_id" | "compensation" | "documents";

export interface CopilotViewer {
  id?: string;
  name: string;
  email: string;
  role: CopilotAccessRole;
}

export function currentCopilotViewer(employees: Employee[]): CopilotViewer {
  const role = CURRENT_USER.role.toLowerCase();
  const employee = employees.find((item) => item.personal.email.toLowerCase() === CURRENT_USER.email.toLowerCase() || fullName(item).toLowerCase() === CURRENT_USER.name.toLowerCase());
  const accessRole: CopilotAccessRole = role.includes("hr") ? "hr_full" : role.includes("payroll") ? "payroll" : role.includes("manager") ? "manager" : role.includes("employee") ? "employee" : "restricted";
  return { id: employee?.id, name: CURRENT_USER.name, email: CURRENT_USER.email, role: accessRole };
}

export function canAccessCopilotField(viewer: CopilotViewer, employee: Employee, employees: Employee[], field: CopilotField): boolean {
  if (viewer.role === "hr_full") return true;
  if (viewer.role === "payroll") return field === "government_id" || field === "compensation";
  const isSelf = viewer.id === employee.id;
  const isDirectReport = employees.some((item) => item.id === employee.id && item.employment.managerId === viewer.id);
  if (viewer.role === "manager") return isDirectReport && field === "profile";
  if (viewer.role === "employee") return isSelf && (field === "profile" || field === "contact" || field === "emergency_contact" || field === "government_id" || field === "documents");
  return false;
}
