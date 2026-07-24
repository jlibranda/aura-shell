import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  ConfigurationReadRepository,
  ConfigurationWriteRepository,
  CreateDefinitionInput,
  CreateDraftVersionInput,
  PublishVersionInput,
  UpdateDraftVersionInput,
} from "@/platform/configuration/configuration-repository";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";

function requireSettingsView(context: TenantContext): void {
  if (!hasPermission(context, "settings.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class ConfigurationStore {
  readonly definitions: ConfigurationDefinitionRecord[] = [];
  readonly versions: ConfigurationVersionRecord[] = [];
}

export class InMemoryConfigurationWriteRepository implements ConfigurationWriteRepository {
  constructor(private readonly store: ConfigurationStore = new ConfigurationStore()) {}

  async findDefinitionByCode(tenantId: string, code: string): Promise<ConfigurationDefinitionRecord | undefined> {
    return this.store.definitions.find((d) => d.tenantId === tenantId && d.code === code);
  }

  async createDefinition(input: CreateDefinitionInput): Promise<ConfigurationDefinitionRecord> {
    const definition: ConfigurationDefinitionRecord = Object.freeze({
      id: randomUUID(), tenantId: input.tenantId, type: input.type, code: input.code, name: input.name,
      ...(input.description ? { description: input.description } : {}),
      scopeType: "TENANT", scopeRef: input.tenantId,
      createdAt: new Date().toISOString(), createdBy: input.createdBy,
    });
    this.store.definitions.push(definition);
    return definition;
  }

  async findDraftVersion(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord | undefined> {
    return this.store.versions.find((v) => v.tenantId === tenantId && v.definitionId === definitionId && v.status === "DRAFT");
  }

  async getVersionById(tenantId: string, versionId: string): Promise<ConfigurationVersionRecord | undefined> {
    return this.store.versions.find((v) => v.tenantId === tenantId && v.id === versionId);
  }

  async createDraftVersion(input: CreateDraftVersionInput): Promise<ConfigurationVersionRecord> {
    const now = new Date().toISOString();
    const version: ConfigurationVersionRecord = Object.freeze({
      id: randomUUID(), definitionId: input.definitionId, tenantId: input.tenantId, versionNumber: input.versionNumber,
      status: "DRAFT", payload: Object.freeze({ ...input.payload }), schemaVersion: input.schemaVersion,
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
      createdAt: now, createdBy: input.createdBy, updatedAt: now,
    });
    this.store.versions.push(version);
    return version;
  }

  async updateDraftVersion(input: UpdateDraftVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    const index = this.store.versions.findIndex((v) => v.tenantId === input.tenantId && v.id === input.versionId);
    if (index === -1 || this.store.versions[index].status !== "DRAFT") return "not_found";
    if (this.store.versions[index].updatedAt !== input.expectedUpdatedAt) return "stale";
    const updated: ConfigurationVersionRecord = Object.freeze({
      ...this.store.versions[index],
      payload: Object.freeze({ ...input.payload }),
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
      updatedAt: new Date(Date.now() + 1).toISOString(),
    });
    this.store.versions[index] = updated;
    return updated;
  }

  async discardDraftVersion(tenantId: string, versionId: string, expectedUpdatedAt: string): Promise<"discarded" | "stale" | "not_found"> {
    const index = this.store.versions.findIndex((v) => v.tenantId === tenantId && v.id === versionId);
    if (index === -1 || this.store.versions[index].status !== "DRAFT") return "not_found";
    if (this.store.versions[index].updatedAt !== expectedUpdatedAt) return "stale";
    this.store.versions.splice(index, 1);
    return "discarded";
  }

  async findPublishedVersions(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord[]> {
    return this.store.versions
      .filter((v) => v.tenantId === tenantId && v.definitionId === definitionId && v.status === "PUBLISHED")
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async publishVersion(input: PublishVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    const index = this.store.versions.findIndex((v) => v.tenantId === input.tenantId && v.id === input.versionId);
    if (index === -1 || this.store.versions[index].status !== "DRAFT") return "not_found";
    if (this.store.versions[index].updatedAt !== input.expectedUpdatedAt) return "stale";
    const published: ConfigurationVersionRecord = Object.freeze({
      ...this.store.versions[index],
      status: "PUBLISHED",
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
      publishedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      updatedAt: new Date(Date.now() + 1).toISOString(),
    });
    this.store.versions[index] = published;
    return published;
  }

  async retireVersion(tenantId: string, versionId: string): Promise<void> {
    const index = this.store.versions.findIndex((v) => v.tenantId === tenantId && v.id === versionId && v.status === "PUBLISHED");
    if (index === -1) return;
    this.store.versions[index] = Object.freeze({ ...this.store.versions[index], status: "RETIRED", retiredAt: new Date().toISOString() });
  }

  async nextVersionNumber(tenantId: string, definitionId: string): Promise<number> {
    const numbers = this.store.versions.filter((v) => v.tenantId === tenantId && v.definitionId === definitionId).map((v) => v.versionNumber);
    return (numbers.length ? Math.max(...numbers) : 0) + 1;
  }
}

export class InMemoryConfigurationReadRepository implements ConfigurationReadRepository {
  constructor(private readonly store: ConfigurationStore) {}

  async findDefinitionByCode(context: TenantContext, code: string): Promise<ConfigurationDefinitionRecord | undefined> {
    requireSettingsView(context);
    return this.store.definitions.find((d) => d.tenantId === context.tenantId && d.code === code);
  }

  async listVersions(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord[]> {
    requireSettingsView(context);
    return this.store.versions
      .filter((v) => v.tenantId === context.tenantId && v.definitionId === definitionId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async getVersionById(context: TenantContext, versionId: string): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    return this.store.versions.find((v) => v.tenantId === context.tenantId && v.id === versionId);
  }

  async getDraftVersion(context: TenantContext, definitionId: string): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    return this.store.versions.find((v) => v.tenantId === context.tenantId && v.definitionId === definitionId && v.status === "DRAFT");
  }

  async getEffectiveVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const candidates = this.store.versions.filter((v) =>
      v.tenantId === context.tenantId &&
      v.definitionId === definitionId &&
      v.status === "PUBLISHED" &&
      v.effectiveFrom && new Date(v.effectiveFrom).getTime() <= asOf.getTime() &&
      (!v.effectiveUntil || new Date(v.effectiveUntil).getTime() > asOf.getTime()),
    );
    candidates.sort((a, b) => new Date(b.effectiveFrom!).getTime() - new Date(a.effectiveFrom!).getTime());
    return candidates[0];
  }

  async getNextScheduledVersion(context: TenantContext, definitionId: string, asOf: Date): Promise<ConfigurationVersionRecord | undefined> {
    requireSettingsView(context);
    const candidates = this.store.versions.filter((v) =>
      v.tenantId === context.tenantId &&
      v.definitionId === definitionId &&
      v.status === "PUBLISHED" &&
      v.effectiveFrom && new Date(v.effectiveFrom).getTime() > asOf.getTime(),
    );
    candidates.sort((a, b) => new Date(a.effectiveFrom!).getTime() - new Date(b.effectiveFrom!).getTime());
    return candidates[0];
  }
}
