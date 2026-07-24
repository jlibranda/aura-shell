import type { Prisma, PrismaClient } from "@prisma/client";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord, ConfigurationVersionStatus } from "@/platform/configuration/configuration-version";

export type PrismaConfigurationReadClient = Pick<PrismaClient, "configurationDefinition" | "configurationVersion">;

function requireSettingsView(context: TenantContext): void {
  if (!hasPermission(context, "settings.view")) throw new AuthorizationError();
}

function toDefinition(value: { id: string; tenantId: string; type: string; code: string; name: string; description: string | null; scopeRef: string; createdAt: Date; createdBy: string }): ConfigurationDefinitionRecord {
  return Object.freeze({
    id: value.id, tenantId: value.tenantId, type: value.type, code: value.code, name: value.name,
    ...(value.description ? { description: value.description } : {}),
    scopeType: "TENANT" as const, scopeRef: value.scopeRef,
    createdAt: value.createdAt.toISOString(), createdBy: value.createdBy,
  });
}

function toVersion(value: {
  id: string; definitionId: string; tenantId: string; versionNumber: number; status: string;
  effectiveFrom: Date | null; effectiveUntil: Date | null; payload: Prisma.JsonValue; schemaVersion: number;
  changeReason: string | null; createdAt: Date; createdBy: string; updatedAt: Date;
  publishedAt: Date | null; publishedBy: string | null; retiredAt: Date | null;
}): ConfigurationVersionRecord {
  return Object.freeze({
    id: value.id, definitionId: value.definitionId, tenantId: value.tenantId, versionNumber: value.versionNumber,
    status: value.status as ConfigurationVersionStatus,
    ...(value.effectiveFrom ? { effectiveFrom: value.effectiveFrom.toISOString() } : {}),
    ...(value.effectiveUntil ? { effectiveUntil: value.effectiveUntil.toISOString() } : {}),
    payload: value.payload as Readonly<Record<string, unknown>>,
    schemaVersion: value.schemaVersion,
    ...(value.changeReason ? { changeReason: value.changeReason } : {}),
    createdAt: value.createdAt.toISOString(), createdBy: value.createdBy, updatedAt: value.updatedAt.toISOString(),
    ...(value.publishedAt ? { publishedAt: value.publishedAt.toISOString() } : {}),
    ...(value.publishedBy ? { publishedBy: value.publishedBy } : {}),
    ...(value.retiredAt ? { retiredAt: value.retiredAt.toISOString() } : {}),
  });
}

/** Read-only, tenant-scoped. Every method requires settings.view. */
export class PrismaConfigurationReadRepository implements ConfigurationReadRepository {
  constructor(private readonly prisma: PrismaConfigurationReadClient) {}

  async findDefinitionByCode(context: TenantContext, code: string): Promise<ConfigurationDefinitionRecord | undefined> {
    requireSettingsView(context);
    const definition = await this.prisma.configurationDefinition.findUnique({ where: { tenantId_code: { tenantId: context.tenantId, code } } });
    return definition ? toDefinition(definition) : undefined;
  }

  async listVersions(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord[]> {
    requireSettingsView(context);
    const versions = await this.prisma.configurationVersion.findMany({ where: { tenantId: context.tenantId, definitionId }, orderBy: { versionNumber: "desc" } });
    return versions.map(toVersion);
  }

  async getVersionById(context: TenantContext, versionId: string): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const version = await this.prisma.configurationVersion.findFirst({ where: { tenantId: context.tenantId, id: versionId } });
    return version ? toVersion(version) : undefined;
  }

  async getDraftVersion(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const version = await this.prisma.configurationVersion.findFirst({ where: { tenantId: context.tenantId, definitionId, status: "DRAFT" } });
    return version ? toVersion(version) : undefined;
  }

  async getEffectiveVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const version = await this.prisma.configurationVersion.findFirst({
      where: {
        tenantId: context.tenantId,
        definitionId,
        status: "PUBLISHED",
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return version ? toVersion(version) : undefined;
  }

  async getNextScheduledVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const version = await this.prisma.configurationVersion.findFirst({
      where: { tenantId: context.tenantId, definitionId, status: "PUBLISHED", effectiveFrom: { gt: asOf } },
      orderBy: { effectiveFrom: "asc" },
    });
    return version ? toVersion(version) : undefined;
  }
}
