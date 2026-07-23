/**
 * Lifecycle action layer: validation + a thin orchestration wrapper over the
 * People repository. Each action validates its input, applies the change
 * through existing repository methods, and reports a structured audit result.
 * Pure validation functions have no side effects; the apply* functions call
 * the repository's own mutators (no new persistence path).
 */
import type { StoreApi } from "zustand";
import type {
  Employee,
  EmployeeStatus,
  PayFrequency,
} from "@/lib/people/people-types";
import type { FieldErrors } from "@/lib/people/hire-types";

/* --------------------------------- inputs --------------------------------- */

export interface PromoteInput {
  effectiveDate: string | null;
  positionTitle: string;
  jobLevel: string;
  departmentId: string;
  teamId: string;
  managerId: string;
  reason: string;
  remarks: string;
}

export interface TransferInput {
  effectiveDate: string | null;
  entityId: string;
  businessUnit: string;
  departmentId: string;
  teamId: string;
  managerId: string;
  locationLabel: string;
  reason: string;
}

export interface SalaryChangeInput {
  effectiveDate: string | null;
  newSalary: string;
  currency: string;
  payFrequency: PayFrequency;
  reason: string;
}

export interface RegularizeInput {
  effectiveDate: string | null;
  notes: string;
}

export interface ChangeManagerInput {
  effectiveDate: string | null;
  managerId: string;
  reason: string;
}

/* ------------------------------- validation ------------------------------- */

function req(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function effectiveDateError(
  effectiveDate: string | null,
  employee: Employee,
): string | null {
  if (!req(effectiveDate)) return "Effective date is required.";
  if (effectiveDate && effectiveDate < employee.employment.hireDate) {
    return "Effective date can't be before the hire date.";
  }
  return null;
}

export function validatePromote(input: PromoteInput, employee: Employee): FieldErrors {
  const errors: FieldErrors = {};
  const dateErr = effectiveDateError(input.effectiveDate, employee);
  if (dateErr) errors.effectiveDate = dateErr;
  if (!req(input.positionTitle)) {
    errors.positionTitle = "New position is required.";
  } else if (
    input.positionTitle.trim().toLowerCase() ===
    employee.employment.positionTitle.toLowerCase()
  ) {
    errors.positionTitle = "New position must differ from the current one.";
  }
  if (!req(input.jobLevel)) errors.jobLevel = "New job level is required.";
  if (input.managerId && input.managerId === employee.id) {
    errors.managerId = "An employee can't report to themselves.";
  }
  if (!req(input.reason)) errors.reason = "Reason is required.";
  return errors;
}

export function validateTransfer(input: TransferInput, employee: Employee): FieldErrors {
  const errors: FieldErrors = {};
  const dateErr = effectiveDateError(input.effectiveDate, employee);
  if (dateErr) errors.effectiveDate = dateErr;
  if (!req(input.entityId)) errors.entityId = "New entity is required.";
  if (!req(input.departmentId)) {
    errors.departmentId = "New department is required.";
  } else if (
    input.departmentId === employee.employment.departmentId &&
    input.entityId === employee.employment.entityId
  ) {
    errors.departmentId = "Transfer must change the department or entity.";
  }
  if (!req(input.locationLabel)) errors.locationLabel = "Work location is required.";
  if (input.managerId && input.managerId === employee.id) {
    errors.managerId = "An employee can't report to themselves.";
  }
  if (!req(input.reason)) errors.reason = "Reason is required.";
  return errors;
}

export function parseSalary(value: string): number {
  const cleaned = value.replace(/[,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

export function validateSalaryChange(
  input: SalaryChangeInput,
  employee: Employee,
): FieldErrors {
  const errors: FieldErrors = {};
  const dateErr = effectiveDateError(input.effectiveDate, employee);
  if (dateErr) errors.effectiveDate = dateErr;
  const salary = parseSalary(input.newSalary);
  if (!req(input.newSalary)) {
    errors.newSalary = "New salary is required.";
  } else if (Number.isNaN(salary)) {
    errors.newSalary = "Enter a valid amount.";
  } else if (salary <= 0) {
    errors.newSalary = "Salary must be greater than zero.";
  } else if (salary === employee.compensation.current.baseMonthly) {
    errors.newSalary = "New salary must differ from the current salary.";
  }
  if (!req(input.reason)) errors.reason = "Reason is required.";
  return errors;
}

export function validateRegularize(
  input: RegularizeInput,
  employee: Employee,
): FieldErrors {
  const errors: FieldErrors = {};
  const dateErr = effectiveDateError(input.effectiveDate, employee);
  if (dateErr) errors.effectiveDate = dateErr;
  return errors;
}

export function validateChangeManager(
  input: ChangeManagerInput,
  employee: Employee,
): FieldErrors {
  const errors: FieldErrors = {};
  const dateErr = effectiveDateError(input.effectiveDate, employee);
  if (dateErr) errors.effectiveDate = dateErr;
  if (!req(input.managerId)) {
    errors.managerId = "New manager is required.";
  } else if (input.managerId === employee.id) {
    errors.managerId = "An employee can't report to themselves.";
  } else if (input.managerId === employee.employment.managerId) {
    errors.managerId = "New manager must differ from the current manager.";
  }
  if (!req(input.reason)) errors.reason = "Reason is required.";
  return errors;
}

/* --------------------------------- audit ---------------------------------- */

export type LifecycleActionType =
  | "promote"
  | "transfer"
  | "salary_change"
  | "regularize"
  | "change_manager";

export interface AuditRecord {
  actionType: LifecycleActionType;
  performedBy: string;
  performedAt: string;
  effectiveDate: string;
  reason: string;
}

export interface ActionOutcome {
  ok: boolean;
  error?: string;
  audit?: AuditRecord;
}