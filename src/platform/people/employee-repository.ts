import type { Employee } from "@/lib/people/people-types";
import type { TenantContext } from "@/platform/context";
export type EmployeeProfileChanges = Partial<Pick<Employee["personal"], "firstName" | "lastName" | "middleName" | "preferredName" | "dateOfBirth" | "gender" | "maritalStatus" | "address">>;
export type EmployeeContactChanges = Partial<Pick<Employee["personal"], "email" | "phone">>;
export type EmployeeGovernmentIdChanges = Partial<Employee["governmentIds"]>;
export interface EmployeeRepository { findById(context: TenantContext, employeeId: string): Promise<Employee | undefined>; list(context: TenantContext): Promise<Employee[]>; search(context: TenantContext, query: string): Promise<Employee[]>; updateProfile(context: TenantContext, employeeId: string, changes: EmployeeProfileChanges): Promise<Employee>; updateContact(context: TenantContext, employeeId: string, changes: EmployeeContactChanges): Promise<Employee>; updateGovernmentIds(context: TenantContext, employeeId: string, changes: EmployeeGovernmentIdChanges): Promise<Employee>; }
