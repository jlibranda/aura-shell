import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAssignmentUnitOfWork } from "@/platform/organization/in-memory-assignment-unit-of-work";
import { InMemoryAssignmentReadRepository } from "@/platform/organization/in-memory-assignment-repository";
import { AssignmentService } from "@/platform/organization/assignment-service";
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

const MANAGE: Permission[] = ["organization.view", "organization.manage"];

function legalEntity(overrides: Partial<LegalEntityRecord> = {}): LegalEntityRecord {
  return Object.freeze({
    id: "le1", tenantId: "tenant-a", code: "LE1", legalName: "Acme Corp", countryCode: "PH", status: "ACTIVE" as const,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function harness(tenantId = "tenant-a") {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryAssignmentUnitOfWork(undefined, undefined, undefined, events, audit);
  const service = new AssignmentService(unitOfWork);
  const reader = new InMemoryAssignmentReadRepository(unitOfWork.getStore());
  const readContext = (t = tenantId) => ({ tenantId: t, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });

  // Seed an active legal entity, a valid org unit belonging to it, an active location, and two known employees so create-side existence checks pass by default.
  unitOfWork.getLegalEntityStore().legalEntities.push(legalEntity({ tenantId }));
  unitOfWork.getOrgUnitStore().units.push(Object.freeze({
    id: "ou1", tenantId, legalEntityId: "le1", code: "OU1", name: "Unit 1", kind: "TEAM" as const, status: "ACTIVE" as const,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.getLocationStore().locations.push(Object.freeze({
    id: "loc1", tenantId, code: "LOC1", name: "Location 1",
    address: { line1: "1 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila",
    status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.getLocationStore().locations.push(Object.freeze({
    id: "loc2", tenantId, code: "LOC2", name: "Location 2 (archived)",
    address: { line1: "2 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila",
    status: "ARCHIVED" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.getPeople().add(tenantId, "p1");
  unitOfWork.getPeople().add(tenantId, "p2");

  return { service, audit, events, unitOfWork, reader, readContext };
}

describe("AssignmentService — authorization", () => {
  it("denies assignPrimary, transfer, and endAssignment without organization.manage", async () => {
    const { service } = harness();
    const request = requestFor(["employee"], ["organization.view"]);
    expect((await service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" })).kind).toBe("authorization_failure");
    expect((await service.transfer(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" })).kind).toBe("authorization_failure");
    expect((await service.endAssignment(request, { personId: "p1", effectiveUntil: "2026-06-01" })).kind).toBe("authorization_failure");
  });
});

describe("AssignmentService — assignPrimary", () => {
  it("assigns a person's first primary placement and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", managerId: "p2", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.assignment.orgUnitId).toBe("ou1");
      expect(result.value.assignment.managerId).toBe("p2");
      expect(result.value.assignment.isPrimary).toBe(true);
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["organization.assignment.assigned"]);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].metadata).toHaveProperty("personId", "p1");
  });

  it("rejects a person who does not exist", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "ghost", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a manager who does not exist", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", managerId: "ghost", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects an org unit that does not exist", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ghost", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a self-manager as a validation failure before touching the store", async () => {
    const { service, unitOfWork } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", managerId: "p1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    expect(unitOfWork.getStore().assignments).toHaveLength(0);
  });

  it("rejects a second primary assignment that overlaps the person's current one as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    const overlapping = await service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-03-01" });
    expect(overlapping.kind).toBe("conflict");
  });
});

describe("AssignmentService — assignPrimary with locationId", () => {
  it("accepts an assignment with a valid, active locationId", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", locationId: "loc1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.locationId).toBe("loc1");
  });

  it("accepts an assignment without a locationId — location remains optional", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.locationId).toBeUndefined();
  });

  it("rejects a locationId that does not exist", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", locationId: "ghost-loc", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "locationId" && i.code === "not_found")).toBe(true);
  });

  it("rejects an archived location", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", locationId: "loc2", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "locationId" && i.code === "archived")).toBe(true);
  });

  it("does not let tenant B use tenant A's location", async () => {
    const h = harness("tenant-a");
    // Seed tenant B with its own legal entity, person, and org unit, but not tenant A's location.
    h.unitOfWork.getLegalEntityStore().legalEntities.push(legalEntity({ id: "le-b", tenantId: "tenant-b", code: "LEB" }));
    h.unitOfWork.getOrgUnitStore().units.push(Object.freeze({
      id: "ou-b", tenantId: "tenant-b", legalEntityId: "le-b", code: "OUB", name: "Unit B", kind: "TEAM" as const, status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    h.unitOfWork.getPeople().add("tenant-b", "p1");
    const result = await h.service.assignPrimary(requestFor(["hr_admin"], MANAGE, "tenant-b"), { personId: "p1", orgUnitId: "ou-b", locationId: "loc1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "locationId" && i.code === "not_found")).toBe(true);
  });
});

async function seedCurrent() {
  const h = harness();
  const request = requestFor(["hr_admin"], MANAGE);
  const first = await h.service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
  if (first.kind !== "success") throw new Error("seed failed");
  return { ...h, request, firstId: first.value.assignment.id };
}

describe("AssignmentService — transfer", () => {
  it("ends the current placement and opens a new one, atomically", async () => {
    const { service, request, firstId, reader, readContext } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", managerId: "p2", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.previous.id).toBe(firstId);
      expect(result.value.previous.effectiveUntil).toBe("2026-06-01");
      expect(result.value.assignment.managerId).toBe("p2");
      expect(result.value.assignment.effectiveFrom).toBe("2026-06-01");
    }
    const current = await reader.getCurrentForPerson(readContext(), "p1");
    expect(current?.managerId).toBe("p2");
  });

  it("emits an ended event for the superseded record and an assigned event for the new one", async () => {
    const { service, request, events } = await seedCurrent();
    const before = events.list().length;
    await service.transfer(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-06-01" });
    const names = events.list().slice(before).map((e) => e.eventName);
    expect(names).toEqual(["organization.assignment.ended", "organization.assignment.assigned"]);
  });

  it("rejects a transfer with no current placement to transfer from", async () => {
    const { service } = harness();
    const result = await service.transfer(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects a transfer whose effectiveFrom is not after the current placement's start", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });
});

describe("AssignmentService — transfer changing only location (Change Location)", () => {
  it("changes locationId while the org unit and manager are passed through unchanged", async () => {
    const { service, request } = await seedCurrent();
    await service.transfer(request, { personId: "p1", orgUnitId: "ou1", managerId: "p2", locationId: "loc1", effectiveFrom: "2026-03-01" });
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", managerId: "p2", locationId: "loc1", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.assignment.orgUnitId).toBe("ou1");
      expect(result.value.assignment.managerId).toBe("p2");
      expect(result.value.assignment.locationId).toBe("loc1");
    }
  });

  it("rejects changing to a location that does not exist", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", locationId: "ghost-loc", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "locationId")).toBe(true);
  });
});

describe("AssignmentService — transfer preserves an unrelated field when only one field changes", () => {
  it("an organization transfer that explicitly passes through the current locationId keeps it (org-unit-only change)", async () => {
    const { service, request } = await seedCurrent();
    await service.transfer(request, { personId: "p1", orgUnitId: "ou1", locationId: "loc1", effectiveFrom: "2026-03-01" });
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", locationId: "loc1", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.locationId).toBe("loc1");
  });

  it("a manager change that explicitly passes through the current locationId keeps it (manager-only change)", async () => {
    const { service, request } = await seedCurrent();
    await service.transfer(request, { personId: "p1", orgUnitId: "ou1", locationId: "loc1", effectiveFrom: "2026-03-01" });
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", managerId: "p2", locationId: "loc1", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.assignment.managerId).toBe("p2");
      expect(result.value.assignment.locationId).toBe("loc1");
    }
  });
});

describe("AssignmentService — endAssignment", () => {
  it("closes the current primary placement", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await h.service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    const result = await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2026-12-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.effectiveUntil).toBe("2026-12-01");
  });

  it("rejects ending a person with no current placement", async () => {
    const { service } = harness();
    const result = await service.endAssignment(requestFor(["hr_admin"], MANAGE), { personId: "p1", effectiveUntil: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
  });

  it("rejects an end date that is not after the placement's start", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await h.service.assignPrimary(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-06-01" });
    const result = await h.service.endAssignment(request, { personId: "p1", effectiveUntil: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
  });
});

describe("AssignmentService — tenant isolation", () => {
  it("does not let tenant B see or end tenant A's current placement", async () => {
    const h = harness("tenant-a");
    const requestA = requestFor(["hr_admin"], MANAGE, "tenant-a");
    await h.service.assignPrimary(requestA, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });

    // Tenant B has no seeded person/org unit -> ending is a clean not-found, never leaks tenant A data.
    const requestB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const end = await h.service.endAssignment(requestB, { personId: "p1", effectiveUntil: "2026-06-01" });
    expect(end.kind).toBe("validation_failure");

    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await h.reader.getCurrentForPerson(bContext, "p1")).toBeUndefined();
  });
});

describe("AssignmentService — transaction rollback", () => {
  it("releases no events/audit when rejected before writing (self-manager)", async () => {
    const { service, audit, events } = harness();
    await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", managerId: "p1", effectiveFrom: "2026-01-01" });
    expect(events.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });
});

describe("AssignmentService — Legal Entity (ADR-013 §3)", () => {
  it("assignPrimary stamps the new Assignment with the chosen OrgUnit's Legal Entity", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.legalEntityId).toBe("le1");
  });

  it("accepts a caller-asserted legalEntityId that matches the OrgUnit's actual Legal Entity", async () => {
    const { service } = harness();
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", legalEntityId: "le1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("success");
  });

  it("rejects a caller-asserted legalEntityId that does not match the OrgUnit's actual Legal Entity (cross-entity OrgUnit rejected server-side)", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getLegalEntityStore().legalEntities.push(legalEntity({ id: "le2", code: "LE2" }));
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", legalEntityId: "le2", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "orgUnitId" && i.code === "cross_entity")).toBe(true);
  });

  it("rejects placement into an OrgUnit whose Legal Entity is archived", async () => {
    const { service, unitOfWork } = harness();
    unitOfWork.getLegalEntityStore().legalEntities[0] = legalEntity({ status: "ARCHIVED" });
    const result = await service.assignPrimary(requestFor(["hr_admin"], MANAGE), { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "legalEntityId" && i.code === "archived")).toBe(true);
  });

  it("an ordinary transfer preserves the current placement's Legal Entity", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.legalEntityId).toBe("le1");
  });

  it("rejects transferring into an OrgUnit owned by a different Legal Entity (no inter-entity transfer in this slice)", async () => {
    const { service, request, unitOfWork } = await seedCurrent();
    unitOfWork.getLegalEntityStore().legalEntities.push(legalEntity({ id: "le2", code: "LE2" }));
    unitOfWork.getOrgUnitStore().units.push(Object.freeze({
      id: "ou2", tenantId: "tenant-a", legalEntityId: "le2", code: "OU2", name: "Unit 2", kind: "TEAM" as const, status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou2", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "orgUnitId" && i.code === "cross_entity")).toBe(true);
  });

  it("a manager-only change (transfer with the same org unit) preserves Legal Entity", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", managerId: "p2", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.legalEntityId).toBe("le1");
  });

  it("a location-only change (transfer with the same org unit) preserves Legal Entity", async () => {
    const { service, request } = await seedCurrent();
    const result = await service.transfer(request, { personId: "p1", orgUnitId: "ou1", locationId: "loc1", effectiveFrom: "2026-06-01" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.legalEntityId).toBe("le1");
  });
});
