import type { TenantContext } from "@/platform/context";
import type { EmployeeContactReadModel, EmployeeProfileReadModel } from "@/platform/people/read-models/people-read-models";

/** Server-only port for profile-safe durable reads. */
export interface EmployeeProfileReadRepository {
  findProfile(context: TenantContext, employeeId: string): Promise<EmployeeProfileReadModel | undefined>;
  findContact(context: TenantContext, employeeId: string): Promise<EmployeeContactReadModel | undefined>;
}
