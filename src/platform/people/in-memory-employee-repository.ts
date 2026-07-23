/** Development infrastructure only. Replace with durable persistence in production. */
import { createSeed } from "@/lib/people/people-data";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";
import { NotFoundError } from "@/platform/errors";
import type { TenantContext } from "@/platform/context";
import type { EmployeeContactChanges, EmployeeGovernmentIdChanges, EmployeeProfileChanges, EmployeeRepository } from "@/platform/people/employee-repository";

const clone = <T,>(value: T): T => structuredClone(value);
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private employees = createSeed().employees.map(clone);
  async findById(_context: TenantContext, employeeId: string): Promise<Employee | undefined> { const employee = this.employees.find((item) => item.id === employeeId); return employee ? clone(employee) : undefined; }
  async list(_context: TenantContext): Promise<Employee[]> { return clone(this.employees); }
  async search(context: TenantContext, query: string): Promise<Employee[]> { const value = query.trim().toLowerCase(); return (await this.list(context)).filter((employee) => fullName(employee).toLowerCase().includes(value) || employee.employeeNumber.toLowerCase().includes(value) || employee.personal.email.toLowerCase().includes(value)); }
  async updateProfile(context: TenantContext, employeeId: string, changes: EmployeeProfileChanges): Promise<Employee> { return this.update(context, employeeId, (employee) => ({ ...employee, personal: { ...employee.personal, ...changes } })); }
  async updateContact(context: TenantContext, employeeId: string, changes: EmployeeContactChanges): Promise<Employee> { return this.update(context, employeeId, (employee) => ({ ...employee, personal: { ...employee.personal, ...changes } })); }
  async updateGovernmentIds(context: TenantContext, employeeId: string, changes: EmployeeGovernmentIdChanges): Promise<Employee> { return this.update(context, employeeId, (employee) => ({ ...employee, governmentIds: { ...employee.governmentIds, ...changes } })); }
  private async update(_context: TenantContext, employeeId: string, transform: (employee: Employee) => Employee): Promise<Employee> { const index = this.employees.findIndex((employee) => employee.id === employeeId); if (index < 0) throw new NotFoundError("Employee"); this.employees[index] = transform(this.employees[index]); return clone(this.employees[index]); }
}
