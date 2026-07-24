import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaOrgUnitUnitOfWork } from "@/platform/organization/prisma-org-unit-unit-of-work";
import { PrismaOrgUnitReadRepository } from "@/platform/organization/prisma-org-unit-read-repository";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { OrgUnitService } from "@/platform/organization/org-unit-service";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { PermissionSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (org-unit + audit + outbox commit together), the
 * DB-level guards (kind CHECK, self-parent CHECK, tenant-scoped parent FK,
 * unique code), and real tenant-isolated queries.
 */
describe("org unit platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-7b1-${randomUUID()}`;
  const tenantB = `test-tenant-7b1-${randomUUID()}`;

  afterAll(async () => {
    await prisma.orgUnit.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  });

  async function seedTenant(tenantId: string) {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  }

  function request(tenantId: string) {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles: ["hr_admin"],
      permissions: ["organization.view", "organization.manage"],
      actorProvenance: "server_verified",
      correlationId: "corr-1",
    });
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermissionSet(["organization.view"]), correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  it("commits the org unit, audit record, and outbox message atomically on create", async () => {
    await seedTenant(tenantA);
    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const service = new OrgUnitService(new PrismaOrgUnitUnitOfWork(prisma, events, audit));

    const code = `FIN-${randomUUID().slice(0, 8)}`.toUpperCase();
    const result = await service.createOrgUnit(request(tenantA), { code, name: "Finance", kind: "DIVISION" });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const dbUnit = await prisma.orgUnit.findUniqueOrThrow({ where: { id: result.value.unit.id } });
    expect(dbUnit.kind).toBe("DIVISION");
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: result.value.unit.id, eventName: "organization.org_unit.created" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: result.value.unit.id, eventName: "organization.org_unit.created" } });
    expect(dbOutbox).not.toBeNull();
    expect(dbOutbox?.tenantId).toBe(tenantA);
  });

  it("builds and reads a real parent-child hierarchy, tenant-scoped", async () => {
    await seedTenant(tenantA);
    const service = new OrgUnitService(new PrismaOrgUnitUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const root = await service.createOrgUnit(request(tenantA), { code: `ROOT-${suffix}`, name: "Root", kind: "DIVISION" });
    if (root.kind !== "success") throw new Error("root create failed");
    const child = await service.createOrgUnit(request(tenantA), { code: `CH-${suffix}`, name: "Child", kind: "DEPARTMENT", parentId: root.value.unit.id });
    expect(child.kind).toBe("success");
    if (child.kind !== "success") return;

    const reader = new PrismaOrgUnitReadRepository(prisma);
    const children = await reader.listChildren(readContext(tenantA), root.value.unit.id);
    expect(children.map((c) => c.id)).toContain(child.value.unit.id);
    expect(await reader.getByCode(readContext(tenantA), `CH-${suffix}`)).toBeDefined();
  });

  it("the database rejects an invalid kind and a self-parent (DB-level guards)", async () => {
    await seedTenant(tenantA);
    const id = randomUUID();
    await expect(prisma.orgUnit.create({ data: { id, tenantId: tenantA, code: `BAD-${id.slice(0, 6)}`, name: "Bad", kind: "GUILD", createdBy: "tester" } })).rejects.toThrow();

    const good = await prisma.orgUnit.create({ data: { tenantId: tenantA, code: `SELF-${id.slice(0, 6)}`, name: "Self", kind: "TEAM", createdBy: "tester" } });
    await expect(prisma.orgUnit.update({ where: { id: good.id }, data: { parentId: good.id } })).rejects.toThrow();
  });

  it("the database rejects a duplicate code within a tenant", async () => {
    await seedTenant(tenantA);
    const code = `UNIQ-${randomUUID().slice(0, 8)}`.toUpperCase();
    await prisma.orgUnit.create({ data: { tenantId: tenantA, code, name: "One", kind: "TEAM", createdBy: "tester" } });
    await expect(prisma.orgUnit.create({ data: { tenantId: tenantA, code, name: "Two", kind: "TEAM", createdBy: "tester" } })).rejects.toThrow();
  });

  it("keeps org units strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const service = new OrgUnitService(new PrismaOrgUnitUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const code = `ISO-${randomUUID().slice(0, 8)}`.toUpperCase();
    const created = await service.createOrgUnit(request(tenantA), { code, name: "A only", kind: "DIVISION" });
    if (created.kind !== "success") throw new Error("create failed");

    const reader = new PrismaOrgUnitReadRepository(prisma);
    expect(await reader.getByCode(readContext(tenantA), code)).toBeDefined();
    expect(await reader.getByCode(readContext(tenantB), code)).toBeUndefined();
    expect(await reader.getById(readContext(tenantB), created.value.unit.id)).toBeUndefined();
  });
});
