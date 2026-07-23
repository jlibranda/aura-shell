import { createSeed } from "@/lib/people/people-data";

export const DEVELOPMENT_PEOPLE_TENANT_ID = "nw-ph";

/**
 * Approved synthetic fixture projection for development persistence only.
 * It deliberately omits compensation, Government IDs, banking, tax, timeline,
 * documents, notes, emergency contacts, personal email, personal phone, and
 * home address. Neutral schema placeholders never cross a read boundary.
 */
export type DevelopmentPeopleFixture = Readonly<{
  employeeId: string;
  employeeNumber: string;
  displayName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  workEmail: string;
  departmentId: string;
  teamId: string | null;
  position: string;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  hireDate: string;
  workLocation: string;
}>;

export function createDevelopmentPeopleFixtures(): readonly DevelopmentPeopleFixture[] {
  return Object.freeze(createSeed().employees.map((employee) => Object.freeze({
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    displayName: [employee.personal.firstName, employee.personal.middleName, employee.personal.lastName].filter(Boolean).join(" "),
    firstName: employee.personal.firstName,
    middleName: employee.personal.middleName ?? null,
    lastName: employee.personal.lastName,
    preferredName: employee.personal.preferredName ?? null,
    workEmail: employee.personal.email.trim().toLowerCase(),
    departmentId: employee.employment.departmentId,
    teamId: employee.employment.teamId ?? null,
    position: employee.employment.positionTitle,
    managerId: employee.employment.managerId ?? null,
    employmentType: employee.employment.employmentType,
    employmentStatus: employee.status,
    hireDate: employee.employment.hireDate,
    workLocation: employee.employment.locationLabel,
  })));
}
