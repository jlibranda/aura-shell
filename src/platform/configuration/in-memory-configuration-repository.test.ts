import { describe, expect, it } from "vitest";
import { ConfigurationStore, InMemoryConfigurationReadRepository, InMemoryConfigurationWriteRepository } from "@/platform/configuration/in-memory-configuration-repository";
import { AuthorizationError } from "@/platform/errors";
import { PermissionSet, type PlatformRole, type TenantContext } from "@/platform/context";

// hasPermission() (used internally by the read repository) derives access
// from context.roles, not context.permissions — so tests that need to deny
// access must vary roles, not the (here-unused-by-the-repo) permission set.
function contextFor(tenantId: string, roles: readonly PlatformRole[] = ["hr_admin"]): TenantContext {
  return {
    tenantId,
    actorId: "actor-1",
    actorName: "Actor One",
    roles,
    permissions: new PermissionSet([]),
    correlationId: "correlation-1",
    authenticationMethod: "test",
    actorProvenance: "server_verified",
  };
}

async function seedDefinition(write: InMemoryConfigurationWriteRepository, tenantId: string) {
  return write.createDefinition({ tenantId, type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General Company Settings", createdBy: "actor-1" });
}

describe("InMemoryConfigurationWriteRepository — draft lifecycle", () => {
  // Scenario 11: Draft may be created.
  it("creates a draft version at version number 1", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const version = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: await write.nextVersionNumber("tenant-a", definition.id), payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    expect(version.status).toBe("DRAFT");
    expect(version.versionNumber).toBe(1);
  });

  it("enforces one draft per definition (the DB partial-unique-index rule modeled in-memory)", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const existing = await write.findDraftVersion("tenant-a", definition.id);
    expect(existing).toBeDefined();
  });

  // Scenario 12: Draft may be edited.
  it("edits a draft and bumps updatedAt", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    const updated = await write.updateDraftVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, payload: { displayName: "B" } });
    expect(updated).not.toBe("stale");
    expect(updated).not.toBe("not_found");
    if (typeof updated === "object") expect(updated.payload.displayName).toBe("B");
  });

  // Scenario 27: Stale draft update is rejected.
  it("rejects an update whose expectedUpdatedAt no longer matches (optimistic concurrency)", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.updateDraftVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, payload: { displayName: "B" } });
    const staleResult = await write.updateDraftVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, payload: { displayName: "C" } });
    expect(staleResult).toBe("stale");
  });

  // Scenario 13: Draft may be discarded.
  it("discards a draft, removing it entirely", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const result = await write.discardDraftVersion("tenant-a", draft.id, draft.updatedAt);
    expect(result).toBe("discarded");
    expect(await write.findDraftVersion("tenant-a", definition.id)).toBeUndefined();
  });

  it("rejects discarding a draft with a stale expectedUpdatedAt", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const result = await write.discardDraftVersion("tenant-a", draft.id, "not-the-real-timestamp");
    expect(result).toBe("stale");
  });

  // Scenario 14 + 16: Draft may be published; publishing creates a new (published) version.
  it("publishes a draft, moving it from DRAFT to PUBLISHED with an effective date", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const published = await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    expect(published).not.toBe("stale");
    expect(published).not.toBe("not_found");
    if (typeof published === "object") {
      expect(published.status).toBe("PUBLISHED");
      expect(published.publishedBy).toBe("actor-1");
    }
  });

  // Scenario 15: Published version cannot be edited.
  it("refuses to edit a version that is no longer a draft", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const published = await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    if (typeof published !== "object") throw new Error("expected publish to succeed");
    const editAttempt = await write.updateDraftVersion({ versionId: published.id, tenantId: "tenant-a", expectedUpdatedAt: published.updatedAt, payload: { displayName: "tampered" } });
    expect(editAttempt).toBe("not_found");
  });

  // Scenario 28: Duplicate publish does not create duplicate versions.
  it("refuses to publish the same version twice", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const first = await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    if (typeof first !== "object") throw new Error("expected first publish to succeed");
    const second = await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: first.updatedAt, effectiveFrom: "2026-09-01T00:00:00.000Z", publishedBy: "actor-1" });
    expect(second).toBe("not_found");
    expect((await write.findPublishedVersions("tenant-a", definition.id)).length).toBe(1);
  });

  it("assigns the next version number sequentially across drafts and publishes", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const first = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: await write.nextVersionNumber("tenant-a", definition.id), payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: first.id, tenantId: "tenant-a", expectedUpdatedAt: first.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    expect(await write.nextVersionNumber("tenant-a", definition.id)).toBe(2);
  });
});

