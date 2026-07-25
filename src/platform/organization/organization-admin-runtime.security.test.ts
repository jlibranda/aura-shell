import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/platform/errors";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { createTrustedRequestContext, type TrustedRequestContext, type TrustedRequestContextInput } from "@/platform/runtime-context";

/**
 * Epic 7B.5 security matrix for the Settings > Organization admin
 * composition itself — org admin, org viewer, normal employee, and a second
 * tenant. Every guard here is enforced inside the already-tested read
 * repositories/services (organization.view / organization.manage checks run
 * before any Prisma call — see requireOrganizationView), so no live database
 * connection is needed: this test proves createOrganizationAdminRuntime's
 * wiring does not accidentally bypass or weaken those checks.
 */
function request(overrides: Partial<{ tenantId: string; roles: TrustedRequestContextInput["roles"]; permissions: TrustedRequestContextInput["permissions"] }> = {}): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s", userId: "user-1", tenantId: overrides.tenantId ?? "tenant-a", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles: overrides.roles ?? ["hr_admin"],
    permissions: overrides.permissions ?? ["organization.view", "organization.manage"],
    actorProvenance: "server_verified",
    correlationId: "corr-1",
  });
}

describe("organization admin runtime — permission matrix", () => {
  it("an org admin (organization.view + organization.manage) can read and is not denied by the write services", async () => {
    const runtime = createOrganizationAdminRuntime(request({ roles: ["hr_admin"], permissions: ["organization.view", "organization.manage"] }));
    await expect(runtime.orgUnits.read.listAll(runtime.context)).resolves.toEqual([]);
    const result = await runtime.orgUnits.service.createOrgUnit(request({ roles: ["hr_admin"], permissions: ["organization.view", "organization.manage"] }), { code: "X", name: "", kind: "TEAM" });
    // Reaches real validation (name required) rather than being denied at the authorization gate — proves it was not rejected for lack of permission.
    expect(result.kind).toBe("validation_failure");
  });

  it("an org viewer (organization.view only) can read but every write command is denied", async () => {
    const viewerRequest = request({ roles: ["auditor"], permissions: ["organization.view"] });
    const runtime = createOrganizationAdminRuntime(viewerRequest);
    await expect(runtime.orgUnits.read.listAll(runtime.context)).resolves.toEqual([]);
    await expect(runtime.locations.read.listAll(runtime.context)).resolves.toEqual([]);
    await expect(runtime.queries.resolveCurrentAssignments(runtime.context)).resolves.toEqual([]);

    const createOrgUnit = await runtime.orgUnits.service.createOrgUnit(viewerRequest, { code: "X", name: "X", kind: "TEAM" });
    expect(createOrgUnit.kind).toBe("authorization_failure");
    const createLocation = await runtime.locations.service.createLocation(viewerRequest, { code: "X", name: "X", address: { line1: "a", city: "b" }, countryCode: "PH", timezone: "Asia/Manila" });
    expect(createLocation.kind).toBe("authorization_failure");
    const assign = await runtime.assignments.service.assignPrimary(viewerRequest, { personId: "p1", orgUnitId: "ou1", effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(assign.kind).toBe("authorization_failure");
  });

  it("a normal employee (no organization.view) is denied even read access", async () => {
    const runtime = createOrganizationAdminRuntime(request({ roles: ["employee"], permissions: [] }));
    await expect(runtime.orgUnits.read.listAll(runtime.context)).rejects.toThrow(AuthorizationError);
    await expect(runtime.locations.read.listAll(runtime.context)).rejects.toThrow(AuthorizationError);
    await expect(runtime.queries.resolveCurrentAssignments(runtime.context)).rejects.toThrow(AuthorizationError);
  });

  it("a manager with no organization permissions is denied read access the same as any other unauthorized role", async () => {
    const runtime = createOrganizationAdminRuntime(request({ roles: ["manager"], permissions: [] }));
    await expect(runtime.orgUnits.read.listAll(runtime.context)).rejects.toThrow(AuthorizationError);
  });

  it("scopes to the requesting tenant — the runtime's context never carries another tenant's id", () => {
    const runtimeA = createOrganizationAdminRuntime(request({ tenantId: "tenant-a" }));
    const runtimeB = createOrganizationAdminRuntime(request({ tenantId: "tenant-b" }));
    expect(runtimeA.context.tenantId).toBe("tenant-a");
    expect(runtimeB.context.tenantId).toBe("tenant-b");
  });
});
