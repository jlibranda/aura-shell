/**
 * Safe, read-side-only People contracts. These shapes deliberately omit every
 * personal, emergency, compensation, Government-ID, tenant, and audit field.
 */
export type PeopleEmploymentStatus =
  | "probationary"
  | "regular"
  | "active"
  | "on_leave"
  | "suspended"
  | "resigned"
  | "terminated"
  | "retired"
  | "not_available";

export interface PeopleDirectoryReadModel {
  id: string;
  employeeNumber: string;
  displayName: string;
  workEmail: string;
  departmentId: string;
  teamId?: string;
  managerId?: string;
  hireDate: string;
  position: string;
  status: PeopleEmploymentStatus;
}

export interface EmployeeProfileReadModel {
  id: string;
  employeeNumber: string;
  displayName: string;
  status: PeopleEmploymentStatus;
  position: string;
  departmentId: string;
  teamId?: string;
  managerId?: string;
  location: string;
  hireDate: string;
  /** Not persisted by the canonical schema; retained only as an optional UI boundary. */
  regularizationDate?: string;
}

export interface EmployeeContactReadModel {
  id: string;
  workEmail: string;
}
