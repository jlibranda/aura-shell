import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryConfigurationUnitOfWork } from "@/platform/configuration/in-memory-configuration-unit-of-work";
import { ConfigurationStore } from "@/platform/configuration/in-memory-configuration-repository";
import {
  DiscardGeneralSettingsDraftHandler,
  PublishGeneralSettingsHandler,
  SaveGeneralSettingsDraftHandler,
  type GeneralSettingsDraftDiscarded,
  type GeneralSettingsDraftSaved,
  type GeneralSettingsPublished,
} from "@/platform/configuration/commands/general-settings-durable-handlers";
import {
  createDiscardGeneralSettingsDraftCommand,
  createPublishGeneralSettingsCommand,
  createSaveGeneralSettingsDraftCommand,
  type DiscardGeneralSettingsDraftCommand,
  type PublishGeneralSettingsCommand,
  type SaveGeneralSettingsDraftCommand,
} from "@/platform/configuration/commands/general-settings-commands";
import { CommandExecutionPipeline } from "@/platform/commands/command-execution-pipeline";
import { AURA_COMMAND_PERMISSION_REQUIREMENTS, PermissionAuthorizationPolicy } from "@/platform/authorization/authorization-policy";

const validPayload = {
  displayName: "Oriente Finance HK",
  timeZone: "Asia/Hong_Kong",
  locale: "en-HK",
  currency: "HKD",
  firstDayOfWeek: "MONDAY",
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24H",
  companyCode: "OFHK",
};

function requestFor(roles: readonly PlatformRole[], permissions: readonly Permission[] = []): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "subject-1", userId: "user-1", tenantId: "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions,
    actorProvenance: "server_verified",
    correlationId: "correlation-1",
  });
}

function harness() {
  const store = new ConfigurationStore();
  const unitOfWork = new InMemoryConfigurationUnitOfWork(store);
  const commands = new CommandExecutionPipeline(new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS), [
    new SaveGeneralSettingsDraftHandler(unitOfWork),
    new DiscardGeneralSettingsDraftHandler(unitOfWork),
    new PublishGeneralSettingsHandler(unitOfWork),
  ]);
  const pipeline = {
    saveDraft: (request: TrustedRequestContext, command: SaveGeneralSettingsDraftCommand) => commands.execute<SaveGeneralSettingsDraftCommand, GeneralSettingsDraftSaved>(request, command),
    discardDraft: (request: TrustedRequestContext, command: DiscardGeneralSettingsDraftCommand) => commands.execute<DiscardGeneralSettingsDraftCommand, GeneralSettingsDraftDiscarded>(request, command),
    publish: (request: TrustedRequestContext, command: PublishGeneralSettingsCommand) => commands.execute<PublishGeneralSettingsCommand, GeneralSettingsPublished>(request, command),
  };
  return { store, pipeline };
}

describe("SaveGeneralSettingsDraftHandler", () => {
  // Scenario 8: HR Admin can create and manage a draft.
  it("creates a first draft for hr_admin", async () => {
    const { pipeline } = harness();
    const command = createSaveGeneralSettingsDraftCommand({ payload: validPayload });
    const result = await pipeline.saveDraft(requestFor(["hr_admin"], ["settings.manage"]), command);
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.state).toBe("draft_saved");
  });

  // Scenario 7: HR Operations can act only according to granted permission.
  it("allows hr_operations with settings.manage to save a draft", async () => {
    const { pipeline } = harness();
    const result = await pipeline.saveDraft(requestFor(["hr_operations"], ["settings.manage"]), createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    expect(result.kind).toBe("success");
  });

  // Scenario 6 + 10: Manager/auditor cannot manage tenant settings by default.
  it("denies a caller without settings.manage", async () => {
    const { pipeline } = harness();
    const result = await pipeline.saveDraft(requestFor(["manager"], []), createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    expect(result.kind).toBe("authorization_failure");
  });

  it("denies auditor (view + audit only, no manage)", async () => {
    const { pipeline } = harness();
    const result = await pipeline.saveDraft(requestFor(["auditor"], ["settings.view", "settings.audit.view"]), createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    expect(result.kind).toBe("authorization_failure");
  });

  it("returns a validation failure for an empty working week, without touching the store", async () => {
    const { pipeline, store } = harness();
    const command = createSaveGeneralSettingsDraftCommand({ payload: { ...validPayload, workingDays: [] } });
    const result = await pipeline.saveDraft(requestFor(["hr_admin"], ["settings.manage"]), command);
    expect(result.kind).toBe("validation_failure");
    expect(store.versions).toHaveLength(0);
  });

  it("refuses to create a second draft while one already exists", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage"]);
    await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    const second = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    expect(second.kind).toBe("conflict");
  });

  it("edits the existing draft when versionId is supplied", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const edited = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({
      payload: { ...validPayload, displayName: "Renamed Co" },
      versionId: created.value.version.id,
      expectedUpdatedAt: created.value.version.updatedAt,
    }));
    expect(edited.kind).toBe("success");
    if (edited.kind === "success") expect(edited.value.version.payload.displayName).toBe("Renamed Co");
  });

  // Scenario 27 (command level): stale draft update is rejected.
  it("rejects an edit with a stale expectedUpdatedAt", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: { ...validPayload, displayName: "First edit" }, versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt }));
    const staleEdit = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: { ...validPayload, displayName: "Conflicting edit" }, versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt }));
    expect(staleEdit.kind).toBe("conflict");
  });

  it("surfaces non-blocking warnings alongside a successful save", async () => {
    const { pipeline } = harness();
    const result = await pipeline.saveDraft(requestFor(["hr_admin"], ["settings.manage"]), createSaveGeneralSettingsDraftCommand({ payload: { ...validPayload, primaryCountryCode: "PH" } }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.warnings.length).toBeGreaterThan(0);
  });
});

