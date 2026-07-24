import type { Prisma } from "@prisma/client";
import type {
  CreateOrgUnitInput,
  MoveOrgUnitInput,
  OrgUnitWriteRepository,
  RenameOrgUnitInput,
} from "@/platform/organization/org-unit-repository";
import type { OrgUnitKind, OrgUnitRecord, OrgUnitStatus } from "@/platform/organization/org-unit";

export type PrismaOrgUnitWriteClient = Pick<Prisma.TransactionClient, "orgUnit">;

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

/**
 * Write-side adapter, used only inside an OrgUnit write transaction. Tenant
 * scoping is on every query's where clause. There is no id/code mutation and
 * no delete by design (ADR-012 §12).
 */
export class PrismaOrgUnitWriteRepository implements OrgUnitWriteRepository {
  constructor(private readonly prisma: PrismaOrgUnitWriteClient) {}

  async findById(tenantId: string, id: string): Promise<OrgUnitRecord | undefined> {
    const unit = await this.prisma.orgUnit.findFirst({ where: { tenantId, id } });
    return unit ? toRecord(unit) : undefined;
  }

  async findByCode(tenantId: string, code: string): Promise<OrgUnitRecord | undefined> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { tenantId_code: { tenantId, code } } });
    return unit ? toRecord(unit) : undefined;
  }

  async listAll(tenantId: string): Promise<OrgUnitRecord[]> {
    const units = await this.prisma.orgUnit.findMany({ where: { tenantId } });
    return units.map(toRecord);
  }

  async create(input: CreateOrgUnitInput): Promise<OrgUnitRecord> {
    const unit = await this.prisma.orgUnit.create({
      data: { tenantId: input.tenantId, code: input.code, name: input.name, kind: input.kind, parentId: input.parentId ?? null, createdBy: input.createdBy },
    });
    return toRecord(unit);
  }

  async rename(input: RenameOrgUnitInput): Promise<OrgUnitRecord> {
    const updated = await this.prisma.orgUnit.update({ where: { tenantId_id: { tenantId: input.tenantId, id: input.id } }, data: { name: input.name } });
    return toRecord(updated);
  }

  async move(input: MoveOrgUnitInput): Promise<OrgUnitRecord> {
    const updated = await this.prisma.orgUnit.update({ where: { tenantId_id: { tenantId: input.tenantId, id: input.id } }, data: { parentId: input.parentId } });
    return toRecord(updated);
  }

  async archive(tenantId: string, id: string): Promise<OrgUnitRecord> {
    const updated = await this.prisma.orgUnit.update({ where: { tenantId_id: { tenantId, id } }, data: { status: "ARCHIVED" } });
    return toRecord(updated);
  }
}
