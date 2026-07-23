import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";
export interface EmployeeDirectoryDto { id: string; employeeNumber: string; displayName: string; workEmail: string; departmentId: string; teamId?: string; managerId?: string; hireDate: string; position: string; status: Employee["status"]; }
export interface EmployeeProfileDto { id: string; employeeNumber: string; displayName: string; status: Employee["status"]; position: string; departmentId: string; teamId?: string; managerId?: string; location: string; hireDate: string; regularizationDate?: string; }
/** Profile-safe contact boundary. Personal phone and address are intentionally excluded. */
export interface EmployeeContactDto { id: string; workEmail: string; }
export interface EmployeeGovernmentIdsDto { id: string; governmentIds: Employee["governmentIds"]; }
export interface EmployeeListInput { offset?: number; limit?: number; department?: string; employmentStatus?: Employee["status"]; sortBy?: "name" | "employeeNumber"; sortDirection?: "asc" | "desc"; }
export interface EmployeeListResult { items: EmployeeDirectoryDto[]; offset: number; limit: number; total: number; }
export interface EmployeeSearchInput { query: string; limit?: number; }
export interface EmployeeSearchResult { items: EmployeeDirectoryDto[]; limit: number; total: number; }
export const toEmployeeDirectoryDto = (employee: Employee): EmployeeDirectoryDto => ({ id: employee.id, employeeNumber: employee.employeeNumber, displayName: fullName(employee), workEmail: employee.personal.email, departmentId: employee.employment.departmentId, teamId: employee.employment.teamId, managerId: employee.employment.managerId, hireDate: employee.employment.hireDate, position: employee.employment.positionTitle, status: employee.status });
export const toEmployeeProfileDto = (employee: Employee): EmployeeProfileDto => ({ id: employee.id, employeeNumber: employee.employeeNumber, displayName: fullName(employee), status: employee.status, position: employee.employment.positionTitle, departmentId: employee.employment.departmentId, teamId: employee.employment.teamId, managerId: employee.employment.managerId, location: employee.employment.locationLabel, hireDate: employee.employment.hireDate, regularizationDate: employee.employment.regularizationDate });
export const toEmployeeContactDto = (employee: Employee): EmployeeContactDto => ({ id: employee.id, workEmail: employee.personal.email });
export const toEmployeeGovernmentIdsDto = (employee: Employee): EmployeeGovernmentIdsDto => ({ id: employee.id, governmentIds: employee.governmentIds });
