import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryOrgUnitUnitOfWork } from "@/platform/organization/in-memory-org-unit-unit-of-work";
import { InMemoryOrgUnitReadRepository } from "@/platform/organization/in-memory-org-unit-repository";
import { OrgUnitService } from "@/platform/organization/org-unit-service";
import { LegalEntityStore } from "@/platform/organization/in-memory-legal-entity-repository";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

function requestFor(roles: readonly PlatformRole[], permissions: readonly Permission[] = [], tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles,
    permissions,
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

function legalEntity(overrides: Partial<LegalEntityRecord> = {}): LegalEntityRecord {
  return Object.freeze({
    id: "le1", tenantId: "tenant-a", code: "LE1", legalName: "Acme Corp", countryCode: "PH", status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function harness(seedLegalEntities: readonly LegalEntityRecord[] = [legalEntity()]) {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const legalEntityStore = new LegalEntityStore();
  legalEntityStore.legalEntities.push(...seedLegalEntities);
  const unitOfWork = new InMemoryOrgUnitUnitOfWork(undefined, events, audit, undefined, undefined, legalEntityStore);
  const service = new OrgUnitService(unitOfWork);
  const readContext = (tenantId: string) => ({ tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });
  const reader = new InMemoryOrgUnitReadRepository(unitOfWork.getStore());
  return { service, audit, events, unitOfWork, reader, readContext, legalEntityStore };
}

const MANAGE: Permission[] = ["organization.view", "organization.manage"];

describe("OrgUnitService — authorization", () => {
  it("denies create without organization.manage", async () => {
    const { service } = harness();
    const result = await service.createOrgUnit(requestFor(["employee"], []), { legalEntityId: "le1", code: "FIN", name: "Finance", kind: "DEPARTMENT" });
    expect(result.kind).toBe("authorization_failure");
  });

  it("denies move and archive without organization.manage", async () => {
    const { service } = harness();
    const request = requestFor(["payroll"], ["organization.view"]);
    expect((await service.moveOrgUnit(request, { id: "x", parentId: null })).kind).toBe("authorization_failure");
    expect((await service.archiveOrgUnit(request, { id: "x" })).kind).toBe("authorization_failure");
  });
});

describe("OrgUnitService — create", () => {
  it("creates a root org unit and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "FIN", name: "Finance", kind: "DIVISION" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.unit.parentId).toBeUndefined();
    expect(events.list().map((e) => e.eventName)).toEqual(["organization.org_unit.created"]);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].eventName).toBe("organization.org_unit.created");
    // Safe metadata only — code/kind/status, never anything sensitive.
    expect(audit.list()[0].metadata).toHaveProperty("code", "FIN");
  });

  it("rejects a duplicate code as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.createOrgUnit(request, { legalEntityId: "le1", code: "FIN", name: "Finance", kind: "DIVISION" });
    const dup = await service.createOrgUnit(request, { legalEntityId: "le1", code: "FIN", name: "Finance 2", kind: "DEPARTMENT" });
    expect(dup.kind).toBe("conflict");
  });

  it("rejects a child whose parent does not exist", async () => {
    const { service } = harness();
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "TEAM1", name: "Team", kind: "TEAM", parentId: "ghost" });
    expect(result.kind).toBe("validation_failure");
  });

  it("returns validation failure for an invalid kind without writing", async () => {
    const { service, unitOfWork } = harness();
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "X", name: "X", kind: "GUILD" });
    expect(result.kind).toBe("validation_failure");
    expect(unitOfWork.getStore().units).toHaveLength(0);
  });
});

describe("OrgUnitService — hierarchy: rename, move, cycle, archive", () => {
  async function seedTree() {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const root = await h.service.createOrgUnit(request, { legalEntityId: "le1", code: "ROOT", name: "Root", kind: "DIVISION" });
    if (root.kind !== "success") throw new Error("seed root failed");
    const a = await h.service.createOrgUnit(request, { legalEntityId: "le1", code: "A", name: "A", kind: "DEPARTMENT", parentId: root.value.unit.id });
    const b = await h.service.createOrgUnit(request, { legalEntityId: "le1", code: "B", name: "B", kind: "TEAM", parentId: a.kind === "success" ? a.value.unit.id : undefined });
    if (a.kind !== "success" || b.kind !== "success") throw new Error("seed children failed");
    return { ...h, request, rootId: root.value.unit.id, aId: a.value.unit.id, bId: b.value.unit.id };
  }

  it("renames a unit (name changes, code stays as immutable identity)", async () => {
    const { service, request, aId } = await seedTree();
    const result = await service.renameOrgUnit(request, { id: aId, name: "Accounting" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") { expect(result.value.unit.name).toBe("Accounting"); expect(result.value.unit.code).toBe("A"); }
  });

  it("moves a unit to a new parent", async () => {
    const { service, request, rootId, bId } = await seedTree();
    const result = await service.moveOrgUnit(request, { id: bId, parentId: rootId });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.unit.parentId).toBe(rootId);
  });

  it("moves a unit to a root (null parent)", async () => {
    const { service, request, aId } = await seedTree();
    const result = await service.moveOrgUnit(request, { id: aId, parentId: null });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.unit.parentId).toBeUndefined();
  });

  it("rejects moving a unit under itself (cycle)", async () => {
    const { service, request, aId } = await seedTree();
    expect((await service.moveOrgUnit(request, { id: aId, parentId: aId })).kind).toBe("conflict");
  });

  it("rejects moving a unit under one of its own descendants (cycle)", async () => {
    const { service, request, aId, bId } = await seedTree();
    // b is a descendant of a; moving a under b would create a cycle.
    expect((await service.moveOrgUnit(request, { id: aId, parentId: bId })).kind).toBe("conflict");
  });

  it("archives a unit (soft lifecycle — never a hard delete)", async () => {
    const { service, request, bId, events } = await seedTree();
    const result = await service.archiveOrgUnit(request, { id: bId });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.unit.status).toBe("ARCHIVED");
    expect(events.list().some((e) => e.eventName === "organization.org_unit.archived")).toBe(true);
  });
});