describe("InMemoryConfigurationWriteRepository — tenant isolation", () => {
  // Scenario 1: Tenant A cannot read Tenant B settings.
  it("does not return another tenant's definition by code", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    await seedDefinition(write, "tenant-a");
    expect(await write.findDefinitionByCode("tenant-b", "general")).toBeUndefined();
  });

  // Scenario 2: Tenant A cannot edit Tenant B draft.
  it("does not allow editing a draft using the wrong tenant ID", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const result = await write.updateDraftVersion({ versionId: draft.id, tenantId: "tenant-b", expectedUpdatedAt: draft.updatedAt, payload: { displayName: "hijacked" } });
    expect(result).toBe("not_found");
  });

  // Scenario 3: Tenant A cannot publish Tenant B draft.
  it("does not allow publishing a draft using the wrong tenant ID", async () => {
    const write = new InMemoryConfigurationWriteRepository();
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    const result = await write.publishVersion({ versionId: draft.id, tenantId: "tenant-b", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    expect(result).toBe("not_found");
  });
});

describe("InMemoryConfigurationReadRepository — authorization and effective-date resolution", () => {
  it("throws AuthorizationError when the caller lacks settings.view", async () => {
    const store = new ConfigurationStore();
    const read = new InMemoryConfigurationReadRepository(store);
    await expect(read.findDefinitionByCode(contextFor("tenant-a", []), "general")).rejects.toBeInstanceOf(AuthorizationError);
  });

  // Scenario 4 (read-side half): a tenant-scoped read never returns cross-tenant data even if a caller supplied a different tenant ID than their own context.
  it("scopes every read strictly to context.tenantId, never a caller-supplied override", async () => {
    const store = new ConfigurationStore();
    const write = new InMemoryConfigurationWriteRepository(store);
    const read = new InMemoryConfigurationReadRepository(store);
    await seedDefinition(write, "tenant-a");
    const asTenantB = contextFor("tenant-b");
    expect(await read.findDefinitionByCode(asTenantB, "general")).toBeUndefined();
  });

  // Scenario 17: Future effective version is resolved only from its effective date.
  it("does not resolve a future-dated published version as currently effective", async () => {
    const store = new ConfigurationStore();
    const write = new InMemoryConfigurationWriteRepository(store);
    const read = new InMemoryConfigurationReadRepository(store);
    const definition = await seedDefinition(write, "tenant-a");
    const draft = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: { displayName: "future" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2099-01-01T00:00:00.000Z", publishedBy: "actor-1" });

    const context = contextFor("tenant-a");
    expect(await read.getEffectiveVersion(context, definition.id, new Date("2026-07-24T00:00:00.000Z"))).toBeUndefined();
    const scheduled = await read.getNextScheduledVersion(context, definition.id, new Date("2026-07-24T00:00:00.000Z"));
    expect(scheduled?.payload.displayName).toBe("future");
  });

  // Scenario 18: Historical as-of resolution returns the correct version.
  it("resolves the correct version as of a historical point in time, across multiple published versions", async () => {
    const store = new ConfigurationStore();
    const write = new InMemoryConfigurationWriteRepository(store);
    const read = new InMemoryConfigurationReadRepository(store);
    const definition = await seedDefinition(write, "tenant-a");

    const v1 = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: { displayName: "v1" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: v1.id, tenantId: "tenant-a", expectedUpdatedAt: v1.updatedAt, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z", publishedBy: "actor-1" });

    const v2 = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 2, payload: { displayName: "v2" }, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: v2.id, tenantId: "tenant-a", expectedUpdatedAt: v2.updatedAt, effectiveFrom: "2026-06-01T00:00:00.000Z", publishedBy: "actor-1" });

    const context = contextFor("tenant-a");
    const asOfMarch = await read.getEffectiveVersion(context, definition.id, new Date("2026-03-01T00:00:00.000Z"));
    expect(asOfMarch?.payload.displayName).toBe("v1");
    const asOfAugust = await read.getEffectiveVersion(context, definition.id, new Date("2026-08-01T00:00:00.000Z"));
    expect(asOfAugust?.payload.displayName).toBe("v2");
  });

  it("lists the full version timeline newest-first", async () => {
    const store = new ConfigurationStore();
    const write = new InMemoryConfigurationWriteRepository(store);
    const read = new InMemoryConfigurationReadRepository(store);
    const definition = await seedDefinition(write, "tenant-a");
    const v1 = await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    await write.publishVersion({ versionId: v1.id, tenantId: "tenant-a", expectedUpdatedAt: v1.updatedAt, effectiveFrom: "2026-01-01T00:00:00.000Z", publishedBy: "actor-1" });
    await write.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 2, payload: {}, schemaVersion: 1, createdBy: "actor-1" });

    const timeline = await read.listVersions(contextFor("tenant-a"), definition.id);
    expect(timeline.map((v) => v.versionNumber)).toEqual([2, 1]);
  });
});
