import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { LegalEntityReadRepository } from "@/platform/organization/legal-entity-repository";
import type { LegalEntityRecord, LegalEntityStatus } from "@/platform/organization/legal-entity";

export type PrismaLegalEntityReadClient = Pick<PrismaClient, "legalEntity">;

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

function toRecord(value: {
  id: string; tenantId: string; code: string; legalName: string; countryCode: string; status: string;
  createdAt: Date; createdBy: string; updatedAt: Date; archivedAt: Date | null;
}): LegalEntityRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    code: value.code,
    legalName: value.legalName,
    countryCode: value.countryCode,
    status: value.status as LegalEntityStatus,
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
    ...(value.archivedAt ? { archivedAt: value.archivedAt.toISOString() } : {}),
  });
}

/** Read-only, tenant-scoped. Every method requires organization.view. */
export class PrismaLegalEntityReadRepository implements LegalEntityReadRepository {
  constructor(private readonly prisma: PrismaLegalEntityReadClient) {}

  async getById(context: TenantContext, id: string): Promise<LegalEntityRecord | undefined> {
    requireOrganizationView(context);
    const entity = await this.prisma.legalEntity.findFirst({ where: { tenantId: context.tenantId, id } });
    return entity ? toRecord(entity) : undefined;
  }

  async getByCode(context: TenantContext, code: string): Promise<LegalEntityRecord | undefined> {
    requireOrganizationView(context);
    const entity = await this.prisma.legalEntity.findUnique({ where: { tenantId_code: { tenantId: context.tenantId, code } } });
    return entity ? toRecord(entity) : undefined;
  }

  async listActive(context: TenantContext): Promise<LegalEntityRecord[]> {
    requireOrganizationView(context);
    const entities = await this.prisma.legalEntity.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, orderBy: [{ legalName: "asc" }, { code: "asc" }] });
    return entities.map(toRecord);
  }

  async listAll(context: TenantContext): Promise<LegalEntityRecord[]> {
    requireOrganizationView(context);
    const entities = await this.prisma.legalEntity.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ legalName: "asc" }, { code: "asc" }] });
    return entities.map(toRecord);
  }
}
