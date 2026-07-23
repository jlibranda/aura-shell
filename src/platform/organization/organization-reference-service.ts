import type { TenantContext } from "@/platform/context";
import { requirePeoplePermission } from "@/platform/people/application/people-policies";
import type { OrganizationReferenceDto, OrganizationReferenceOptionDto, OrganizationReferenceType, OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";
import type { OrganizationReferenceRepository } from "@/platform/organization/organization-reference-repository";

export interface OrganizationReferenceInput {
  departmentId?: string;
  teamId?: string;
  managerId?: string;
}

export interface OrganizationReferenceService {
  resolve(context: TenantContext, type: OrganizationReferenceType, id: string): Promise<OrganizationReferenceDto | undefined>;
  list(context: TenantContext, type: OrganizationReferenceType): Promise<OrganizationReferenceOptionDto[]>;
  resolveSummary(context: TenantContext, input: OrganizationReferenceInput): Promise<OrganizationSummaryDto>;
  resolveSummaries(context: TenantContext, inputs: OrganizationReferenceInput[]): Promise<OrganizationSummaryDto[]>;
}

export class OrganizationReferenceApplicationService implements OrganizationReferenceService {
  constructor(private readonly references: OrganizationReferenceRepository) {}

  async resolve(context: TenantContext, type: OrganizationReferenceType, id: string) {
    requirePeoplePermission(context, "people.read");
    return this.resolveUnchecked(context, type, id);
  }

  async list(context: TenantContext, type: OrganizationReferenceType) {
    requirePeoplePermission(context, "people.read");
    return (await this.references.list(context, type)).map((reference) => ({ id: reference.id, displayName: reference.displayName, type: reference.type, ...(reference.parentId ? { parentId: reference.parentId } : {}) }));
  }

  async resolveSummary(context: TenantContext, input: OrganizationReferenceInput): Promise<OrganizationSummaryDto> {
    return (await this.resolveSummaries(context, [input]))[0];
  }

  async resolveSummaries(context: TenantContext, inputs: OrganizationReferenceInput[]): Promise<OrganizationSummaryDto[]> {
    requirePeoplePermission(context, "people.read");
    const cache = new Map<string, Promise<OrganizationReferenceDto | undefined>>();
    const resolveCached = (type: OrganizationReferenceType, id: string | undefined) => {
      if (!id) return undefined;
      const key = `${type}:${id}`;
      const existing = cache.get(key);
      if (existing) return existing;
      const pending = this.resolveUnchecked(context, type, id);
      cache.set(key, pending);
      return pending;
    };
    return Promise.all(inputs.map(async (input) => {
      const [department, team, manager] = await Promise.all([
        resolveCached("department", input.departmentId),
        resolveCached("team", input.teamId),
        resolveCached("manager", input.managerId),
      ]);
      return { department, team, manager };
    }));
  }

  private async resolveUnchecked(context: TenantContext, type: OrganizationReferenceType, id: string) {
    const reference = await this.references.findById(context, type, id);
    return reference && { id: reference.id, displayName: reference.displayName, type: reference.type };
  }
}
