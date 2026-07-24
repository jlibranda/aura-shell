import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaConfigurationUnitOfWork } from "@/platform/configuration/prisma-configuration-unit-of-work";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { PrismaConfigurationReadRepository } from "@/platform/configuration/prisma-configuration-read-repository";
import { PermissionSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres integration coverage for the parts an in-memory suite cannot
 * verify: actual $transaction atomicity (publish + audit + outbox commit or
 * roll back together), the DB's partial-unique-draft index and
 * immutability trigger, real query correctness for effective-date
 * resolution, and tenant isolation enforced by actual WHERE clauses rather
 * than in-memory array filtering.
 */
describe("configuration platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-7a-${randomUUID()}`;
  const tenantB = `test-tenant-7a-${randomUUID()}`;
  const createdDefinitionIds: string[] = [];

  afterAll(async () => {
    for (const definitionId of createdDefinitionIds) {
      await prisma.configurationVersion.deleteMany({ where: { definitionId } }).catch(() => undefined);
      await prisma.configurationDefinition.delete({ where: { id: definitionId } }).catch(() => undefined);
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  });

  function contextFor(tenantId: string): TenantContext {
    return { tenantId, actorId: "actor-1", actorName: "Actor One", roles: ["hr_admin"], permissions: new PermissionSet([]), correlationId: "correlation-1", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  async function seedTenant(tenantId: string) {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  }

  // Scenario 33 + 34: publication writes an outbox message atomically with the
  // audit record and the version's status change; nothing partial survives.
  it("commits the version, audit record, and outbox message atomically on publish", async () => {
    await seedTenant(tenantA);
    const eventCollector = new InMemoryDomainEventCollector();
    const auditCollector = new InMemoryAuditCollector();
    const unitOfWork = new PrismaConfigurationUnitOfWork(prisma, eventCollector, auditCollector);

    const published = await unitOfWork.execute(
      { tenantId: tenantA, correlationId: "corr-1", requestId: "req-1", actorUserId: "actor-1", commandName: "IntegrationPublish" },
      async ({ repositories }) => {
        const definition = await repositories.configuration.createDefinition({ tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code: "general", name: "General", createdBy: "actor-1" });
        createdDefinitionIds.push(definition.id);
        const draft = await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: tenantA, versionNumber: 1, payload: { displayName: "Integration Co" }, schemaVersion: 1, createdBy: "actor-1" });
        return repositories.configuration.publishVersion({ versionId: draft.id, tenantId: tenantA, expectedUpdatedAt: draft.updatedAt, effectiveFrom: "2026-01-01T00:00:00.000Z", publishedBy: "actor-1" });
      },
    );
    if (typeof published !== "object") throw new Error("expected publish to succeed");

    const dbVersion = await prisma.configurationVersion.findUniqueOrThrow({ where: { id: published.id } });
    expect(dbVersion.status).toBe("PUBLISHED");

    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: published.id, eventName: "configuration.version.published" } });
    expect(dbAudit).not.toBeNull();

    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: published.id, eventName: "configuration.version.published" } });
    expect(dbOutbox).not.toBeNull();
    expect(dbOutbox?.tenantId).toBe(tenantA);
  });

  // Scenario 20 (DB level) + immutability: the DB trigger rejects a direct
  // mutation of a PUBLISHED row's payload, proving the repository layer
  // isn't the only thing preventing edits after publish.
  it("the database itself refuses to mutate a published version's payload", async () => {
    await seedTenant(tenantA);
    const definition = await prisma.configurationDefinition.create({ data: { tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code: `general-${randomUUID()}`, name: "General", createdBy: "actor-1", scopeRef: tenantA } });
    createdDefinitionIds.push(definition.id);
    const version = await prisma.configurationVersion.create({ data: { definitionId: definition.id, tenantId: tenantA, versionNumber: 1, status: "PUBLISHED", payload: { displayName: "v1" }, schemaVersion: 1, createdBy: "actor-1", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), publishedAt: new Date(), publishedBy: "actor-1" } });

    await expect(prisma.configurationVersion.update({ where: { id: version.id }, data: { payload: { displayName: "tampered" } } })).rejects.toThrow();
  });

  // Scenario 1-4: tenant isolation, enforced by real WHERE-clause scoping.
  it("never returns another tenant's definition, even when queried directly through the read repository", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const code = `general-${randomUUID()}`;
    const definition = await prisma.configurationDefinition.create({ data: { tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code, name: "General", createdBy: "actor-1", scopeRef: tenantA } });
    createdDefinitionIds.push(definition.id);

    const read = new PrismaConfigurationReadRepository(prisma);
    expect(await read.findDefinitionByCode(contextFor(tenantA), code)).toBeDefined();
    expect(await read.findDefinitionByCode(contextFor(tenantB), code)).toBeUndefined();
  });

  // Scenario 17 + 18: effective-date resolution — current, historical, and future.
  it("resolves the correct version as of a given date across a real published history", async () => {
    await seedTenant(tenantA);
    const unitOfWork = new PrismaConfigurationUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const read = new PrismaConfigurationReadRepository(prisma);
    const code = `general-${randomUUID()}`;

    const definitionId = await unitOfWork.execute({ tenantId: tenantA, correlationId: "corr-2" }, async ({ repositories }) => {
      const definition = await repositories.configuration.createDefinition({ tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code, name: "General", createdBy: "actor-1" });
      const v1 = await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: tenantA, versionNumber: 1, payload: { displayName: "v1" }, schemaVersion: 1, createdBy: "actor-1" });
      await repositories.configuration.publishVersion({ versionId: v1.id, tenantId: tenantA, expectedUpdatedAt: v1.updatedAt, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: "2026-06-01T00:00:00.000Z", publishedBy: "actor-1" });
      const v2 = await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: tenantA, versionNumber: 2, payload: { displayName: "v2" }, schemaVersion: 1, createdBy: "actor-1" });
      await repositories.configuration.publishVersion({ versionId: v2.id, tenantId: tenantA, expectedUpdatedAt: v2.updatedAt, effectiveFrom: "2026-06-01T00:00:00.000Z", publishedBy: "actor-1" });
      return definition.id;
    });
    createdDefinitionIds.push(definitionId);

    const context = contextFor(tenantA);
    const asOfMarch = await read.getEffectiveVersion(context, definitionId, new Date("2026-03-01T00:00:00.000Z"));
    expect(asOfMarch?.payload.displayName).toBe("v1");
    const asOfAugust = await read.getEffectiveVersion(context, definitionId, new Date("2026-08-01T00:00:00.000Z"));
    expect(asOfAugust?.payload.displayName).toBe("v2");
    const beforeAnyVersion = await read.getEffectiveVersion(context, definitionId, new Date("2020-01-01T00:00:00.000Z"));
    expect(beforeAnyVersion).toBeUndefined();
  });

  // Scenario 29: concurrent publication resolves deterministically — two
  // simultaneous publish attempts against the same draft race at the
  // database's updateMany/WHERE-updatedAt predicate; exactly one must win.
  it("lets only one of two concurrent publish attempts against the same draft succeed", async () => {
    await seedTenant(tenantA);
    const code = `general-${randomUUID()}`;
    const definition = await prisma.configurationDefinition.create({ data: { tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code, name: "General", createdBy: "actor-1", scopeRef: tenantA } });
    createdDefinitionIds.push(definition.id);
    const draft = await prisma.configurationVersion.create({ data: { definitionId: definition.id, tenantId: tenantA, versionNumber: 1, status: "DRAFT", payload: { displayName: "race" }, schemaVersion: 1, createdBy: "actor-1" } });

    const unitOfWork1 = new PrismaConfigurationUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const unitOfWork2 = new PrismaConfigurationUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector());
    const publish = (unitOfWork: PrismaConfigurationUnitOfWork) => unitOfWork.execute(
      { tenantId: tenantA, correlationId: "corr-race" },
      ({ repositories }) => repositories.configuration.publishVersion({ versionId: draft.id, tenantId: tenantA, expectedUpdatedAt: draft.updatedAt.toISOString(), effectiveFrom: "2026-01-01T00:00:00.000Z", publishedBy: "actor-1" }),
    );

    const [first, second] = await Promise.all([publish(unitOfWork1), publish(unitOfWork2)]);
    const outcomes = [first, second];
    const successes = outcomes.filter((o) => typeof o === "object");
    const staleOrNotFound = outcomes.filter((o) => o === "stale" || o === "not_found");
    expect(successes).toHaveLength(1);
    expect(staleOrNotFound).toHaveLength(1);

    const publishedVersions = await prisma.configurationVersion.findMany({ where: { definitionId: definition.id, status: "PUBLISHED" } });
    expect(publishedVersions).toHaveLength(1);
  });

  // Scenario 34 (real $transaction rollback): an operation that throws after
  // writing the draft must leave neither the draft nor any audit/outbox row
  // behind — Prisma's $transaction rolls the whole block back together.
  it("rolls back the draft write (and writes no audit/outbox row) when the operation throws mid-transaction", async () => {
    await seedTenant(tenantA);
    const code = `general-${randomUUID()}`;
    const auditCollector = new InMemoryAuditCollector();
    const eventCollector = new InMemoryDomainEventCollector();
    const unitOfWork = new PrismaConfigurationUnitOfWork(prisma, eventCollector, auditCollector);

    let definitionId = "";
    await expect(unitOfWork.execute(
      { tenantId: tenantA, correlationId: "corr-rollback", requestId: "req-rollback", actorUserId: "actor-1", commandName: "IntegrationRollback" },
      async ({ repositories }) => {
        const definition = await repositories.configuration.createDefinition({ tenantId: tenantA, type: "GENERAL_COMPANY_SETTINGS", code, name: "General", createdBy: "actor-1" });
        definitionId = definition.id;
        await repositories.configuration.createDraftVersion({ definitionId: definition.id, tenantId: tenantA, versionNumber: 1, payload: { displayName: "should not survive" }, schemaVersion: 1, createdBy: "actor-1" });
        throw new Error("simulated failure mid-transaction");
      },
    )).rejects.toThrow("simulated failure mid-transaction");

    expect(await prisma.configurationDefinition.findUnique({ where: { id: definitionId } })).toBeNull();
    expect(await prisma.configurationVersion.findFirst({ where: { definitionId } })).toBeNull();
    expect(await prisma.auditRecord.findFirst({ where: { commandName: "IntegrationRollback" } })).toBeNull();
    expect(await prisma.outboxMessage.findFirst({ where: { aggregateId: definitionId } })).toBeNull();
    expect(eventCollector.list()).toHaveLength(0);
    expect(auditCollector.list()).toHaveLength(0);
  });
});
