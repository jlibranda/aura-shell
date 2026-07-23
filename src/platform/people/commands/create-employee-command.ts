import type { ApplicationCommand } from "@/platform/commands/application-command";
import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

type HirePersonal = Readonly<{ firstName: string; middleName: string; lastName: string; preferredName: string; dateOfBirth: string | null; gender: string; maritalStatus: string; nationality: string }>;
type HireContact = Readonly<{ personalEmail: string; workEmail: string; mobileNumber: string; homeAddress: string }>;
type HireEmployment = Readonly<{ departmentId: string; teamId: string; position: string; managerId: string; employmentType: string; hireDate: string | null; workLocation: string }>;
type HireEmergencyContact = Readonly<{ name: string; relationship: string; mobileNumber: string; email: string; address: string }>;

export type CreateEmployeeCommand = Readonly<ApplicationCommand<"people.employee.create"> & {
  personal: HirePersonal;
  contact: HireContact;
  employment: HireEmployment;
  emergencyContact: HireEmergencyContact;
}>;

export type CreateEmployeeCommandInput = Omit<CreateEmployeeCommand, "type">;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d][\d\s()-]{6,}$/;
const genders = new Set(["female", "male", "non_binary", "prefer_not_to_say"]);
const civilStatuses = new Set(["single", "married", "widowed", "separated"]);
const employmentTypes = new Set(["regular", "probationary", "contractual", "project_based", "intern"]);
const required = (value: string | null | undefined) => Boolean(value?.trim());
const dateIsValid = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Creates an immutable business-intent contract with no entity or framework data. */
export function createCreateEmployeeCommand(input: CreateEmployeeCommandInput): CreateEmployeeCommand {
  return freeze({
    type: "people.employee.create" as const,
    personal: { ...input.personal },
    contact: { ...input.contact },
    employment: { ...input.employment },
    emergencyContact: { ...input.emergencyContact },
  });
}

/** Application validation; UI validation remains responsible for field guidance. */
export function validateCreateEmployeeCommand(command: CreateEmployeeCommand): ValidationResult<CreateEmployeeCommand> {
  const issues = [];
  const { personal, contact, employment, emergencyContact } = command;
  if (!required(personal.firstName)) issues.push(issue("personal.firstName", "required", "First name is required."));
  if (!required(personal.lastName)) issues.push(issue("personal.lastName", "required", "Last name is required."));
  if (!dateIsValid(personal.dateOfBirth)) issues.push(issue("personal.dateOfBirth", "invalid_date", "A valid birth date is required."));
  else if (personal.dateOfBirth! > new Date().toISOString().slice(0, 10)) issues.push(issue("personal.dateOfBirth", "future_date", "Birth date cannot be in the future."));
  if (!genders.has(personal.gender)) issues.push(issue("personal.gender", "invalid_enum", "Gender is invalid."));
  if (!civilStatuses.has(personal.maritalStatus)) issues.push(issue("personal.maritalStatus", "invalid_enum", "Civil status is invalid."));
  if (!required(personal.nationality)) issues.push(issue("personal.nationality", "required", "Nationality is required."));
  if (!emailPattern.test(contact.workEmail.trim())) issues.push(issue("contact.workEmail", "invalid_email", "A valid work email is required."));
  if (contact.personalEmail && !emailPattern.test(contact.personalEmail.trim())) issues.push(issue("contact.personalEmail", "invalid_email", "Personal email is invalid."));
  if (!phonePattern.test(contact.mobileNumber.trim())) issues.push(issue("contact.mobileNumber", "invalid_phone", "A valid mobile number is required."));
  if (!required(employment.departmentId)) issues.push(issue("employment.departmentId", "required", "Department is required."));
  if (!required(employment.position)) issues.push(issue("employment.position", "required", "Position is required."));
  if (!employmentTypes.has(employment.employmentType)) issues.push(issue("employment.employmentType", "invalid_enum", "Employment type is invalid."));
  if (!dateIsValid(employment.hireDate)) issues.push(issue("employment.hireDate", "invalid_date", "A valid hire date is required."));
  if (!required(employment.workLocation)) issues.push(issue("employment.workLocation", "required", "Work location is required."));
  if (dateIsValid(personal.dateOfBirth) && dateIsValid(employment.hireDate) && employment.hireDate! < personal.dateOfBirth!) issues.push(issue("employment.hireDate", "inconsistent_dates", "Hire date cannot be before birth date."));
  if (Object.values(emergencyContact).some(Boolean)) {
    if (!required(emergencyContact.name)) issues.push(issue("emergencyContact.name", "required", "Emergency contact name is required."));
    if (!required(emergencyContact.relationship)) issues.push(issue("emergencyContact.relationship", "required", "Emergency contact relationship is required."));
    if (!phonePattern.test(emergencyContact.mobileNumber.trim())) issues.push(issue("emergencyContact.mobileNumber", "invalid_phone", "A valid emergency contact mobile number is required."));
    if (emergencyContact.email && !emailPattern.test(emergencyContact.email.trim())) issues.push(issue("emergencyContact.email", "invalid_email", "Emergency contact email is invalid."));
  }
  return issues.length ? invalid(issues) : valid(command);
}
