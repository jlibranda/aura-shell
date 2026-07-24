import { describe, expect, it } from "vitest";
import { PermissionSet, type Permission, type PlatformRole, type TenantContext } from "@/platform/context";
import { ConfigurationStore, InMemoryConfigurationReadRepository, InMemoryConfigurationWriteRepository } from "@/platform/configuration/in-memory-configuration-repository";
import { describeConfigurationCategories } from "@/platform/configuration/registry/configuration-registry-service";
import type { ConfigurationCategoryManifestEntry } from "@/platform/configuration/registry/configuration-manifest";
import { GENERAL_COMPANY_SETTINGS_CODE, GENERAL_COMPANY_SETTINGS_TYPE } from "@/platform/configuration/general-company-settings";

function contextFor(tenantId: string, roles: readonly PlatformRole[] = ["hr_admin"], permissions: readonly Permission[] = []): TenantContext {
  return { tenantId, actorId: "actor-1", actorName: "Actor One", roles, permissions: new PermissionSet(permissions), correlationId: "corr-1", authenticationMethod: "test", actorProvenance: "server_verified" };
}

const MANIFEST: readonly ConfigurationCategoryManifestEntry[] = [
  { key: "general", title: "General", description: "d", group: "company", order: 10, permission: "settings.view", owner: "P", status: "implemented", configurationType: GENERAL_COMPANY_SETTINGS_TYPE, route: "/settings/general", dependencies: [], consumers: [] },
  { key: "organization", title: "Organization", description: "d", group: "company", order: 20, permission: "settings.view", owner: "P", status: "coming_soon", dependencies: ["general"], consumers: [] },
  { key: "audit", title: "Audit", description: "d", group: "governance", order: 10, permission: "settings.audit.view", owner: "P", status: "implemented", route: "/settings/audit", dependencies: [], consumers: [] },
];

async function seedGeneral(store: ConfigurationStore, tenantId: string) {
  const write = new InMemoryConfigurationWriteRepository(store);
  const def = await write.createDefinition({ tenantId, type: GENERAL_COMPANY_SETTINGS_TYPE, code: GENERAL_COMPANY_SETTINGS_CODE, name: "General", createdBy: "actor-1" });
  return { write, def };
}

describe("describeConfigurationCategories — status derivation", () => {
  it("reports a not_configured status for an implemented category with no versions", async () => {
    const store = new ConfigurationStore();
    const reader = new InMemoryConfigurationReadRepository(store);
    const categories = await describeConfigurationCategories(contextFor("t1"), reader, MANIFEST);
    const general = categories.find((c) => c.key === "general")!;
    expect(general.status).toBe("not_configured");
    expect(general.hasDraft).toBe(false);
    expect(general.hasScheduledChange).toBe(false);
  });

  it("reports draft as an additive flag on a not_configured category (draft coexists, does not replace)", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "t1");
    await write.createDraftVersion({ definitionId: def.id, tenantId: "t1", versionNumber: 1, payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    const reader = new InMemoryConfigurationReadRepository(store);
    const general = (await describeConfigurationCategories(contextFor("t1"), reader, MANIFEST)).find((c) => c.key === "general")!;
    expect(general.status).toBe("not_configured");
    expect(general.hasDraft).toBe(true);
  });

  it("reports configured once an effective version is in force", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "t1");
    const draft = await write.createDraftVersion({ definitionId: def.id, tenantId: "t1", versionNumber: 1, payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: draft.id, tenantId: "t1", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2020-01-01T00:00:00.000Z", publishedBy: "actor-1" });
    const general = (await describeConfigurationCategories(contextFor("t1"), reader(store), MANIFEST)).find((c) => c.key === "general")!;
    expect(general.status).toBe("configured");
    expect(general.effectiveSince).toBe("2020-01-01T00:00:00.000Z");
  });

  it("reports a scheduled change as an additive flag without hiding the effective state", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "t1");
    const v1 = await write.createDraftVersion({ definitionId: def.id, tenantId: "t1", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: v1.id, tenantId: "t1", expectedUpdatedAt: v1.updatedAt, effectiveFrom: "2020-01-01T00:00:00.000Z", publishedBy: "actor-1" });
    const v2 = await write.createDraftVersion({ definitionId: def.id, tenantId: "t1", versionNumber: 2, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: v2.id, tenantId: "t1", expectedUpdatedAt: v2.updatedAt, effectiveFrom: "2999-01-01T00:00:00.000Z", publishedBy: "actor-1" });
    const general = (await describeConfigurationCategories(contextFor("t1"), reader(store), MANIFEST)).find((c) => c.key === "general")!;
    expect(general.status).toBe("configured");
    expect(general.hasScheduledChange).toBe(true);
    expect(general.scheduledFor).toBe("2999-01-01T00:00:00.000Z");
  });

  it("reports coming_soon for an unimplemented category and performs no state derivation", async () => {
    const org = (await describeConfigurationCategories(contextFor("t1"), reader(new ConfigurationStore()), MANIFEST)).find((c) => c.key === "organization")!;
    expect(org.status).toBe("coming_soon");
    expect(org.implemented).toBe(false);
    expect(org.route).toBeUndefined();
  });

  it("reports available for an implemented non-configuration surface (audit has no config type)", async () => {
    const audit = (await describeConfigurationCategories(contextFor("t1", ["hr_admin"]), reader(new ConfigurationStore()), MANIFEST)).find((c) => c.key === "audit")!;
    expect(audit.status).toBe("available");
    expect(audit.route).toBe("/settings/audit");
  });
});

