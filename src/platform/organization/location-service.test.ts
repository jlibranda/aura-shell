import { describe, expect, it } from "vitest";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { Permission, PlatformRole } from "@/platform/context";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryLocationUnitOfWork } from "@/platform/organization/in-memory-location-unit-of-work";
import { InMemoryLocationReadRepository } from "@/platform/organization/in-memory-location-repository";
import { LocationService } from "@/platform/organization/location-service";

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
const VALID_ADDRESS = { line1: "123 Ayala Ave", city: "Makati" };

function harness() {
  const audit = new InMemoryAuditCollector();
  const events = new InMemoryDomainEventCollector();
  const unitOfWork = new InMemoryLocationUnitOfWork(undefined, events, audit);
  const service = new LocationService(unitOfWork);
  const reader = new InMemoryLocationReadRepository(unitOfWork.getStore());
  const readContext = (tenantId: string) => ({ tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const });
  return { service, audit, events, unitOfWork, reader, readContext };
}

describe("LocationService — authorization", () => {
  it("denies create without organization.manage", async () => {
    const { service } = harness();
    const result = await service.createLocation(requestFor(["employee"], []), { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.kind).toBe("authorization_failure");
  });

  it("denies update and archive without organization.manage", async () => {
    const { service } = harness();
    const request = requestFor(["payroll"], ["organization.view"]);
    expect((await service.updateLocationDetails(request, { id: "x", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" })).kind).toBe("authorization_failure");
    expect((await service.archiveLocation(request, { id: "x" })).kind).toBe("authorization_failure");
  });
});

describe("LocationService — create", () => {
  it("creates a location and audits + emits an outbox-eligible event", async () => {
    const { service, audit, events } = harness();
    const result = await service.createLocation(requestFor(["hr_admin"], MANAGE), { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.location.code).toBe("HQ");
      expect(result.value.location.status).toBe("ACTIVE");
    }
    expect(events.list().map((e) => e.eventName)).toEqual(["organization.location.created"]);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0].metadata).toHaveProperty("code", "HQ");
  });

  it("rejects a duplicate code as a conflict", async () => {
    const { service } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    const dup = await service.createLocation(request, { code: "HQ", name: "Head Office 2", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(dup.kind).toBe("conflict");
  });

  it("returns validation failure for an unrecognized time zone without writing", async () => {
    const { service, unitOfWork } = harness();
    const result = await service.createLocation(requestFor(["hr_admin"], MANAGE), { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "not/a/zone" });
    expect(result.kind).toBe("validation_failure");
    expect(unitOfWork.getStore().locations).toHaveLength(0);
  });
});

describe("LocationService — updateLocationDetails", () => {
  async function seedLocation() {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("seed failed");
    return { ...h, request, id: created.value.location.id };
  }

  it("updates descriptive attributes (name changes, code and id stay as immutable identity)", async () => {
    const { service, request, id, events } = await seedLocation();
    const result = await service.updateLocationDetails(request, { id, name: "Head Office Tower", address: { line1: "456 Ayala Ave", city: "Makati" }, countryCode: "PH", timezone: "Asia/Singapore" });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.location.name).toBe("Head Office Tower");
      expect(result.value.location.id).toBe(id);
      expect(result.value.location.code).toBe("HQ");
      expect(result.value.location.timezone).toBe("Asia/Singapore");
    }
    expect(events.list().some((e) => e.eventName === "organization.location.updated")).toBe(true);
  });

  it("rejects updating a location that no longer exists", async () => {
    const { service, request } = await seedLocation();
    const result = await service.updateLocationDetails(request, { id: "ghost", name: "X", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(result.kind).toBe("validation_failure");
  });
});

describe("LocationService — archiveLocation", () => {
  it("archives a location (soft lifecycle — never a hard delete)", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("seed failed");

    const result = await h.service.archiveLocation(request, { id: created.value.location.id });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.location.status).toBe("ARCHIVED");
      expect(result.value.location.archivedAt).toBeDefined();
    }
    expect(h.events.list().some((e) => e.eventName === "organization.location.archived")).toBe(true);
  });

  it("rejects archiving an already-archived location as a conflict", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("seed failed");
    await h.service.archiveLocation(request, { id: created.value.location.id });
    const again = await h.service.archiveLocation(request, { id: created.value.location.id });
    expect(again.kind).toBe("conflict");
  });

  it("an archived location is excluded from active-only listings but remains resolvable by id", async () => {
    const h = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    const created = await h.service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("seed failed");
    await h.service.archiveLocation(request, { id: created.value.location.id });

    const context = h.readContext("tenant-a");
    expect(await h.reader.listActive(context)).toHaveLength(0);
    expect(await h.reader.listAll(context)).toHaveLength(1);
    expect((await h.reader.getById(context, created.value.location.id))?.status).toBe("ARCHIVED");
  });
});

describe("LocationService — tenant isolation", () => {
  it("does not let tenant B update or read tenant A's location", async () => {
    const { service, reader } = harness();
    const created = await service.createLocation(requestFor(["hr_admin"], MANAGE, "tenant-a"), { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    if (created.kind !== "success") throw new Error("create failed");

    const asB = requestFor(["hr_admin"], MANAGE, "tenant-b");
    const update = await service.updateLocationDetails(asB, { id: created.value.location.id, name: "Hijacked", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(update.kind).toBe("validation_failure");

    const bContext = { tenantId: "tenant-b", actorId: "u", actorName: "u", roles: ["hr_admin"] as PlatformRole[], permissions: { has: () => true, toArray: () => [] } as never, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" as const };
    expect(await reader.getById(bContext, created.value.location.id)).toBeUndefined();
  });
});

describe("LocationService — transaction rollback", () => {
  it("releases no events/audit when the operation is rejected before writing (duplicate code)", async () => {
    const { service, audit, events } = harness();
    const request = requestFor(["hr_admin"], MANAGE);
    await service.createLocation(request, { code: "HQ", name: "Head Office", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    const before = { events: events.list().length, audit: audit.list().length };
    await service.createLocation(request, { code: "HQ", name: "Dup", address: VALID_ADDRESS, countryCode: "PH", timezone: "Asia/Manila" });
    expect(events.list()).toHaveLength(before.events);
    expect(audit.list()).toHaveLength(before.audit);
  });
});
