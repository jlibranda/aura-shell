import { createSeed } from "@/lib/people/people-data";
import { fullName } from "@/lib/people/directory-query";
import type { TenantContext } from "@/platform/context";
import type { OrganizationReferenceType } from "@/platform/organization/organization-reference-dtos";

export interface OrganizationReferenceRecord {
  id: string;
  displayName: string;
  type: OrganizationReferenceType;
  tenantId: string;
  parentId?: string;
}

export interface OrganizationReferenceRepository {
  findById(context: TenantContext, type: OrganizationReferenceType, id: string): Promise<OrganizationReferenceRecord | undefined>;
  list(context: TenantContext, type: OrganizationReferenceType): Promise<OrganizationReferenceRecord[]>;
}

/** Development infrastructure only. It owns organization projections, not UI store state. */
export class InMemoryOrganizationReferenceRepository implements OrganizationReferenceRepository {
  private readonly records = this.createRecords();

  async findById(context: TenantContext, type: OrganizationReferenceType, id: string) {
    const record = this.records.find((item) => item.tenantId === context.tenantId && item.type === type && item.id === id);
    return record ? { ...record } : undefined;
  }

  async list(context: TenantContext, type: OrganizationReferenceType) {
    return this.records.filter((item) => item.tenantId === context.tenantId && item.type === type).map((item) => ({ ...item }));
  }

  private createRecords(): OrganizationReferenceRecord[] {
    const seed = createSeed();
    return [
      ...seed.departments.map((department) => ({ id: department.id, displayName: department.name, type: "department" as const, tenantId: "nw-ph" })),
      ...seed.teams.map((team) => ({ id: team.id, displayName: team.name, type: "team" as const, tenantId: "nw-ph", parentId: team.departmentId })),
      ...seed.employees.map((employee) => ({ id: employee.id, displayName: fullName(employee), type: "manager" as const, tenantId: "nw-ph" })),
    ];
  }
}
