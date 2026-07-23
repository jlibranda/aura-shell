/**
 * Types and validation for the Hire Wizard. Pure — no React, no side effects.
 * The draft mirrors HireInput but with all fields optional/string-friendly so
 * partially-completed steps can be persisted and resumed.
 */
import type {
  EmergencyContact,
  EmploymentType,
  GovIdKey,
  HireInput,
  PayFrequency,
} from "@/lib/people/people-types";

export const HIRE_STEP_KEYS = [
  "personal",
  "contact",
  "employment",
  "government",
  "emergency",
  "review",
] as const;

export type HireStepKey = (typeof HIRE_STEP_KEYS)[number];

export interface HireDraftPersonal {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string | null;
  gender: string;
  maritalStatus: string;
  nationality: string;
}

export interface HireDraftContact {
  personalEmail: string;
  workEmail: string;
  phone: string;
  address: string;
}

export interface HireDraftEmployment {
  entityId: string;
  businessUnit: string;
  departmentId: string;
  teamId: string;
  positionTitle: string;
  managerId: string;
  employmentType: EmploymentType | "";
  hireDate: string | null;
  locationLabel: string;
  payFrequency: PayFrequency;
}

export type HireDraftGovernment = Record<GovIdKey, string>;

export interface HireDraftEmergency {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  address: string;
}

export interface HireDraft {
  personal: HireDraftPersonal;
  contact: HireDraftContact;
  employment: HireDraftEmployment;
  government: HireDraftGovernment;
  emergency: HireDraftEmergency;
  updatedAt: string;
}