describe("OrgUnitService — tenant isolation", () => {
  it("does not let tenant B rename or read tenant A's unit", async () => {
    const { service, reader } = harness();
    const created = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE, "tenant-a"), { legalEntityId: "le1", code: "FIN", name: "Finance", kind: "DIVISION" });
    if (created.kind !== "success") throw new Error("create failed");

    // Tenant B renaming tenant A's unit -> not found (scoped away).
    const asB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const rename = await service.renameOrgUnit(asB, { id: created.value.unit.id, name: "Hijacked" });
    expect(rename.kind).toBe("validation_failure");

    // Tenant B reading -> absent.
    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await reader.getById(bContext, created.value.unit.id)).toBeUndefined();
  });
});

describe("OrgUnitService — transaction rollback", () => {
  it("releases no events/audit when the operation is rejected before writing (invalid kind)", async () => {
    const { service, audit, events } = harness();
    await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "X", name: "X", kind: "NONSENSE" });
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });
});

describe("OrgUnitService — Legal Entity ownership (ADR-013 §3)", () => {
  it("rejects creating an org unit against a nonexistent legal entity", async () => {
    const { service } = harness();
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "ghost", code: "X", name: "X", kind: "DEPARTMENT" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects creating an org unit against an archived legal entity", async () => {
    const { service } = harness([legalEntity({ status: "ARCHIVED" })]);
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "X", name: "X", kind: "DEPARTMENT" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a child whose parent belongs to a different legal entity (cross-entity parent)", async () => {
    const { service } = harness([legalEntity({ id: "le1", code: "LE1" }), legalEntity({ id: "le2", code: "LE2" })]);
    const request = requestFor(["hr_admin"], MANAGE);
    const rootA = await service.createOrgUnit(request, { legalEntityId: "le1", code: "ROOT-A", name: "Root A", kind: "DIVISION" });
    if (rootA.kind !== "success") throw new Error("seed failed");
    const result = await service.createOrgUnit(request, { legalEntityId: "le2", code: "CHILD-B", name: "Child B", kind: "DEPARTMENT", parentId: rootA.value.unit.id });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects moving an org unit under a parent from a different legal entity", async () => {
    const { service } = harness([legalEntity({ id: "le1", code: "LE1" }), legalEntity({ id: "le2", code: "LE2" })]);
    const request = requestFor(["hr_admin"], MANAGE);
    const rootA = await service.createOrgUnit(request, { legalEntityId: "le1", code: "ROOT-A", name: "Root A", kind: "DIVISION" });
    const rootB = await service.createOrgUnit(request, { legalEntityId: "le2", code: "ROOT-B", name: "Root B", kind: "DIVISION" });
    if (rootA.kind !== "success" || rootB.kind !== "success") throw new Error("seed failed");
    const result = await service.moveOrgUnit(request, { id: rootA.value.unit.id, parentId: rootB.value.unit.id });
    expect(result.kind).toBe("validation_failure");
  });

  it("allows a child within the same legal entity as its parent", async () => {
    const { service } = harness([legalEntity({ id: "le1", code: "LE1" }), legalEntity({ id: "le2", code: "LE2" })]);
    const request = requestFor(["hr_admin"], MANAGE);
    const rootA = await service.createOrgUnit(request, { legalEntityId: "le1", code: "ROOT-A", name: "Root A", kind: "DIVISION" });
    if (rootA.kind !== "success") throw new Error("seed failed");
    const result = await service.createOrgUnit(request, { legalEntityId: "le1", code: "CHILD-A", name: "Child A", kind: "DEPARTMENT", parentId: rootA.value.unit.id });
    expect(result.kind).toBe("success");
  });

  it("stamps the created org unit with the requested legal entity", async () => {
    const { service } = harness();
    const result = await service.createOrgUnit(requestFor(["hr_admin"], MANAGE), { legalEntityId: "le1", code: "X", name: "X", kind: "DEPARTMENT" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.unit.legalEntityId).toBe("le1");
  });
});
