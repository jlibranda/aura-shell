import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryLegalEntityUnitOfWork } from "@/platform/organization/in-memory-legal-entity-unit-of-work";
import { InMemoryLegalEntityReadRepository } from "@/platform/organization/in-memory-legal-entity-repository";
import { LegalEntityService } from "@/platform/organization/legal-entity-service";

function requestFor(roles: readonly PlatformRole[], permissions: readonly Permission[] = [], tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions,
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

const MANAGE: Permission[] = ["organization.view", "organization.manage"];

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryLegalEntityUnitOfWork(undefined, events, audit);
  const service = new LegalEntityService(unitOfWork);
  const reader = new InMemoryLegalEntityReadRepository(unitOfWork.getStore());
  const readContext = (tenantId: string) => ({ tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });
  return { service, audit, events, unitOfWork, reader, readContext };
}

describe("LegalEntityService — authorization", () => {
  it("denies create without organization.manage", async () => {
    const { service } = harness();
    const result = await service.createLegalEntity(requestFor(["employee"], []), { code: "LE1", legalName: "Acme Corp", countryCode: "PH" });
    expect(result.kind).toBe("authorization_failure");
  });

  it("denies update and archive without organization.manage", async () => {
    const { service } = harness();
    const request = requestFor(["payroll"], ["organization.view"]);
    expect((await service.updateLegalEntityDetails(request, { id: "x", legalName: "X", countryCode: "PH" })).kind).toBe("authorization_failure");
    expect((await service.archiveLegalEntity(request, { id: "x" })).kind).toBe("authorization_failure");
  });
});

describe("LegalEntityService — create", () => {
  it("creates a legal entity and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.createLegalEntity(requestFor(["hr_admin"], MANAGE), { code: "LE1", legalName: "Acme Corp", countryCode: "PH" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.legalEntity.code).toBe("LE1");
      expect(result.value.legalEntity.status).toBe("ACTIVE");
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["organization.legal_entity.created"]);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].metadata).toHaveProperty("code", "LE1");
  });

  it("rejects a duplicate code as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.createLegalEntity(request, { code: "LE1", legalName: "Acme Corp", countryCode: "PH" });
    const dup = await service.createLegalEntity(request, { code: "LE1", legalName: "Acme Corp 2", countryCode: "PH" });
    expect(dup.kind).toBe("conflict");
  });

  it("returns validation failure for an invalid country code without writing", async () => {
    const { service, unitOfWork } = harness();
    const result = await service.createLegalEntity(requestFor(["hr_admin"], MANAGE), { code: "LE1", legalName: "Acme Corp", countryCode: "USA" });
    expect(result.kind).toBe("validation_failure");
    expect(unitOfWork.getStore().legalEntities).toHaveLength(0);
  });
});

describe("LegalEntityService — update and archive", () => {
  async function seedLegalEntity() {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.createLegalEntity(request, { code: "LE1", legalName: "Acme Corp", countryCode: "PH" });
    if (created.kind !== "success") throw new Error("seed failed");
    return { ...h, request, id: created.value.legalEntity.id };
  }

  it("updates legal name and country (code stays as immutable identity)", async () => {
    const { service, request, id } = await seedLegalEntity();
    const result = await service.updateLegalEntityDetails(request, { id, legalName: "Acme Corporation", countryCode: "SG" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.legalEntity.legalName).toBe("Acme Corporation");
      expect(result.value.legalEntity.countryCode).toBe("SG");
      expect(result.value.legalEntity.code).toBe("LE1");
    }
  });

  it("archives a legal entity (soft lifecycle — never a hard delete)", async () => {
    const { service, request, id, events } = await seedLegalEntity();
    const result = await service.archiveLegalEntity(request, { id });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.legalEntity.status).toBe("ARCHIVED");
    expect(events.list().some((e) => e.eventName === "organization.legal_entity.archived")).toBe(true);
  });

  it("rejects archiving an already-archived legal entity as a conflict", async () => {
    const { service, request, id } = await seedLegalEntity();
    await service.archiveLegalEntity(request, { id });
    const again = await service.archiveLegalEntity(request, { id });
    expect(again.kind).toBe("conflict");
  });
});

describe("LegalEntityService — tenant isolation", () => {
  it("does not let tenant B update or read tenant A's legal entity", async () => {
    const { service, reader } = harness();
    const created = await service.createLegalEntity(requestFor(["hr_admin"], MANAGE, "tenant-a"), { code: "LE1", legalName: "Acme Corp", countryCode: "PH" });
    if (created.kind !== "success") throw new Error("create failed");

    const asB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const update = await service.updateLegalEntityDetails(asB, { id: created.value.legalEntity.id, legalName: "Hijacked", countryCode: "PH" });
    expect(update.kind).toBe("validation_failure");

    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await reader.getById(bContext, created.value.legalEntity.id)).toBeUndefined();
  });
});

describe("LegalEntityService — transaction rollback", () => {
  it("releases no events/audit when the operation is rejected before writing (invalid country code)", async () => {
    const { service, audit, events } = harness();
    await service.createLegalEntity(requestFor(["hr_admin"], MANAGE), { code: "LE1", legalName: "Acme Corp", countryCode: "USA" });
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });
});
