import { describe, expect, it } from "vitest";
import { InMemoryConfigurationUnitOfWork } from "@/platform/configuration/in-memory-configuration-unit-of-work";

const context = { tenantId: "tenant-a", correlationId: "correlation-1", requestId: "request-1", actorUserId: "actor-1", commandName: "TestCommand" };

describe("InMemoryConfigurationUnitOfWork — audit and event atomicity", () => {
  // Scenario 31: Draft creation is audited.
  it("collects one audit record and one domain event per successful mutation", async () => {
    const { InMemoryAuditCollector } = await import("@/platform/auditing/audit-collector");
    const { InMemoryDomainEventCollector } = await import("@/platform/events/domain-event-collector");
    const auditCollector = new InMemoryAuditCollector();
    const eventCollector = new InMemoryDomainEventCollector();
    const uow = new InMemoryConfigurationUnitOfWork(undefined, eventCollector, auditCollector);

    const draft = await uow.execute(context, async ({ repositories }) => {
      const definition = await repositories.configuration.createDefinition({ tenantId: "tenant-a", type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General", createdBy: "actor-1" });
      return repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: { displayName: "A" }, schemaVersion: 1, createdBy: "actor-1" });
    });

    expect(eventCollector.list()).toHaveLength(1);
    expect(eventCollector.list()[0].eventName).toBe("configuration.draft.created");
    expect(auditCollector.list()).toHaveLength(1);
    expect(auditCollector.list()[0].eventName).toBe("configuration.draft.created");
    expect(auditCollector.list()[0].aggregateId).toBe(draft.id);

    // Scenario 35: Audit metadata does not contain secrets or uncontrolled payloads —
    // only safe identifiers, never the raw settings field values.
    const metadata = auditCollector.list()[0].metadata;
    expect(metadata).toHaveProperty("definitionId");
    expect(metadata).toHaveProperty("versionId");
    expect(JSON.stringify(metadata)).not.toContain("displayName");
  });

  // Scenario 32 + 33: Publication is audited and writes an outbox-eligible event atomically with the write.
  it("audits a publish as configuration.version.published, atomically with the version status change", async () => {
    const { InMemoryAuditCollector } = await import("@/platform/auditing/audit-collector");
    const { InMemoryDomainEventCollector } = await import("@/platform/events/domain-event-collector");
    const auditCollector = new InMemoryAuditCollector();
    const eventCollector = new InMemoryDomainEventCollector();
    const uow = new InMemoryConfigurationUnitOfWork(undefined, eventCollector, auditCollector);

    await uow.execute(context, async ({ repositories }) => {
      const definition = await repositories.configuration.createDefinition({ tenantId: "tenant-a", type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General", createdBy: "actor-1" });
      const draft = await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
      return repositories.configuration.publishVersion({ versionId: draft.id, tenantId: "tenant-a", expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-08-01T00:00:00.000Z", publishedBy: "actor-1" });
    });

    const publishedAudit = auditCollector.list().find((record) => record.eventName === "configuration.version.published");
    expect(publishedAudit).toBeDefined();
    const publishedEvent = eventCollector.list().find((event) => event.eventName === "configuration.version.published");
    expect(publishedEvent).toBeDefined();
    expect(publishedEvent?.payload.effectiveFrom).toBe("2026-08-01T00:00:00.000Z");
  });

  // Scenario 34: Transaction failure creates neither partial publication nor partial audit/outbox state.
  it("rolls back the store and releases no events/audit when the operation throws", async () => {
    const { InMemoryAuditCollector } = await import("@/platform/auditing/audit-collector");
    const { InMemoryDomainEventCollector } = await import("@/platform/events/domain-event-collector");
    const auditCollector = new InMemoryAuditCollector();
    const eventCollector = new InMemoryDomainEventCollector();
    const uow = new InMemoryConfigurationUnitOfWork(undefined, eventCollector, auditCollector);

    await expect(uow.execute(context, async ({ repositories }) => {
      const definition = await repositories.configuration.createDefinition({ tenantId: "tenant-a", type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General", createdBy: "actor-1" });
      await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
      throw new Error("simulated failure mid-transaction");
    })).rejects.toThrow("simulated failure mid-transaction");

    expect(eventCollector.list()).toHaveLength(0);
    expect(auditCollector.list()).toHaveLength(0);
    expect(uow.getStore().definitions).toHaveLength(0);
    expect(uow.getStore().versions).toHaveLength(0);
  });

  it("does not audit anything for a request context missing actor/request identity (system-side safety net)", async () => {
    const { InMemoryAuditCollector } = await import("@/platform/auditing/audit-collector");
    const auditCollector = new InMemoryAuditCollector();
    const uow = new InMemoryConfigurationUnitOfWork(undefined, undefined, auditCollector);
    await uow.execute({ tenantId: "tenant-a", correlationId: "correlation-1" }, async ({ repositories }) => {
      const definition = await repositories.configuration.createDefinition({ tenantId: "tenant-a", type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General", createdBy: "actor-1" });
      return repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: "tenant-a", versionNumber: 1, payload: {}, schemaVersion: 1, createdBy: "actor-1" });
    });
    expect(auditCollector.list()).toHaveLength(0);
  });
});
