import type { Prisma } from "@prisma/client";
import type {
  CreateLocationInput,
  LocationWriteRepository,
  UpdateLocationDetailsInput,
} from "@/platform/organization/location-repository";
import type { Address, LocationRecord, LocationStatus } from "@/platform/organization/location";

export type PrismaLocationWriteClient = Pick<Prisma.TransactionClient, "location">;

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

/**
 * Write-side adapter, used only inside a Location write transaction. Tenant
 * scoping is on every query's where clause. There is no id/code mutation and
 * no delete by design.
 */
export class PrismaLocationWriteRepository implements LocationWriteRepository {
  constructor(private readonly prisma: PrismaLocationWriteClient) {}

  async findById(tenantId: string, id: string): Promise<LocationRecord | undefined> {
    const location = await this.prisma.location.findFirst({ where: { tenantId, id } });
    return location ? toRecord(location) : undefined;
  }

  async findByCode(tenantId: string, code: string): Promise<LocationRecord | undefined> {
    const location = await this.prisma.location.findUnique({ where: { tenantId_code: { tenantId, code } } });
    return location ? toRecord(location) : undefined;
  }

  async create(input: CreateLocationInput): Promise<LocationRecord> {
    const location = await this.prisma.location.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        name: input.name,
        addressLine1: input.address.line1,
        addressLine2: input.address.line2 ?? null,
        city: input.address.city,
        region: input.address.region ?? null,
        postalCode: input.address.postalCode ?? null,
        countryCode: input.countryCode,
        timezone: input.timezone,
        createdBy: input.createdBy,
      },
    });
    return toRecord(location);
  }

  async updateDetails(input: UpdateLocationDetailsInput): Promise<LocationRecord> {
    const updated = await this.prisma.location.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.id } },
      data: {
        name: input.name,
        addressLine1: input.address.line1,
        addressLine2: input.address.line2 ?? null,
        city: input.address.city,
        region: input.address.region ?? null,
        postalCode: input.address.postalCode ?? null,
        countryCode: input.countryCode,
        timezone: input.timezone,
      },
    });
    return toRecord(updated);
  }

  async archive(tenantId: string, id: string): Promise<LocationRecord> {
    const updated = await this.prisma.location.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return toRecord(updated);
  }
}