export function emptyDraft(): HireDraft {
  return {
    personal: {
      firstName: "",
      middleName: "",
      lastName: "",
      preferredName: "",
      dateOfBirth: null,
      gender: "",
      maritalStatus: "",
      nationality: "Filipino",
    },
    contact: {
      personalEmail: "",
      workEmail: "",
      phone: "",
      address: "",
    },
    employment: {
      entityId: "",
      businessUnit: "",
      departmentId: "",
      teamId: "",
      positionTitle: "",
      managerId: "",
      employmentType: "",
      hireDate: null,
      locationLabel: "",
      payFrequency: "semi_monthly",
    },
    government: { tin: "", sss: "", philhealth: "", pagibig: "" },
    emergency: {
      name: "",
      relationship: "",
      phone: "",
      email: "",
      address: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s()-]{6,}$/;

function required(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function validatePersonal(p: HireDraftPersonal): FieldErrors {
  const errors: FieldErrors = {};
  if (!required(p.firstName)) errors.firstName = "First name is required.";
  if (!required(p.lastName)) errors.lastName = "Last name is required.";
  if (!required(p.dateOfBirth)) {
    errors.dateOfBirth = "Birth date is required.";
  } else if (p.dateOfBirth && p.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    errors.dateOfBirth = "Birth date can't be in the future.";
  }
  if (!required(p.gender)) errors.gender = "Gender is required.";
  if (!required(p.maritalStatus)) errors.maritalStatus = "Civil status is required.";
  if (!required(p.nationality)) errors.nationality = "Nationality is required.";
  return errors;
}

export function validateContact(c: HireDraftContact): FieldErrors {
  const errors: FieldErrors = {};
  if (!required(c.workEmail)) {
    errors.workEmail = "Work email is required.";
  } else if (!EMAIL_RE.test(c.workEmail)) {
    errors.workEmail = "Enter a valid email address.";
  }
  if (c.personalEmail && !EMAIL_RE.test(c.personalEmail)) {
    errors.personalEmail = "Enter a valid email address.";
  }
  if (!required(c.phone)) {
    errors.phone = "Mobile number is required.";
  } else if (!PHONE_RE.test(c.phone)) {
    errors.phone = "Enter a valid mobile number.";
  }
  return errors;
}

export function validateEmployment(e: HireDraftEmployment): FieldErrors {
  const errors: FieldErrors = {};
  if (!required(e.entityId)) errors.entityId = "Entity is required.";
  if (!required(e.departmentId)) errors.departmentId = "Department is required.";
  if (!required(e.positionTitle)) errors.positionTitle = "Position is required.";
  if (!e.employmentType) errors.employmentType = "Employment type is required.";
  if (!required(e.hireDate)) errors.hireDate = "Hire date is required.";
  if (!required(e.locationLabel)) errors.locationLabel = "Work location is required.";
  return errors;
}

/** Government IDs are optional, but if present must match their formats. */
const GOV_FORMATS: Record<GovIdKey, { re: RegExp; hint: string }> = {
  tin: { re: /^\d{3}-?\d{3}-?\d{3}-?\d{3}$/, hint: "TIN should be 12 digits." },
  sss: { re: /^\d{2}-?\d{7}-?\d{1}$/, hint: "SSS should be 10 digits." },
  philhealth: { re: /^\d{2}-?\d{9}-?\d{1}$/, hint: "PhilHealth should be 12 digits." },
  pagibig: { re: /^\d{4}-?\d{4}-?\d{4}$/, hint: "Pag-IBIG should be 12 digits." },
};

export function validateGovernment(g: HireDraftGovernment): FieldErrors {
  const errors: FieldErrors = {};
  (Object.keys(GOV_FORMATS) as GovIdKey[]).forEach((key) => {
    const value = g[key]?.trim();
    if (value && !GOV_FORMATS[key].re.test(value)) {
      errors[key] = GOV_FORMATS[key].hint;
    }
  });
  return errors;
}

export function validateEmergency(e: HireDraftEmergency): FieldErrors {
  const errors: FieldErrors = {};
  const anyFilled = Boolean(
    e.name || e.relationship || e.phone || e.email || e.address,
  );
  if (anyFilled) {
    if (!required(e.name)) errors.name = "Contact name is required.";
    if (!required(e.relationship)) errors.relationship = "Relationship is required.";
    if (!required(e.phone)) {
      errors.phone = "Mobile number is required.";
    } else if (!PHONE_RE.test(e.phone)) {
      errors.phone = "Enter a valid mobile number.";
    }
    if (e.email && !EMAIL_RE.test(e.email)) errors.email = "Enter a valid email address.";
  }
  return errors;
}

export function validateStep(step: HireStepKey, draft: HireDraft): FieldErrors {
  switch (step) {
    case "personal":
      return validatePersonal(draft.personal);
    case "contact":
      return validateContact(draft.contact);
    case "employment":
      return validateEmployment(draft.employment);
    case "government":
      return validateGovernment(draft.government);
    case "emergency":
      return validateEmergency(draft.emergency);
    default:
      return {};
  }
}

export function isStepValid(step: HireStepKey, draft: HireDraft): boolean {
  return Object.keys(validateStep(step, draft)).length === 0;
}

/** Map a completed draft to the repository HireInput contract. */
export function draftToHireInput(draft: HireDraft): HireInput {
  const gov: Partial<Record<GovIdKey, string>> = {};
  (Object.keys(draft.government) as GovIdKey[]).forEach((key) => {
    const value = draft.government[key]?.trim();
    if (value) gov[key] = value;
  });

  return {
    personal: {
      firstName: draft.personal.firstName.trim(),
      lastName: draft.personal.lastName.trim(),
      middleName: draft.personal.middleName.trim() || undefined,
      preferredName: draft.personal.preferredName.trim() || undefined,
      email: draft.contact.workEmail.trim(),
      phone: draft.contact.phone.trim() || undefined,
      dateOfBirth: draft.personal.dateOfBirth ?? undefined,
      gender: (draft.personal.gender || undefined) as HireInput["personal"]["gender"],
      maritalStatus: (draft.personal.maritalStatus || undefined) as HireInput["personal"]["maritalStatus"],
      address: draft.contact.address.trim() || undefined,
    },
    employment: {
      positionTitle: draft.employment.positionTitle.trim(),
      employmentType: draft.employment.employmentType as EmploymentType,
      departmentId: draft.employment.departmentId,
      teamId: draft.employment.teamId || undefined,
      managerId: draft.employment.managerId || undefined,
      entityId: draft.employment.entityId,
      locationLabel: draft.employment.locationLabel.trim(),
      hireDate: draft.employment.hireDate ?? new Date().toISOString().slice(0, 10),
      probationEndDate: undefined,
    },
    baseMonthly: 0,
    payFrequency: draft.employment.payFrequency,
    currency: "PHP",
    governmentIds: gov,
    status: draft.employment.employmentType === "regular" ? "regular" : "probationary",
  };
}

/** The emergency contact drawn from a draft, if one was provided. */
export function draftToEmergencyContact(
  draft: HireDraft,
): Omit<EmergencyContact, "id"> | null {
  const e = draft.emergency;
  if (!e.name.trim()) return null;
  return {
    name: e.name.trim(),
    relationship: e.relationship.trim(),
    phone: e.phone.trim(),
    email: e.email.trim() || undefined,
    isPrimary: true,
  };
}