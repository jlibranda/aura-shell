/**
 * People module — shared type definitions.
 * Pure types only (no runtime logic). These describe the shape of every
 * People record and the query/action contracts the module is built around.
 * "Country is a configuration": government IDs and compensation are structured
 * so the Philippines is the first configured country, not a hard-coded model.
 */

/* --------------------------------- status --------------------------------- */

export type EmployeeStatus =
  | "probationary"
  | "regular"
  | "active"
  | "on_leave"
  | "suspended"
  | "resigned"
  | "terminated"
  | "retired";

/** Badge tones that the shell's <Badge>/<StatusDot> accept. */
export type StatusTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type EmploymentType =
  | "regular"
  | "probationary"
  | "contractual"
  | "project_based"
  | "part_time";

export type PayFrequency = "semi_monthly" | "monthly";

/** Shared field-to-message contract used by People forms and lifecycle actions. */
export type FieldErrors = Record<string, string>;

/* -------------------------------- employee -------------------------------- */

export interface EmployeePersonal {
  firstName: string;
  lastName: string;
  middleName?: string;
  preferredName?: string;
  email: string;
  phone?: string;
  dateOfBirth?: string; // ISO date
  gender?: "female" | "male" | "non_binary" | "prefer_not_to_say";
  maritalStatus?: "single" | "married" | "widowed" | "separated";
  address?: string;
}

export interface EmploymentInfo {
  positionTitle: string;
  employmentType: EmploymentType;
  departmentId: string;
  teamId?: string;
  managerId?: string;
  entityId: string; // references a Sprint 1 ENTITIES id
  locationLabel: string;
  hireDate: string; // ISO date
  probationEndDate?: string;
  regularizationDate?: string;
}

export interface CompensationRecord {
  id: string;
  effectiveDate: string; // ISO date
  baseMonthly: number;
  currency: string; // e.g. "PHP"
  payFrequency: PayFrequency;
  reason: string;
  changedBy: string;
}

export interface Compensation {
  current: CompensationRecord;
  history: CompensationRecord[];
}

export type GovIdKey = "sss" | "philhealth" | "pagibig" | "tin";

export interface GovId {
  number: string | null;
  verified: boolean;
}

export type GovernmentIds = Record<GovIdKey, GovId>;

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
}

export type TimelineEventType =
  | "hired"
  | "promoted"
  | "transferred"
  | "salary_change"
  | "manager_change"
  | "status_change"
  | "regularized"
  | "suspended"
  | "reactivated"
  | "resigned"
  | "terminated"
  | "retired"
  | "offboarded"
  | "approved"
  | "note_added"
  | "document_added";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  timestamp: string; // ISO datetime
  actor: string;
}

export interface EmployeeNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  status: EmployeeStatus;
  personal: EmployeePersonal;
  employment: EmploymentInfo;
  compensation: Compensation;
  governmentIds: GovernmentIds;
  emergencyContacts: EmergencyContact[];
  timeline: TimelineEvent[];
  notes: EmployeeNote[];
  offboardedAt?: string | null;
}

/* --------------------------- organization records ------------------------- */

export interface Department {
  id: string;
  name: string;
  description?: string;
  leadId?: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  leadId?: string;
  memberIds: string[];
}

/* -------------------------------- documents ------------------------------- */

export type DocumentCategory =
  | "contract"
  | "government"
  | "identification"
  | "payroll"
  | "performance"
  | "medical"
  | "other";

export interface DocumentVersion {
  id: string;
  versionLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  sizeLabel: string;
  note?: string;
}

export interface PersonDocument {
  id: string;
  employeeId: string;
  name: string;
  category: DocumentCategory;
  currentVersionId: string;
  versions: DocumentVersion[];
}

/* -------------------------------- equipment ------------------------------- */

export type EquipmentStatus = "assigned" | "returned";

export interface EquipmentItem {
  id: string;
  employeeId: string;
  type: "laptop" | "phone" | "monitor" | "peripheral" | "other";
  name: string;
  serial?: string;
  assignedAt: string;
  returnedAt?: string | null;
  status: EquipmentStatus;
}

/* --------------------------- directory / queries -------------------------- */

export type ViewMode = "table" | "cards";
export type SortDir = "asc" | "desc";
export type SortKey =
  | "name"
  | "employeeNumber"
  | "positionTitle"
  | "department"
  | "status"
  | "hireDate";

export interface DirectoryQuery {
  search: string;
  statuses: EmployeeStatus[];
  departmentIds: string[];
  teamIds: string[];
  employmentTypes: EmploymentType[];
  managerId: string | null;
  entityId: string | null;
  missingGovId: GovIdKey | null;
  hiredFrom: string | null; // ISO date
  hiredTo: string | null; // ISO date
  sortKey: SortKey;
  sortDir: SortDir;
  page: number; // 1-based
  pageSize: number;
  view: ViewMode;
}

export interface SavedView {
  id: string;
  name: string;
  query: Partial<DirectoryQuery>;
  system?: boolean;
}

/* ---------------------------------- actions ------------------------------- */

export type ActionType =
  | "hire"
  | "edit"
  | "promote"
  | "transfer"
  | "salary_change"
  | "change_manager"
  | "approve"
  | "suspend"
  | "reactivate"
  | "terminate"
  | "offboard";

/** Input contract for creating an employee via the (future) Hire wizard. */
export interface HireInput {
  personal: EmployeePersonal;
  employment: Omit<EmploymentInfo, "regularizationDate">;
  baseMonthly: number;
  payFrequency: PayFrequency;
  currency?: string;
  governmentIds?: Partial<Record<GovIdKey, string>>;
  status?: EmployeeStatus;
}

/* --------------------------------- copilot -------------------------------- */

export type CopilotIntent =
  | { kind: "filter"; label: string; params: Partial<DirectoryQuery> }
  | { kind: "navigate"; label: string; href: string }
  | { kind: "open_profile"; label: string; employeeId: string }
  | { kind: "none"; label: string };