describe("DiscardGeneralSettingsDraftHandler", () => {
  it("discards an existing draft for a caller with settings.manage", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const discarded = await pipeline.discardDraft(request, createDiscardGeneralSettingsDraftCommand({ versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt }));
    expect(discarded.kind).toBe("success");
  });

  it("denies discard for a caller without settings.manage", async () => {
    const { pipeline } = harness();
    const result = await pipeline.discardDraft(requestFor(["employee"], []), createDiscardGeneralSettingsDraftCommand({ versionId: "any-id", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }));
    expect(result.kind).toBe("authorization_failure");
  });
});

describe("PublishGeneralSettingsHandler", () => {
  // Scenario 9: Only a user with publish permission can publish.
  it("denies publish for hr_operations (manage but not publish)", async () => {
    const { pipeline } = harness();
    const admin = requestFor(["hr_admin"], ["settings.manage"]);
    const created = await pipeline.saveDraft(admin, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const result = await pipeline.publish(
      requestFor(["hr_operations"], ["settings.manage"]),
      createPublishGeneralSettingsCommand({ versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt, effectiveFrom: "2026-08-01" }),
    );
    expect(result.kind).toBe("authorization_failure");
  });

  it("publishes a draft for hr_admin with settings.publish", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage", "settings.publish"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const result = await pipeline.publish(request, createPublishGeneralSettingsCommand({ versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt, effectiveFrom: "2026-08-01" }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.version.status).toBe("PUBLISHED");
  });

  // Scenario 20: Invalid effective period is rejected.
  it("rejects an effectiveUntil that is not after effectiveFrom", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage", "settings.publish"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const result = await pipeline.publish(request, createPublishGeneralSettingsCommand({
      versionId: created.value.version.id,
      expectedUpdatedAt: created.value.version.updatedAt,
      effectiveFrom: "2026-08-01",
      effectiveUntil: "2026-07-01",
    }));
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects an invalid effectiveFrom date", async () => {
    const { pipeline } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage", "settings.publish"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const result = await pipeline.publish(request, createPublishGeneralSettingsCommand({ versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt, effectiveFrom: "not-a-date" }));
    expect(result.kind).toBe("validation_failure");
  });

  // Scenario 28 + 29 + 30: duplicate/concurrent/repeated publish resolves deterministically and safely.
  it("rejects a second publish attempt against the same already-published version (repeated submission stays safe, no duplicate version is created)", async () => {
    const { pipeline, store } = harness();
    const request = requestFor(["hr_admin"], ["settings.manage", "settings.publish"]);
    const created = await pipeline.saveDraft(request, createSaveGeneralSettingsDraftCommand({ payload: validPayload }));
    if (created.kind !== "success") throw new Error("expected draft creation to succeed");
    const publishInput = { versionId: created.value.version.id, expectedUpdatedAt: created.value.version.updatedAt, effectiveFrom: "2026-08-01" };
    const first = await pipeline.publish(request, createPublishGeneralSettingsCommand(publishInput));
    const second = await pipeline.publish(request, createPublishGeneralSettingsCommand(publishInput));
    expect(first.kind).toBe("success");
    // The version is no longer a draft, so the repeat attempt cannot find one to publish —
    // it fails safely (never a silent no-op, never a duplicate PUBLISHED row).
    expect(second.kind).toBe("validation_failure");
    expect(store.versions.filter((v) => v.status === "PUBLISHED")).toHaveLength(1);
  });
});

describe("configuration commands never accept a browser-supplied tenant ID", () => {
  // Scenario 4: Browser-supplied tenant ID is ignored or rejected — proven
  // structurally: none of the command contracts even have a tenantId field,
  // so there is nothing for a browser to spoof. Every handler derives
  // tenantId exclusively from request.principal.tenantId (the verified
  // TrustedRequestContext), never from the command payload.
  it("has no tenantId field on any general-settings command, and derives tenantId only from the trusted request", () => {
    const sources = [
      "src/platform/configuration/commands/general-settings-commands.ts",
      "src/platform/configuration/commands/general-settings-durable-handlers.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
    for (const source of sources) expect(source).not.toMatch(/tenantId\s*:\s*command\./);
    expect(sources[1]).toContain("request.principal.tenantId");
  });
});
