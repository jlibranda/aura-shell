export const RUNTIME_HIRE_FIELD_DISPOSITIONS = ["ACTIVE_RUNTIME", "DEFERRED_VISIBLE", "BLOCKED_SECURITY", "MOVED_TO_ANOTHER_MODULE", "RETIRED_APPROVED"] as const;
export type RuntimeHireFieldDisposition = (typeof RUNTIME_HIRE_FIELD_DISPOSITIONS)[number];
export type RuntimeHireSection = "personal" | "contact" | "employment" | "government" | "emergency";

export interface RuntimeHireFieldManifestEntry {
  id: string;
  label: string;
  section: RuntimeHireSection;
  required: boolean;
  disposition: RuntimeHireFieldDisposition;
  capabilityId: string;
  runtimeKey?: string;
  reviewKey?: string;
}

const active = (id: string, label: string, section: RuntimeHireSection, required: boolean, runtimeKey = id): RuntimeHireFieldManifestEntry => ({ id, label, section, required, disposition: "ACTIVE_RUNTIME", capabilityId: `PEOPLE.EMPLOYEE.HIRE.${section.toUpperCase()}`, runtimeKey, reviewKey: runtimeKey });

/** Complete legacy editable-field inventory. Never remove an entry without a documented baseline change. */
export const RUNTIME_HIRE_FIELD_MANIFEST: readonly RuntimeHireFieldManifestEntry[] = [
  active("firstName", "First name", "personal", true), active("middleName", "Middle name", "personal", false), active("lastName", "Last name", "personal", true), active("preferredName", "Preferred name", "personal", false), active("dateOfBirth", "Birth date", "personal", true), active("gender", "Gender", "personal", true), active("maritalStatus", "Civil status", "personal", true), active("nationality", "Nationality", "personal", true),
  active("personalEmail", "Personal email", "contact", false), active("workEmail", "Work email", "contact", true), active("mobileNumber", "Mobile number", "contact", true), active("homeAddress", "Address", "contact", false),
  // Legal Entity is now a first-class, adopted aggregate (ADR-013, superseding
  // ADR-012 §5's deferral) — a real single-tenant, multiple-employers-of-record
  // requirement arrived one slice ahead of Payroll/multi-country.
  active("entity", "Legal entity", "employment", true, "legalEntityId"),
  // Hire Placement Alignment: department/team/work-location free-text/flat-kind
  // fields are retired in favor of orgUnitId (a hierarchical, any-kind
  // OrgUnit selector) and locationId (a Location master-data picker) —
  // Business Unit is reachable through orgUnitId, not a separate field.
  { id: "businessUnit", label: "Business unit", section: "employment", required: false, disposition: "RETIRED_APPROVED", capabilityId: "PEOPLE.EMPLOYEE.HIRE.ORGANIZATION_ASSIGNMENT" },
  { id: "departmentId", label: "Department", section: "employment", required: true, disposition: "RETIRED_APPROVED", capabilityId: "PEOPLE.EMPLOYEE.HIRE.EMPLOYMENT" },
  { id: "teamId", label: "Team", section: "employment", required: false, disposition: "RETIRED_APPROVED", capabilityId: "PEOPLE.EMPLOYEE.HIRE.EMPLOYMENT" },
  { id: "workLocation", label: "Work location", section: "employment", required: true, disposition: "RETIRED_APPROVED", capabilityId: "PEOPLE.EMPLOYEE.HIRE.EMPLOYMENT" },
  active("orgUnitId", "Organization unit", "employment", true), active("locationId", "Location", "employment", true), active("position", "Position", "employment", true), active("managerId", "Manager", "employment", false), active("employmentType", "Employment type", "employment", true), active("hireDate", "Hire date", "employment", true),
  { id: "payFrequency", label: "Pay frequency", section: "employment", required: false, disposition: "MOVED_TO_ANOTHER_MODULE", capabilityId: "PEOPLE.EMPLOYEE.HIRE.PAY_FREQUENCY" },
  ...["tin", "sss", "philhealth", "pagibig"].map((id) => ({ id, label: id === "tin" ? "TIN" : id === "sss" ? "SSS" : id === "philhealth" ? "PhilHealth" : "Pag-IBIG", section: "government" as const, required: false, disposition: "BLOCKED_SECURITY" as const, capabilityId: "PEOPLE.EMPLOYEE.HIRE.GOVERNMENT_ID_ONBOARDING" })),
  active("emergencyName", "Contact name", "emergency", false, "name"), active("emergencyRelationship", "Relationship", "emergency", false, "relationship"), active("emergencyMobile", "Mobile number", "emergency", false, "mobileNumber"), active("emergencyEmail", "Email", "emergency", false, "email"), active("emergencyAddress", "Address", "emergency", false, "address"),
];

export const RUNTIME_HIRE_FIELD_IDS = RUNTIME_HIRE_FIELD_MANIFEST.map((field) => field.id);
