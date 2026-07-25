import type { PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { LocationReadRepository } from "@/platform/organization/location-repository";
import type { Address, LocationRecord, LocationStatus } from "@/platform/organization/location";

export type PrismaLocationReadClient = Pick<PrismaClient, "location">;

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

function toRecord(value: {
  id: string; tenantId: string; code: string; name: string;
  addressLine1: string; addressLine2: string | null; city: string; region: string | null; postalCode: string | null;
  countryCode: string; timezone: string; status: string;
  createdAt: Date; createdBy: string; updatedAt: Date; archivedAt: Date | null;
}): LocationRecord {
  const address: Address = {
    line1: value.addressLine1,
    city: value.city,
    ...(value.addressLine2 ? { line2: value.addressLine2 } : {}),
    ...(value.region ? { region: value.region } : {}),
    ...(value.postalCode ? { postalCode: value.postalCode } : {}),
  };
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    code: value.code,
    name: value.name,
    address,
    countryCode: value.countryCode,
    timezone: value.timezone,
    status: value.status as LocationStatus,
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
    ...(value.archivedAt ? { archivedAt: value.archivedAt.toISOString() } : {}),
  });
}

/** Read-only, tenant-scoped. Every method requires organization.view. */
export class PrismaLocationReadRepository implements LocationReadRepository {
  constructor(private readonly prisma: PrismaLocationReadClient) {}

  async getById(context: TenantContext, id: string): Promise<LocationRecord | undefined> {
    requireOrganizationView(context);
    const location = await this.prisma.location.findFirst({ where: { tenantId: context.tenantId, id } });
    return location ? toRecord(location) : undefined;
  }

  async getByCode(context: TenantContext, code: string): Promise<LocationRecord | undefined> {
    requireOrganizationView(context);
    const location = await this.prisma.location.findUnique({ where: { tenantId_code: { tenantId: context.tenantId, code } } });
    return location ? toRecord(location) : undefined;
  }

  async listActive(context: TenantContext): Promise<LocationRecord[]> {
    requireOrganizationView(context);
    const locations = await this.prisma.location.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE" }, orderBy: [{ name: "asc" }, { code: "asc" }] });
    return locations.map(toRecord);
  }

  async listAll(context: TenantContext): Promise<LocationRecord[]> {
    requireOrganizationView(context);
    const locations = await this.prisma.location.findMany({ where: { tenantId: context.tenantId }, orderBy: [{ name: "asc" }, { code: "asc" }] });
    return locations.map(toRecord);
  }
}
