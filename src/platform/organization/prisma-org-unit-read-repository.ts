import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { OrgUnitReadRepository } from "@/platform/organization/org-unit-repository";
import type { OrgUnitKind, OrgUnitRecord, OrgUnitStatus } from "@/platform/organization/org-unit";

export type PrismaOrgUnitReadClient = Pick<PrismaClient, "orgUnit">;

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

function toRecord(value: {
  id: string; tenantId: string; code: string; name: string; kind: string; parentId: string | null;
  status: string; createdAt: Date; createdBy: string; updatedAt: Date;
}): OrgUnitRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    code: value.code,
    name: value.name,
    kind: value.kind as OrgUnitKind,
    ...(value.parentId ? { parentId: value.parentId } : {}),
    status: value.status as OrgUnitStatus,
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
  });
}

/** Read-only, tenant-scoped. Every method requires organization.view. */
export class PrismaOrgUnitReadRepository implements OrgUnitReadRepository {
  constructor(private readonly prisma: PrismaOrgUnitReadClient) {}

  async getById(context: TenantContext, id: string): Promise<OrgUnitRecord | undefined> {
    requireOrganizationView(context);
    const unit = await this.prisma.orgUnit.findFirst({ where: { tenantId: context.tenantId, id } });
    return unit ? toRecord(unit) : undefined;
  }

  async getByCode(context: TenantContext, code: string): Promise<OrgUnitRecord | undefined> {
    requireOrganizationView(context);
    const unit = await this.prisma.orgUnit.findUnique({ where: { tenantId_code: { tenantId: context.tenantId, code } } });
    return unit ? toRecord(unit) : undefined;
  }

  async listChildren(context: TenantContext, parentId: string | null): Promise<OrgUnitRecord[]> {
    requireOrganizationView(context);
    const units = await this.prisma.orgUnit.findMany({ where: { tenantId: context.tenantId, parentId }, orderBy: [{ name: "asc" }, { code: "asc" }] });
    return units.map(toRecord);
  }

  async listAll(context: TenantContext): Promise<OrgUnitRecord[]> {
    requireOrganizationView(context);
    const units = await this.prisma.orgUnit.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ name: "asc" }, { code: "asc" }] });
    return units.map(toRecord);
  }
}
