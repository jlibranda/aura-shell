import type { OrganizationReferenceOptionDto } from "@/platform/organization/organization-reference-dtos";
import type { CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";

export const RUNTIME_HIRE_STEPS = ["personal", "contact", "employment", "government", "emergency", "review"] as const;
export type RuntimeHireStep = (typeof RUNTIME_HIRE_STEPS)[number];
export type RuntimeHireErrors = Record<string, string>;

export interface RuntimeHireDraft {
  personal: { firstName: string; middleName: string; lastName: string; preferredName: string; dateOfBirth: string | null; gender: string; maritalStatus: string; nationality: string };
  contact: { personalEmail: string; workEmail: string; mobileNumber: string; homeAddress: string };
  employment: { departmentId: string; teamId: string; position: string; managerId: string; employmentType: string; hireDate: string | null; workLocation: string };
  emergency: { name: string; relationship: string; mobileNumber: string; email: string; address: string };
}

export interface RuntimeHireReferences { departments: OrganizationReferenceOptionDto[]; teams: OrganizationReferenceOptionDto[]; managers: OrganizationReferenceOptionDto[]; }
export interface RuntimeHireViewModel { currentStep: RuntimeHireStep; draft: RuntimeHireDraft; errors: RuntimeHireErrors; isDirty: boolean; canGoBack: boolean; canContinue: boolean; submission: "idle" | "prepared"; preparedCommand?: CreateEmployeeCommand; references: RuntimeHireReferences; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s()-]{6,}$/;
const required = (value: string | null | undefined) => Boolean(value?.trim());

export function emptyRuntimeHireDraft(): RuntimeHireDraft { return { personal: { firstName: "", middleName: "", lastName: "", preferredName: "", dateOfBirth: null, gender: "", maritalStatus: "", nationality: "Filipino" }, contact: { personalEmail: "", workEmail: "", mobileNumber: "", homeAddress: "" }, employment: { departmentId: "", teamId: "", position: "", managerId: "", employmentType: "", hireDate: null, workLocation: "" }, emergency: { name: "", relationship: "", mobileNumber: "", email: "", address: "" } }; }

export const emptyRuntimeHireReferences = (): RuntimeHireReferences => ({ departments: [], teams: [], managers: [] });

export function validateRuntimeHireStep(step: RuntimeHireStep, draft: RuntimeHireDraft, references?: RuntimeHireReferences): RuntimeHireErrors {
  const errors: RuntimeHireErrors = {};
  if (step === "personal") { if (!required(draft.personal.firstName)) errors.firstName = "First name is required."; if (!required(draft.personal.lastName)) errors.lastName = "Last name is required."; if (!required(draft.personal.dateOfBirth)) errors.dateOfBirth = "Birth date is required."; else if (draft.personal.dateOfBirth! > new Date().toISOString().slice(0, 10)) errors.dateOfBirth = "Birth date can't be in the future."; if (!required(draft.personal.gender)) errors.gender = "Gender is required."; if (!required(draft.personal.maritalStatus)) errors.maritalStatus = "Civil status is required."; if (!required(draft.personal.nationality)) errors.nationality = "Nationality is required."; }
  if (step === "contact") { if (!required(draft.contact.workEmail)) errors.workEmail = "Work email is required."; else if (!EMAIL_RE.test(draft.contact.workEmail.trim())) errors.workEmail = "Enter a valid email address."; if (draft.contact.personalEmail && !EMAIL_RE.test(draft.contact.personalEmail.trim())) errors.personalEmail = "Enter a valid email address."; if (!required(draft.contact.mobileNumber)) errors.mobileNumber = "Mobile number is required."; else if (!PHONE_RE.test(draft.contact.mobileNumber.trim())) errors.mobileNumber = "Enter a valid mobile number."; }
  if (step === "employment") { if (!required(draft.employment.departmentId) && references?.departments.length !== 0) errors.departmentId = "Department is required."; if (!required(draft.employment.position)) errors.position = "Position is required."; if (!required(draft.employment.employmentType)) errors.employmentType = "Employment type is required."; if (!required(draft.employment.hireDate)) errors.hireDate = "Hire date is required."; if (!required(draft.employment.workLocation)) errors.workLocation = "Work location is required."; }
  if (step === "emergency") { const emergency = draft.emergency; if (Object.values(emergency).some(Boolean)) { if (!required(emergency.name)) errors.emergencyName = "Contact name is required."; if (!required(emergency.relationship)) errors.emergencyRelationship = "Relationship is required."; if (!required(emergency.mobileNumber)) errors.emergencyMobile = "Mobile number is required."; else if (!PHONE_RE.test(emergency.mobileNumber.trim())) errors.emergencyMobile = "Enter a valid mobile number."; if (emergency.email && !EMAIL_RE.test(emergency.email.trim())) errors.emergencyEmail = "Enter a valid email address."; } }
  return errors;
}

export function toRuntimeHireViewModel(currentStep: RuntimeHireStep, draft: RuntimeHireDraft, references: RuntimeHireReferences, errors: RuntimeHireErrors = {}, preparedCommand?: CreateEmployeeCommand): RuntimeHireViewModel { return { currentStep, draft, references, errors, isDirty: JSON.stringify(draft) !== JSON.stringify(emptyRuntimeHireDraft()), canGoBack: currentStep !== "personal", canContinue: Object.keys(errors).length === 0, submission: preparedCommand ? "prepared" : "idle", preparedCommand }; }
