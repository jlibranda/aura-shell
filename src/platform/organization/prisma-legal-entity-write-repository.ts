import type { Prisma } from "@prisma/client";
import type {
  CreateLegalEntityInput,
  LegalEntityWriteRepository,
  UpdateLegalEntityDetailsInput,
} from "@/platform/organization/legal-entity-repository";
import type { LegalEntityRecord, LegalEntityStatus } from "@/platform/organization/legal-entity";

export type PrismaLegalEntityWriteClient = Pick<Prisma.TransactionClient, "legalEntity">;

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

/**
 * Write-side adapter, used only inside a Legal Entity write transaction.
 * Tenant scoping is on every query's where clause. There is no id/code
 * mutation and no delete by design.
 */
export class PrismaLegalEntityWriteRepository implements LegalEntityWriteRepository {
  constructor(private readonly prisma: PrismaLegalEntityWriteClient) {}

  async findById(tenantId: string, id: string): Promise<LegalEntityRecord | undefined> {
    const entity = await this.prisma.legalEntity.findFirst({ where: { tenantId, id } });
    return entity ? toRecord(entity) : undefined;
  }

  async findByCode(tenantId: string, code: string): Promise<LegalEntityRecord | undefined> {
    const entity = await this.prisma.legalEntity.findUnique({ where: { tenantId_code: { tenantId, code } } });
    return entity ? toRecord(entity) : undefined;
  }

  async create(input: CreateLegalEntityInput): Promise<LegalEntityRecord> {
    const entity = await this.prisma.legalEntity.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        legalName: input.legalName,
        countryCode: input.countryCode,
        createdBy: input.createdBy,
      },
    });
    return toRecord(entity);
  }

  async updateDetails(input: UpdateLegalEntityDetailsInput): Promise<LegalEntityRecord> {
    const updated = await this.prisma.legalEntity.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.id } },
      data: { legalName: input.legalName, countryCode: input.countryCode },
    });
    return toRecord(updated);
  }

  async archive(tenantId: string, id: string): Promise<LegalEntityRecord> {
    const updated = await this.prisma.legalEntity.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return toRecord(updated);
  }
}
