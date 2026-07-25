import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaLocationUnitOfWork } from "@/platform/organization/prisma-location-unit-of-work";
import { PrismaLocationReadRepository } from "@/platform/organization/prisma-location-read-repository";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { LocationService } from "@/platform/organization/location-service";
import { createTrustedRequestContext } from "@/platform/runtime-context";
import { PermissionSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (location + audit + outbox commit together), the
 * DB-level guards (status CHECK, tenant-scoped unique code), and real
 * tenant-isolated queries.
 */
describe("location platform (integration)", () => {
  const prisma = getPrismaClient();
  const tenantA = `test-tenant-7b3-${randomUUID()}`;
  const tenantB = `test-tenant-7b3-${randomUUID()}`;

  afterAll(async () => {
    await prisma.location.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }).catch(() => undefined);
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

  const address = { line1: "123 Ayala Ave", city: "Makati" };

  it("commits the location, audit record, and outbox message atomically on create", async () => {
    await seedTenant(tenantA);
    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const service = new LocationService(new PrismaLocationUnitOfWork(prisma, events, audit));

    const code = `HQ-${randomUUID().slice(0, 8)}`.toUpperCase();
    const result = await service.createLocation(request(tenantA), { code, name: "Head Office", address, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const dbLocation = await prisma.location.findUniqueOrThrow({ where: { id: result.value.location.id } });
    expect(dbLocation.countryCode).toBe("PH");
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: result.value.location.id, eventName: "organization.location.created" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: result.value.location.id, eventName: "organization.location.created" } });
    expect(dbOutbox).not.toBeNull();
    expect(dbOutbox?.tenantId).toBe(tenantA);
  });

  it("the database rejects an invalid status (DB-level guard)", async () => {
    await seedTenant(tenantA);
    const id = randomUUID();
    await expect(prisma.location.create({
      data: { id, tenantId: tenantA, code: `BAD-${id.slice(0, 6)}`, name: "Bad", addressLine1: address.line1, city: address.city, countryCode: "PH", timezone: "Asia/Manila", status: "CLOSED", createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("the database rejects a duplicate code within a tenant", async () => {
    await seedTenant(tenantA);
    const code = `UNIQ-${randomUUID().slice(0, 8)}`.toUpperCase();
    await prisma.location.create({ data: { tenantId: tenantA, code, name: "One", addressLine1: address.line1, city: address.city, countryCode: "PH", timezone: "Asia/Manila", createdBy: "tester" } });
    await expect(prisma.location.create({
      data: { tenantId: tenantA, code, name: "Two", addressLine1: address.line1, city: address.city, countryCode: "PH", timezone: "Asia/Manila", createdBy: "tester" },
    })).rejects.toThrow();
  });

  it("a full real lifecycle: create, update details, archive, and read back correctly", async () => {
    await seedTenant(tenantA);
    const service = new LocationService(new PrismaLocationUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const code = `LC-${randomUUID().slice(0, 8)}`.toUpperCase();
    const created = await service.createLocation(request(tenantA), { code, name: "Satellite Office", address, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("create failed");

    const updated = await service.updateLocationDetails(request(tenantA), { id: created.value.location.id, name: "Satellite Office 2", address: { line1: "456 Ayala Ave", city: "Makati" }, countryCode: "PH", timezone: "Asia/Singapore" });
    expect(updated.kind).toBe("success");

    const archived = await service.archiveLocation(request(tenantA), { id: created.value.location.id });
    expect(archived.kind).toBe("success");
    if (archived.kind !== "success") return;
    expect(archived.value.location.status).toBe("ARCHIVED");

    const reader = new PrismaLocationReadRepository(prisma);
    expect(await reader.listActive(readContext(tenantA))).not.toContainEqual(expect.objectContaining({ id: created.value.location.id }));
    const all = await reader.listAll(readContext(tenantA));
    expect(all.find((l) => l.id === created.value.location.id)?.name).toBe("Satellite Office 2");
  });

  it("keeps locations strictly tenant-isolated in reads", async () => {
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    const service = new LocationService(new PrismaLocationUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const code = `ISO-${randomUUID().slice(0, 8)}`.toUpperCase();
    const created = await service.createLocation(request(tenantA), { code, name: "A only", address, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("create failed");

    const reader = new PrismaLocationReadRepository(prisma);
    expect(await reader.getByCode(readContext(tenantA), code)).toBeDefined();
    expect(await reader.getByCode(readContext(tenantB), code)).toBeUndefined();
    expect(await reader.getById(readContext(tenantB), created.value.location.id)).toBeUndefined();
  });
});