describe("describeConfigurationCategories — permission visibility", () => {
  it("excludes categories the caller cannot view", async () => {
    // payroll role has settings.view but NOT settings.audit.view → audit hidden.
    const categories = await describeConfigurationCategories(contextFor("t1", ["payroll"]), reader(new ConfigurationStore()), MANIFEST);
    expect(categories.map((c) => c.key)).toContain("general");
    expect(categories.map((c) => c.key)).not.toContain("audit");
  });

  it("returns nothing for a caller with no settings permissions at all", async () => {
    const categories = await describeConfigurationCategories(contextFor("t1", ["employee"]), reader(new ConfigurationStore()), MANIFEST);
    expect(categories).toHaveLength(0);
  });

  it("shows the audit category to an auditor", async () => {
    const categories = await describeConfigurationCategories(contextFor("t1", ["auditor"]), reader(new ConfigurationStore()), MANIFEST);
    expect(categories.map((c) => c.key)).toContain("audit");
  });
});

describe("describeConfigurationCategories — tenant isolation", () => {
  it("does not observe another tenant's configured status", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: def.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2020-01-01T00:00:00.000Z", publishedBy: "actor-1" });

    const asA = (await describeConfigurationCategories(contextFor("tenant-a"), reader(store), MANIFEST)).find((c) => c.key === "general")!;
    const asB = (await describeConfigurationCategories(contextFor("tenant-b"), reader(store), MANIFEST)).find((c) => c.key === "general")!;
    expect(asA.status).toBe("configured");
    expect(asB.status).toBe("not_configured");
  });

  it("does not leak another tenant's draft or scheduled state", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "tenant-a");
    await write.createDraftVersion({ definitionId: def.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const asB = (await describeConfigurationCategories(contextFor("tenant-b"), reader(store), MANIFEST)).find((c) => c.key === "general")!;
    expect(asB.hasDraft).toBe(false);
    expect(asB.hasScheduledChange).toBe(false);
  });
});

describe("describeConfigurationCategories — ordering and payload safety", () => {
  it("returns categories in deterministic display order (group, then order)", async () => {
    const categories = await describeConfigurationCategories(contextFor("t1"), reader(new ConfigurationStore()), MANIFEST);
    expect(categories.map((c) => c.key)).toEqual(["general", "organization", "audit"]);
  });

  it("never exposes a configuration payload in the described category", async () => {
    const store = new ConfigurationStore();
    const { write, def } = await seedGeneral(store, "t1");
    const draft = await write.createDraftVersion({ definitionId: def.id, tenantId: "t1", versionNumber: 1, payload: { displayName: "Secret Co", companyCode: "SECRET" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: draft.id, tenantId: "t1", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2020-01-01T00:00:00.000Z", publishedBy: "actor-1" });
    const categories = await describeConfigurationCategories(contextFor("t1"), reader(store), MANIFEST);
    expect(JSON.stringify(categories)).not.toContain("Secret Co");
    expect(JSON.stringify(categories)).not.toContain("SECRET");
  });
});

function reader(store: ConfigurationStore): InMemoryConfigurationReadRepository {
  return new InMemoryConfigurationReadRepository(store);
}
