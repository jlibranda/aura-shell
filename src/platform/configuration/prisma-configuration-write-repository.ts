import type { Prisma } from "@prisma/client";
import type {
  ConfigurationWriteRepository,
  CreateDefinitionInput,
  CreateDraftVersionInput,
  PublishVersionInput,
  UpdateDraftVersionInput,
} from "@/platform/configuration/configuration-repository";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord, ConfigurationVersionStatus } from "@/platform/configuration/configuration-version";

export type PrismaConfigurationWriteClient = Pick<Prisma.TransactionClient, "configurationDefinition" | "configurationVersion">;

function toDefinition(value: { id: string; tenantId: string; type: string; code: string; name: string; description: string | null; scopeType: string; scopeRef: string; createdAt: Date; createdBy: string }): ConfigurationDefinitionRecord {
  return Object.freeze({
    id: value.id,
    tenantId: value.tenantId,
    type: value.type,
    code: value.code,
    name: value.name,
    ...(value.description ? { description: value.description } : {}),
    scopeType: "TENANT" as const,
    scopeRef: value.scopeRef,
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
  });
}

function toVersion(value: {
  id: string; definitionId: string; tenantId: string; versionNumber: number; status: string;
  effectiveFrom: Date | null; effectiveUntil: Date | null; payload: Prisma.JsonValue; schemaVersion: number;
  changeReason: string | null; createdAt: Date; createdBy: string; updatedAt: Date;
  publishedAt: Date | null; publishedBy: string | null; retiredAt: Date | null;
}): ConfigurationVersionRecord {
  return Object.freeze({
    id: value.id,
    definitionId: value.definitionId,
    tenantId: value.tenantId,
    versionNumber: value.versionNumber,
    status: value.status as ConfigurationVersionStatus,
    ...(value.effectiveFrom ? { effectiveFrom: value.effectiveFrom.toISOString() } : {}),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    payload: value.payload as Readonly<Record<string, unknown>>,
    schemaVersion: value.schemaVersion,
    ...(value.changeReason ? { changeReason: value.changeReason } : {}),
    createdAt: value.createdAt.toISOString(),
    createdBy: value.createdBy,
    updatedAt: value.updatedAt.toISOString(),
    ...(value.publishedAt ? { publishedAt: value.publishedAt.toISOString() } : {}),
    ...(value.publishedBy ? { publishedBy: value.publishedBy } : {}),
    ...(value.retiredAt ? { retiredAt: value.retiredAt.toISOString() } : {}),
  });
}

/**
 * Write-side adapter used only inside a ConfigurationUnitOfWork transaction.
 * Tenant scoping is enforced on every query's where clause; optimistic
 * concurrency is enforced by including expectedUpdatedAt in the update
 * predicate itself (an update that matches zero rows means "stale").
 */
export class PrismaConfigurationWriteRepository implements ConfigurationWriteRepository {
  constructor(private readonly prisma: PrismaConfigurationWriteClient) {}

  async findDefinitionByCode(tenantId: string, code: string): Promise<ConfigurationDefinitionRecord | undefined> {
    const definition = await this.prisma.configurationDefinition.findUnique({ where: { tenantId_code: { tenantId, code } } });
    return definition ? toDefinition(definition) : undefined;
  }

  async createDefinition(input: CreateDefinitionInput): Promise<ConfigurationDefinitionRecord> {
    const definition = await this.prisma.configurationDefinition.create({
      data: { tenantId: input.tenantId, type: input.type, code: input.code, name: input.name, description: input.description, scopeRef: input.tenantId, createdBy: input.createdBy },
    });
    return toDefinition(definition);
  }

  async findDraftVersion(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord | undefined> {
    const version = await this.prisma.configurationVersion.findFirst({ where: { tenantId, definitionId, status: "DRAFT" } });
    return version ? toVersion(version) : undefined;
  }

  async getVersionById(tenantId: string, versionId: string): Promise<ConfigurationVersionRecord | undefined> {
    const version = await this.prisma.configurationVersion.findFirst({ where: { tenantId, id: versionId } });
    return version ? toVersion(version) : undefined;
  }

  async createDraftVersion(input: CreateDraftVersionInput): Promise<ConfigurationVersionRecord> {
    const version = await this.prisma.configurationVersion.create({
      data: {
        definitionId: input.definitionId,
        tenantId: input.tenantId,
        versionNumber: input.versionNumber,
        status: "DRAFT",
        payload: input.payload as Prisma.InputJsonValue,
        schemaVersion: input.schemaVersion,
        changeReason: input.changeReason,
        createdBy: input.createdBy,
      },
    });
    return toVersion(version);
  }

  async updateDraftVersion(input: UpdateDraftVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    const existing = await this.prisma.configurationVersion.findFirst({ where: { tenantId: input.tenantId, id: input.versionId } });
    if (!existing || existing.status !== "DRAFT") return "not_found";
    const result = await this.prisma.configurationVersion.updateMany({
      where: { id: input.versionId, tenantId: input.tenantId, status: "DRAFT", updatedAt: new Date(input.expectedUpdatedAt) },
      data: { payload: input.payload as Prisma.InputJsonValue, changeReason: input.changeReason },
    });
    if (result.count === 0) return "stale";
    const updated = await this.prisma.configurationVersion.findFirstOrThrow({ where: { id: input.versionId, tenantId: input.tenantId } });
    return toVersion(updated);
  }

  async discardDraftVersion(tenantId: string, versionId: string, expectedUpdatedAt: string): Promise<"discarded" | "stale" | "not_found"> {
    const existing = await this.prisma.configurationVersion.findFirst({ where: { tenantId, id: versionId } });
    if (!existing || existing.status !== "DRAFT") return "not_found";
    if (existing.updatedAt.toISOString() !== expectedUpdatedAt) return "stale";
    await this.prisma.configurationVersion.delete({ where: { id: versionId } });
    return "discarded";
  }

  async findPublishedVersions(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord[]> {
    const versions = await this.prisma.configurationVersion.findMany({ where: { tenantId, definitionId, status: "PUBLISHED" }, orderBy: { versionNumber: "desc" } });
    return versions.map(toVersion);
  }

  async publishVersion(input: PublishVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    const existing = await this.prisma.configurationVersion.findFirst({ where: { tenantId: input.tenantId, id: input.versionId } });
    if (!existing || existing.status !== "DRAFT") return "not_found";
    const result = await this.prisma.configurationVersion.updateMany({
      where: { id: input.versionId, tenantId: input.tenantId, status: "DRAFT", updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        status: "PUBLISHED",
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        publishedAt: new Date(),
        publishedBy: input.publishedBy,
      },
    });
    if (result.count === 0) return "stale";
    const published = await this.prisma.configurationVersion.findFirstOrThrow({ where: { id: input.versionId, tenantId: input.tenantId } });
    return toVersion(published);
  }

  async retireVersion(tenantId: string, versionId: string): Promise<void> {
    await this.prisma.configurationVersion.updateMany({ where: { id: versionId, tenantId, status: "PUBLISHED" }, data: { status: "RETIRED", retiredAt: new Date() } });
  }

  async nextVersionNumber(tenantId: string, definitionId: string): Promise<number> {
    const latest = await this.prisma.configurationVersion.findFirst({ where: { tenantId, definitionId }, orderBy: { versionNumber: "desc" } });
    return (latest?.versionNumber ?? 0) + 1;
  }
}
