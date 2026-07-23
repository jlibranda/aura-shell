import type { Prisma } from "@prisma/client";
import { DEVELOPMENT_PEOPLE_TENANT_ID, createDevelopmentPeopleFixtures } from "@/platform/people/persistence/development-people-fixtures";

export type DevelopmentSeedResult = Readonly<{ state: "seeded" | "already_seeded"; employeeCount: number }>;
export type DevelopmentSeedEnvironment = Readonly<{ NODE_ENV?: string; AURA_SEED_ENV?: string }>;

export interface DevelopmentPeopleSeedClient {
  $transaction<TResult>(operation: (transaction: Pick<Prisma.TransactionClient, "employee" | "tenant">) => Promise<TResult>): Promise<TResult>;
}

const schemaOnlyPersonalDate = new Date("1900-01-01T00:00:00.000Z");

export function assertDevelopmentSeedEnvironment(environment: DevelopmentSeedEnvironment = process.env): void {
  if (environment.NODE_ENV === "production" || environment.AURA_SEED_ENV !== "development") {
    throw new Error("Development seeding is blocked. Run only npm run seed:development against the approved development database.");
  }
}

function toEmployeeRows(): Prisma.EmployeeCreateManyInput[] {
  return createDevelopmentPeopleFixtures().map((fixture) => ({
    tenantId: DEVELOPMENT_PEOPLE_TENANT_ID,
    employeeId: fixture.employeeId,
    employeeNumber: fixture.employeeNumber,
    displayName: fixture.displayName,
    firstName: fixture.firstName,
    middleName: fixture.middleName,
    lastName: fixture.lastName,
    preferredName: fixture.preferredName,
    dateOfBirth: schemaOnlyPersonalDate,
    gender: "not_specified",
    maritalStatus: "not_specified",
    nationality: "not_specified",
    workEmail: fixture.workEmail,
    personalEmail: null,
    mobileNumber: "",
    homeAddress: "",
    departmentId: fixture.departmentId,
    teamId: fixture.teamId,
    position: fixture.position,
    managerId: fixture.managerId,
    employmentType: fixture.employmentType,
    employmentStatus: fixture.employmentStatus,
    hireDate: new Date(`${fixture.hireDate}T00:00:00.000Z`),
    workLocation: fixture.workLocation,
    emergencyContactName: null,
    emergencyRelationship: null,
    emergencyMobileNumber: null,
    emergencyEmail: null,
    emergencyAddress: null,
  }));
}

/** Explicit development-only seed. It never clears, updates, or touches audit data. */
export async function seedDevelopmentPeople(prisma: DevelopmentPeopleSeedClient, environment: DevelopmentSeedEnvironment = process.env): Promise<DevelopmentSeedResult> {
  assertDevelopmentSeedEnvironment(environment);
  const rows = toEmployeeRows();
  return prisma.$transaction(async (transaction) => {
    const existingCount = await transaction.employee.count();
    if (existingCount > 0) {
      const matchingCount = await transaction.employee.count({ where: { tenantId: DEVELOPMENT_PEOPLE_TENANT_ID } });
      if (matchingCount === rows.length && existingCount === rows.length) return Object.freeze({ state: "already_seeded" as const, employeeCount: rows.length });
      throw new Error("Development seed refused: the database already contains employee rows. It never overwrites or resets data.");
    }
    await transaction.tenant.upsert({ where: { id: DEVELOPMENT_PEOPLE_TENANT_ID }, create: { id: DEVELOPMENT_PEOPLE_TENANT_ID }, update: {} });
    await transaction.employee.createMany({ data: rows });
    return Object.freeze({ state: "seeded" as const, employeeCount: rows.length });
  });
}
